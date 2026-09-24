import posixpath
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import PurePosixPath
from typing import Annotated, Final, Literal, TypedDict, assert_never

from pydantic import AwareDatetime, Field

from aqven.loader import within
from aqven.loader.layout import EXPERIMENT_FILES, entity_id
from aqven.runtime.address import ResourceModel
from aqven.series.feed import (
    FindingNotice,
    ResearchNotice,
    SeriesKey,
    SeriesProgressNotice,
    SeriesStartedNotice,
    SeriesStatusNotice,
)
from aqven.series.model import SeriesId, SeriesStatus
from aqven.server.workspace import TreeSnapshot
from aqven.spec import ExperimentId, FlowId

type ExperimentChangeKind = Literal["added", "modified", "deleted"]

EXPERIMENT_CHANGE_KINDS: Final[Mapping[tuple[bool, bool], ExperimentChangeKind]] = {
    (False, True): "added",
    (True, True): "modified",
    (True, False): "deleted",
}


class ResearchEventBase(ResourceModel):
    seq: Annotated[int, Field(ge=1)]
    at: AwareDatetime
    tree_hash: str


class ResearchSeriesBase(ResearchEventBase):
    series_id: SeriesId
    experiment_id: ExperimentId | None
    flow_id: FlowId | None


class SeriesStartedEvent(ResearchSeriesBase):
    type: Literal["series_started"] = "series_started"
    status: SeriesStatus
    total: Annotated[int, Field(ge=0)]


class SeriesProgressEvent(ResearchSeriesBase):
    type: Literal["series_progress"] = "series_progress"
    done: Annotated[int, Field(ge=0)]
    total: Annotated[int, Field(ge=0)]
    spend_usd: Decimal


class SeriesStatusChanged(ResearchSeriesBase):
    type: Literal["series_status_changed"] = "series_status_changed"
    status: SeriesStatus
    previous: SeriesStatus | None


class FindingWritten(ResearchEventBase):
    type: Literal["finding_written"] = "finding_written"
    experiment_id: ExperimentId
    series_id: SeriesId
    paths: tuple[str, ...]


class ExperimentChanged(ResearchEventBase):
    type: Literal["experiment_changed"] = "experiment_changed"
    experiment_id: ExperimentId
    change: ExperimentChangeKind
    paths: tuple[str, ...]


type ResearchEvent = SeriesStartedEvent | SeriesProgressEvent | SeriesStatusChanged | FindingWritten | ExperimentChanged


@dataclass(frozen=True, slots=True)
class EventStamp:
    seq: int
    at: datetime
    tree_hash: str


class SeriesFields(TypedDict):
    seq: int
    at: datetime
    tree_hash: str
    series_id: SeriesId
    experiment_id: ExperimentId | None
    flow_id: FlowId | None


@dataclass(frozen=True, slots=True)
class ExperimentTouch:
    experiment_id: ExperimentId
    change: ExperimentChangeKind
    paths: tuple[str, ...]

    def event(self, stamp: EventStamp) -> ExperimentChanged:
        return ExperimentChanged(
            seq=stamp.seq,
            at=stamp.at,
            tree_hash=stamp.tree_hash,
            experiment_id=self.experiment_id,
            change=self.change,
            paths=self.paths,
        )


def series_fields(key: SeriesKey, stamp: EventStamp) -> SeriesFields:
    return SeriesFields(
        seq=stamp.seq,
        at=stamp.at,
        tree_hash=stamp.tree_hash,
        series_id=key.series_id,
        experiment_id=key.experiment_id,
        flow_id=key.flow_id,
    )


def started_event(notice: SeriesStartedNotice, stamp: EventStamp) -> SeriesStartedEvent:
    return SeriesStartedEvent(**series_fields(notice.series, stamp), status=notice.status, total=notice.total)


def progress_event(notice: SeriesProgressNotice, stamp: EventStamp) -> SeriesProgressEvent:
    fields = series_fields(notice.series, stamp)
    return SeriesProgressEvent(**fields, done=notice.done, total=notice.total, spend_usd=notice.spend_usd)


def status_event(notice: SeriesStatusNotice, stamp: EventStamp) -> SeriesStatusChanged:
    return SeriesStatusChanged(**series_fields(notice.series, stamp), status=notice.status, previous=notice.previous)


def finding_event(notice: FindingNotice, stamp: EventStamp) -> FindingWritten:
    return FindingWritten(
        seq=stamp.seq,
        at=stamp.at,
        tree_hash=stamp.tree_hash,
        experiment_id=notice.experiment_id,
        series_id=notice.series_id,
        paths=notice.paths,
    )


def research_event(notice: ResearchNotice, stamp: EventStamp) -> ResearchEvent:
    match notice:
        case SeriesStartedNotice():
            return started_event(notice, stamp)
        case SeriesProgressNotice():
            return progress_event(notice, stamp)
        case SeriesStatusNotice():
            return status_event(notice, stamp)
        case FindingNotice():
            return finding_event(notice, stamp)
        case _:
            assert_never(notice)


def experiment_folders(snapshot: TreeSnapshot) -> Mapping[ExperimentId, str]:
    declared = (path for path in snapshot.files if PurePosixPath(path).name in EXPERIMENT_FILES)
    return {ExperimentId(entity_id(path)): folder for path in declared if (folder := posixpath.dirname(path))}


def experiment_touches(before: TreeSnapshot, after: TreeSnapshot, paths: Sequence[str]) -> tuple[ExperimentTouch, ...]:
    old = experiment_folders(before)
    new = experiment_folders(after)
    found = (_touch(experiment_id, old, new, paths) for experiment_id in sorted({*old, *new}))
    return tuple(touch for touch in found if touch is not None)


def _touch(
    experiment_id: ExperimentId, old: Mapping[ExperimentId, str], new: Mapping[ExperimentId, str], paths: Sequence[str]
) -> ExperimentTouch | None:
    folders = {folder for folder in (old.get(experiment_id), new.get(experiment_id)) if folder is not None}
    touched = tuple(path for path in paths if any(within(path, folder) for folder in folders))
    if not touched:
        return None
    change = EXPERIMENT_CHANGE_KINDS[(experiment_id in old, experiment_id in new)]
    return ExperimentTouch(experiment_id=experiment_id, change=change, paths=touched)
