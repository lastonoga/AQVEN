from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Final, Literal, Protocol

from aqven.engine.projection import RunFold, fold_events
from aqven.engine.reader import TERMINAL_DBOS_STATUSES
from aqven.engine.request import RunCall
from aqven.runtime.address import RunId
from aqven.runtime.events import NodeAttemptDiscarded, NodeOutputDelta, RunEvent
from aqven.runtime.runs import NodeCounts
from aqven.runtime.vocabulary import RunMode, RunStatus, TerminalRunStatus
from aqven.spec import FlowId

QUEUED_DBOS_STATUSES: Final = frozenset({"ENQUEUED", "DELAYED"})
STEP_WRITTEN_EVENTS: Final = (NodeOutputDelta, NodeAttemptDiscarded)
MILLISECONDS: Final = 1000
MICROSECOND: Final = timedelta(microseconds=1)
EPOCH: Final = datetime(1970, 1, 1, tzinfo=UTC)

type Admission = Literal["pending", "listed", "rejected"]


def epoch_time(stamp: int | None) -> datetime:
    return datetime.fromtimestamp((stamp or 0) / MILLISECONDS, UTC)


def epoch_microseconds(moment: datetime) -> int:
    return (moment - EPOCH) // MICROSECOND


def fold_cost(fold: RunFold) -> tuple[Decimal, int, int]:
    finished = fold.finished
    if finished is not None and (finished.cost_usd or finished.tokens_in or finished.tokens_out):
        return finished.cost_usd, finished.tokens_in, finished.tokens_out
    executions = fold.executions.values()
    return (
        sum((execution.cost_usd for execution in executions), Decimal(0)),
        sum(execution.tokens_in for execution in executions),
        sum(execution.tokens_out for execution in executions),
    )


def sink_position(events: Sequence[RunEvent]) -> int:
    return sum(1 for event in events if not isinstance(event, STEP_WRITTEN_EVENTS))


@dataclass(frozen=True, slots=True)
class ProjectedRun:
    run_id: RunId
    last_seq: int
    finished_status: TerminalRunStatus | None
    finished_at: datetime | None
    cost_usd: Decimal
    tokens_in: int
    tokens_out: int
    node_counts: NodeCounts
    content_hash: str

    @property
    def settled(self) -> bool:
        return self.finished_status is not None


def projected_run(run_id: RunId, last_seq: int, fold: RunFold) -> ProjectedRun:
    cost, tokens_in, tokens_out = fold_cost(fold)
    started = fold.started
    finished = fold.finished
    return ProjectedRun(
        run_id=run_id,
        last_seq=last_seq,
        finished_status=None if finished is None else finished.status,
        finished_at=None if finished is None else finished.at,
        cost_usd=cost,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        node_counts=fold.node_counts(),
        content_hash="" if started is None else started.content_hash,
    )


def folded_run(run_id: RunId, events: Sequence[RunEvent]) -> ProjectedRun:
    return projected_run(run_id, sink_position(events), fold_events(events))


@dataclass(frozen=True, slots=True)
class ObservedStatus:
    run_id: RunId
    dbos_status: str
    closed_at: int

    @property
    def terminal(self) -> bool:
        return self.dbos_status in TERMINAL_DBOS_STATUSES


@dataclass(frozen=True, slots=True)
class ObservedRun:
    status: ObservedStatus
    created_at: int
    forked_from: RunId | None
    call: RunCall | None

    @property
    def run_id(self) -> RunId:
        return self.status.run_id


@dataclass(frozen=True, slots=True)
class AdmittedRun:
    status: ObservedStatus
    created_at: int
    forked_from: RunId | None
    call: RunCall


def admitted_run(observed: ObservedRun) -> AdmittedRun | None:
    if observed.call is None:
        return None
    return AdmittedRun(
        status=observed.status,
        created_at=observed.created_at,
        forked_from=observed.forked_from,
        call=observed.call,
    )


@dataclass(frozen=True, slots=True)
class OpenRow:
    run_id: RunId
    pending: bool
    finished: bool
    dbos_status: str | None
    closed_at: int | None

    def unchanged(self, status: ObservedStatus) -> bool:
        return (self.dbos_status, self.closed_at) == (status.dbos_status, status.closed_at)


@dataclass(frozen=True, slots=True)
class SummaryChanges:
    admitted: tuple[AdmittedRun, ...] = ()
    rejected: tuple[RunId, ...] = ()
    observed: tuple[ObservedStatus, ...] = ()
    projected: tuple[ProjectedRun, ...] = ()
    settled: tuple[RunId, ...] = ()

    @property
    def empty(self) -> bool:
        return not (self.admitted or self.rejected or self.observed or self.projected or self.settled)


@dataclass(frozen=True, slots=True)
class SummarySelection:
    limit: int
    offset: int = 0
    flow_id: FlowId | None = None
    base_status: RunStatus | None = None
    mode: RunMode | None = None
    parent_run_id: RunId | None = None
    since_us: int | None = None
    until_us: int | None = None
    only: tuple[RunId, ...] | None = None
    excluded: tuple[RunId, ...] | None = None
    ranks: tuple[RunId, ...] | None = None


class SummaryWriter(Protocol):
    async def apply(self, changes: SummaryChanges) -> None: ...


class WorkflowCatalog(Protocol):
    async def run_ids(self) -> tuple[RunId, ...]: ...

    async def observe(self, run_ids: Sequence[RunId], *, with_call: bool) -> tuple[ObservedRun, ...]: ...


class StoredEvents(Protocol):
    async def stored(self, run_id: RunId) -> tuple[RunEvent, ...]: ...
