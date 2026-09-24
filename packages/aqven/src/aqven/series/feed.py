from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Protocol

from aqven.series.model import ExperimentOrigin, SeriesId, SeriesRecord, SeriesStatus
from aqven.spec import ExperimentId, FlowId


@dataclass(frozen=True, slots=True)
class SeriesKey:
    series_id: SeriesId
    experiment_id: ExperimentId | None
    flow_id: FlowId | None


@dataclass(frozen=True, slots=True)
class SeriesStartedNotice:
    series: SeriesKey
    status: SeriesStatus
    total: int


@dataclass(frozen=True, slots=True)
class SeriesProgressNotice:
    series: SeriesKey
    done: int
    total: int
    spend_usd: Decimal

    @property
    def complete(self) -> bool:
        return self.done >= self.total


@dataclass(frozen=True, slots=True)
class SeriesStatusNotice:
    series: SeriesKey
    status: SeriesStatus
    previous: SeriesStatus | None


@dataclass(frozen=True, slots=True)
class FindingNotice:
    experiment_id: ExperimentId
    series_id: SeriesId
    paths: tuple[str, ...]


type ResearchNotice = SeriesStartedNotice | SeriesProgressNotice | SeriesStatusNotice | FindingNotice


class ResearchFeed(Protocol):
    def publish(self, notice: ResearchNotice) -> None: ...


@dataclass(frozen=True, slots=True)
class SilentFeed:
    def publish(self, notice: ResearchNotice) -> None:
        return None


SILENT_FEED: Final = SilentFeed()


def series_key(record: SeriesRecord) -> SeriesKey:
    origin = record.origin
    experiment = origin.experiment_id if isinstance(origin, ExperimentOrigin) else None
    return SeriesKey(series_id=record.series_id, experiment_id=experiment, flow_id=record.flow_id)


def notice_series(notice: ResearchNotice) -> SeriesId:
    return notice.series_id if isinstance(notice, FindingNotice) else notice.series.series_id
