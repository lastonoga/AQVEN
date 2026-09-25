import posixpath
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Final

from aqven.diagnostics import Severity
from aqven.loader.layout import EXPERIMENT_NOTES, FINDINGS_FOLDER, ancestors
from aqven.series.model import SeriesStatus
from aqven.series.views import ActivitySource, AttentionReason, LatestSeries, SeriesSummaryView
from aqven.server.views.common import diagnostics_within
from aqven.server.workspace import FileStat, TreeSnapshot, WorkspaceState
from aqven.spec import VerdictState

NANOSECONDS: Final = 1_000_000_000
LIVE_STATUSES: Final = frozenset({SeriesStatus.RUNNING, SeriesStatus.WAITING_HUMAN})
APPROVAL_STATUSES: Final = frozenset({SeriesStatus.AWAITING_APPROVAL})
FINDINGS_PREFIX: Final = f"{FINDINGS_FOLDER}/"


class FileRole(StrEnum):
    INPUT = "input"
    NOTES = "notes"
    FINDING = "finding"


SHOWN_ROLES: Final = frozenset({FileRole.INPUT, FileRole.NOTES})
INPUT_ROLES: Final = frozenset({FileRole.INPUT})


def series_touched(row: SeriesSummaryView) -> datetime:
    return max(row.started_at, row.finished_at or row.started_at)


def series_order(row: SeriesSummaryView) -> tuple[datetime, str]:
    return row.started_at, row.series_id


@dataclass(frozen=True, slots=True)
class SeriesLedger:
    rows: tuple[SeriesSummaryView, ...] = ()

    @property
    def newest(self) -> SeriesSummaryView | None:
        return max(self.rows, key=series_order, default=None)

    @property
    def latest(self) -> LatestSeries | None:
        newest = self.newest
        if newest is None:
            return None
        verdict = None if newest.verdict is None else newest.verdict.state
        return LatestSeries(series_id=newest.series_id, on=newest.on, status=newest.status, verdict=verdict)

    @property
    def count(self) -> int:
        return len(self.rows)

    @property
    def spent_usd(self) -> Decimal:
        return sum((row.spend.usd for row in self.rows), Decimal(0))

    @property
    def touched_at(self) -> datetime | None:
        return max((series_touched(row) for row in self.rows), default=None)

    def any_in(self, statuses: frozenset[SeriesStatus]) -> bool:
        return any(row.status in statuses for row in self.rows)


EMPTY_LEDGER: Final = SeriesLedger()


@dataclass(frozen=True, slots=True)
class FolderTimes:
    created: datetime | None = None
    changed: datetime | None = None
    inputs_changed: datetime | None = None


UNSEEN_FOLDER: Final = FolderTimes()


@dataclass(frozen=True, slots=True)
class ActivityFacts:
    ledger: SeriesLedger
    times: FolderTimes
    errors: int


@dataclass(frozen=True, slots=True)
class ActivityStamp:
    moment: datetime
    source: ActivitySource


@dataclass(frozen=True, slots=True)
class ExperimentActivity:
    created: datetime | None
    last_activity: datetime | None
    activity_source: ActivitySource | None
    running: bool
    attention: tuple[AttentionReason, ...]


def moment_of(mtime_ns: int | None) -> datetime | None:
    if mtime_ns is None:
        return None
    return datetime.fromtimestamp(mtime_ns / NANOSECONDS, UTC)


def file_role(folder: str, path: str) -> FileRole:
    relative = path.removeprefix(f"{folder}/")
    if relative.startswith(FINDINGS_PREFIX):
        return FileRole.FINDING
    if relative == EXPERIMENT_NOTES:
        return FileRole.NOTES
    return FileRole.INPUT


def owning_folder(path: str, folders: frozenset[str]) -> str | None:
    return next((folder for folder in ancestors(posixpath.dirname(path)) if folder in folders), None)


def times_of(folder: str, files: Sequence[FileStat]) -> FolderTimes:
    roles = [(file_role(folder, stat.path), stat.mtime_ns) for stat in files]
    shown = [mtime for role, mtime in roles if role in SHOWN_ROLES]
    inputs = [mtime for role, mtime in roles if role in INPUT_ROLES]
    return FolderTimes(
        created=moment_of(min(shown, default=None)),
        changed=moment_of(max(shown, default=None)),
        inputs_changed=moment_of(max(inputs, default=None)),
    )


def folder_times(snapshot: TreeSnapshot, folders: Iterable[str]) -> Mapping[str, FolderTimes]:
    wanted = frozenset(folders)
    grouped: dict[str, list[FileStat]] = {folder: [] for folder in wanted}
    for stat in snapshot.files.values():
        folder = owning_folder(stat.path, wanted)
        if folder is not None:
            grouped[folder].append(stat)
    return {folder: times_of(folder, files) for folder, files in grouped.items()}


def error_count(state: WorkspaceState, folder: str) -> int:
    return sum(1 for item in diagnostics_within(state, folder) if item.severity is Severity.ERROR)


def latest_invalid(facts: ActivityFacts) -> bool:
    latest = facts.ledger.latest
    return latest is not None and latest.verdict is VerdictState.INVALID


def results_stale(facts: ActivityFacts) -> bool:
    newest = facts.ledger.newest
    changed = facts.times.inputs_changed
    if newest is None or changed is None:
        return False
    return newest.status is SeriesStatus.DONE and changed > newest.started_at


ATTENTION_RULES: Final[Mapping[AttentionReason, Callable[[ActivityFacts], bool]]] = {
    "spend_cap_pause": lambda facts: facts.ledger.any_in(APPROVAL_STATUSES),
    "series_invalid": latest_invalid,
    "results_stale": results_stale,
    "check_errors": lambda facts: facts.errors > 0,
}


def attention(facts: ActivityFacts) -> tuple[AttentionReason, ...]:
    return tuple(reason for reason, applies in ATTENTION_RULES.items() if applies(facts))


def activity_stamps(facts: ActivityFacts) -> tuple[ActivityStamp, ...]:
    candidates: tuple[tuple[datetime | None, ActivitySource], ...] = (
        (facts.times.changed, "files"),
        (facts.ledger.touched_at, "series"),
    )
    return tuple(ActivityStamp(moment, source) for moment, source in candidates if moment is not None)


def last_stamp(facts: ActivityFacts) -> ActivityStamp | None:
    return max(activity_stamps(facts), key=lambda stamp: stamp.moment, default=None)


def experiment_activity(facts: ActivityFacts) -> ExperimentActivity:
    last = last_stamp(facts)
    return ExperimentActivity(
        created=facts.times.created,
        last_activity=None if last is None else last.moment,
        activity_source=None if last is None else last.source,
        running=facts.ledger.any_in(LIVE_STATUSES),
        attention=attention(facts),
    )
