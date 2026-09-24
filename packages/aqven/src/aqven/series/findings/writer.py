import asyncio
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from pydantic import ValidationError

from aqven.client.ids import ULID_RANDOM_BITS, encode_ulid
from aqven.loader import load_project, read_strict_yaml
from aqven.runtime.address import ClientOpId
from aqven.series.feed import SILENT_FEED, FindingNotice, ResearchFeed
from aqven.series.findings.layout import FINDING_GLOB, FINDINGS_FILE, finding_file
from aqven.series.findings.render import finding_bytes, render_findings_md
from aqven.series.findings.summary import FIRST_LOOK, FindingError, finding_at_look, finding_hash, finding_of
from aqven.series.model import AttemptRecord, ExperimentOrigin, SeriesId, SeriesRecord
from aqven.spec import ExperimentId, ExperimentSpec, FindingSpec, LookQuestion, SeriesSplit, VerdictState
from aqven.write import WriteService
from aqven.write.errors import WriteError
from aqven.write.model import ExpectedFile, FilesWriteRequest
from aqven.write.paths import disk_hash
from aqven.write.service import SYSTEM_ACTOR

PUBLISHED_STATES: Final = frozenset(
    {VerdictState.CONFIRMED, VerdictState.REFUTED, VerdictState.INCONCLUSIVE, VerdictState.SIGNAL}
)
WRITE_ATTEMPTS: Final = 3
FINDING_OP_NAME: Final = "finding"
ID_BYTE_ORDER: Final = "big"


class FindingNotWritten(FindingError):
    pass


@dataclass(frozen=True, slots=True)
class StoredFinding:
    path: str
    spec: FindingSpec


def finding_path(experiment_id: ExperimentId, series_id: SeriesId) -> str:
    return finding_file(experiment_id, series_id)


def finding_op_id(series_id: SeriesId) -> ClientOpId:
    value = int.from_bytes(uuid.uuid5(uuid.UUID(series_id), FINDING_OP_NAME).bytes, ID_BYTE_ORDER)
    return encode_ulid(value >> ULID_RANDOM_BITS, value)


def publishable_experiment(record: SeriesRecord) -> ExperimentId | None:
    origin = record.origin
    verdict = record.verdict
    if record.on is not SeriesSplit.HOLDOUT or not isinstance(origin, ExperimentOrigin):
        return None
    if verdict is None or verdict.state not in PUBLISHED_STATES:
        return None
    if record.plan.question is None or isinstance(record.plan.question, LookQuestion):
        return None
    return origin.experiment_id


def stored_findings(root: Path) -> tuple[StoredFinding, ...]:
    found = (_stored(root, location) for location in sorted(root.glob(FINDING_GLOB)))
    return tuple(item for item in found if item is not None)


def _stored(root: Path, location: Path) -> StoredFinding | None:
    relative = location.relative_to(root).as_posix()
    try:
        text = location.read_text(encoding="utf-8")
    except OSError, UnicodeDecodeError:
        return None
    document, _ = read_strict_yaml(text, relative)
    if document is None:
        return None
    try:
        spec = FindingSpec.model_validate(document.data)
    except ValidationError:
        return None
    return StoredFinding(relative, spec) if _intact(relative, spec) else None


def _intact(relative: str, spec: FindingSpec) -> bool:
    return relative == finding_file(spec.experiment, spec.series) and finding_hash(spec) == spec.self_sha256


def _same_cases(stored: StoredFinding, spec: FindingSpec) -> bool:
    return stored.spec.experiment == spec.experiment and (
        stored.spec.scope.case_names_sha256 == spec.scope.case_names_sha256
    )


@dataclass(frozen=True, slots=True)
class FileFindings:
    writer: WriteService
    root: Path
    feed: ResearchFeed = SILENT_FEED

    async def publish(self, record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> str | None:
        experiment_id = publishable_experiment(record)
        if experiment_id is None:
            return None
        path = await asyncio.to_thread(self._publish, record, experiment_id, tuple(attempts))
        notice = FindingNotice(experiment_id=experiment_id, series_id=record.series_id, paths=(path, FINDINGS_FILE))
        self.feed.publish(notice)
        return path

    def _publish(self, record: SeriesRecord, experiment_id: ExperimentId, attempts: Sequence[AttemptRecord]) -> str:
        experiment = self._experiment(record.series_id, experiment_id)
        path = finding_path(experiment_id, record.series_id)
        for _ in range(WRITE_ATTEMPTS):
            if self._written(record, experiment, attempts, path):
                return path
        reason = f"{FINDINGS_FILE} kept changing during {WRITE_ATTEMPTS} attempts to write {path}"
        raise FindingNotWritten(record.series_id, reason)

    def _experiment(self, series_id: SeriesId, experiment_id: ExperimentId) -> ExperimentSpec:
        project = load_project(self.root).project
        loaded = None if project is None else project.experiments.get(experiment_id)
        if loaded is None:
            raise FindingNotWritten(series_id, f"experiment {experiment_id} does not load from the project files")
        return loaded.source.spec

    def _written(
        self, record: SeriesRecord, experiment: ExperimentSpec, attempts: Sequence[AttemptRecord], path: str
    ) -> bool:
        summary_hash = disk_hash(self.root, FINDINGS_FILE)
        others = tuple(item for item in stored_findings(self.root) if item.spec.series != record.series_id)
        spec = self._spec(record, experiment, attempts, others)
        data = finding_bytes(spec)
        summary = render_findings_md(
            (*(item.spec for item in others), spec), {item.spec.series: item.path for item in others}
        )
        request = FilesWriteRequest(
            expects=[ExpectedFile(path=path, file_hash=None), ExpectedFile(path=FINDINGS_FILE, file_hash=summary_hash)],
            files={path: data.decode("utf-8"), FINDINGS_FILE: summary},
            client_op_id=finding_op_id(record.series_id),
            intent=f"finding of series {record.series_id}",
        )
        try:
            self.writer.write_files(request, SYSTEM_ACTOR)
        except WriteError as error:
            return self._settled(error, record.series_id, path, data)
        return True

    def _spec(
        self,
        record: SeriesRecord,
        experiment: ExperimentSpec,
        attempts: Sequence[AttemptRecord],
        others: Sequence[StoredFinding],
    ) -> FindingSpec:
        draft = finding_of(record, experiment, attempts)
        looks = FIRST_LOOK + sum(1 for item in others if _same_cases(item, draft))
        return draft if looks == FIRST_LOOK else finding_at_look(record, experiment, attempts, looks)

    def _settled(self, error: WriteError, series_id: SeriesId, path: str, data: bytes) -> bool:
        conflicted = None if error.conflict is None else error.conflict.path
        if conflicted == path and self._holds(path, data):
            return True
        if conflicted == FINDINGS_FILE:
            return False
        raise FindingNotWritten(series_id, error.message) from error

    def _holds(self, path: str, data: bytes) -> bool:
        target = self.root / path
        return target.is_file() and target.read_bytes() == data
