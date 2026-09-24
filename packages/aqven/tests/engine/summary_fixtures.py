from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Final, Literal

from dbos import WorkflowStatus

from aqven.engine.facade import RunRecordView
from aqven.engine.listing import WorkflowFilters
from aqven.engine.projection import fold_events
from aqven.engine.reader import TERMINAL_DBOS_STATUSES
from aqven.engine.request import RunCall, RunSpec, SeriesTag
from aqven.engine.summaries import ObservedRun, ObservedStatus, SummaryChanges, SummarySelection
from aqven.engine.summaries.model import Admission, OpenRow
from aqven.engine.summaries.store import SqliteRunSummaryStore, SummaryPage, SummaryRecord
from aqven.runtime.address import RunId, node_address
from aqven.runtime.events import (
    NodeFinished,
    NodeOutputDelta,
    NodeStarted,
    RunEvent,
    RunFinished,
    RunStartedEvent,
)
from aqven.runtime.executions import RunError
from aqven.runtime.human import HumanWait, OpenWaitFilter
from aqven.runtime.runs import RunSummary
from aqven.runtime.vocabulary import FinishedExecutionStatus, RunMode, TerminalRunStatus
from aqven.spec import ArmId, ExperimentId, FlowId, NodeId, NodeKind, TypeId

type DbosStatus = Literal["PENDING", "SUCCESS", "ERROR", "CANCELLED", "ENQUEUED", "MAX_RECOVERY_ATTEMPTS_EXCEEDED"]

NOW: Final = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)
FLOW: Final = FlowId("support_case")
OTHER_FLOW: Final = FlowId("panel")
LEAD: Final = "support_lead"
EDITOR: Final = "brand_editor"
ORDER: Final = ("clean", "reply", "review")
CONTENT_HASH: Final = "sha256-" + "a" * 64
MILLISECONDS: Final = 1000


def run_id(number: int) -> RunId:
    return RunId(f"01a0aa21-b9a7-74fb-b1f3-{number:012d}")


def stamp(minutes: float) -> int:
    return int((NOW + timedelta(minutes=minutes)).timestamp() * MILLISECONDS)


def moment(offset: int) -> datetime:
    return NOW + timedelta(seconds=offset, microseconds=offset * 7)


@dataclass(slots=True)
class EventScript:
    run_id: RunId
    events: list[RunEvent] = field(default_factory=list[RunEvent])

    @property
    def seq(self) -> int:
        return len(self.events) + 1

    def started(self, flow_id: FlowId, mode: RunMode) -> EventScript:
        self.events.append(
            RunStartedEvent(
                seq=self.seq,
                at=moment(self.seq),
                run_id=self.run_id,
                flow_id=flow_id,
                content_hash=CONTENT_HASH,
                mode=mode,
                order=ORDER,
                input_ref=None,
            )
        )
        return self

    def node(self, node_id: str) -> EventScript:
        self.events.append(
            NodeStarted(
                seq=self.seq,
                at=moment(self.seq),
                run_id=self.run_id,
                address=node_address(node_id),
                kind=NodeKind.CODE,
                attempt=1,
                queued_ms=0,
            )
        )
        return self

    def delta(self, node_id: str) -> EventScript:
        self.events.append(
            NodeOutputDelta(
                seq=self.seq,
                at=moment(self.seq),
                run_id=self.run_id,
                address=node_address(node_id),
                attempt=1,
                part_kind="text",
                part_index=0,
                delta="partial",
                cumulative_length=7,
            )
        )
        return self

    def done(self, node_id: str, status: FinishedExecutionStatus = "ok", cost: str = "0.0012") -> EventScript:
        self.events.append(
            NodeFinished(
                seq=self.seq,
                at=moment(self.seq),
                run_id=self.run_id,
                address=node_address(node_id),
                status=status,
                attempt=1,
                output_ref=None,
                cost_usd=Decimal(cost),
                tokens_in=11,
                tokens_out=7,
                latency_ms=5,
                model="openai:tiny",
                cache_hit=False,
                degraded=False,
                checks_failed=0,
            )
        )
        return self

    def finished(self, status: TerminalRunStatus, cost: str = "0.0031") -> EventScript:
        self.events.append(
            RunFinished(
                seq=self.seq,
                at=moment(self.seq),
                run_id=self.run_id,
                status=status,
                output_ref=None,
                error=None,
                cost_usd=Decimal(cost),
                tokens_in=22 if Decimal(cost) else 0,
                tokens_out=14 if Decimal(cost) else 0,
            )
        )
        return self

    def log(self) -> tuple[RunEvent, ...]:
        return tuple(self.events)


def script(number: int) -> EventScript:
    return EventScript(run_id(number))


@dataclass(frozen=True, slots=True)
class FixtureRun:
    run_id: RunId
    dbos_status: DbosStatus
    created_at: int
    call: RunCall | None
    events: tuple[RunEvent, ...] = ()
    updated_at: int | None = None
    forked_from: RunId | None = None

    @property
    def closed_at(self) -> int:
        return self.updated_at or self.created_at

    def workflow_status(self) -> WorkflowStatus:
        status = WorkflowStatus()
        status.workflow_id = self.run_id
        status.status = self.dbos_status
        status.created_at = self.created_at
        status.updated_at = self.updated_at
        status.forked_from = self.forked_from
        status.error = RuntimeError("executor crashed") if self.dbos_status in ("ERROR",) else None
        return status

    def observed(self, with_call: bool) -> ObservedRun:
        return ObservedRun(
            status=ObservedStatus(run_id=self.run_id, dbos_status=self.dbos_status, closed_at=self.closed_at),
            created_at=self.created_at,
            forked_from=self.forked_from,
            call=self.call if with_call else None,
        )

    def closing(self) -> tuple[RunEvent, ...]:
        terminal = TERMINAL_DBOS_STATUSES.get(self.dbos_status)
        if terminal is None or (self.events and isinstance(self.events[-1], RunFinished)):
            return ()
        error = None if terminal != "failed" else RunError(code="INTERNAL", message="crashed", address=None)
        return (
            RunFinished(
                seq=len(self.events) + 1,
                at=datetime.fromtimestamp(self.closed_at / MILLISECONDS, UTC),
                run_id=self.run_id,
                status=terminal,
                output_ref=None,
                error=error,
                cost_usd=Decimal(0),
                tokens_in=0,
                tokens_out=0,
            ),
        )


def call_of(
    flow_id: FlowId,
    mode: RunMode = "live",
    *,
    dataset_item_id: str | None = None,
    selected_nodes: tuple[NodeId, ...] | None = None,
    series: SeriesTag | None = None,
) -> RunCall:
    spec = RunSpec(
        flow_id=flow_id, mode=mode, dataset_item_id=dataset_item_id, selected_nodes=selected_nodes, series=series
    )
    return RunCall(ir_hash="ir-" + "b" * 16, flow_input={"text": "lamp"}, spec=spec)


def series_tag() -> SeriesTag:
    return SeriesTag(
        series_id="series-1",
        attempt_id="attempt-1",
        role="subject",
        variant_id="writer",
        case_name="bulb",
        repeat=1,
        experiment_id=ExperimentId("triage_solo"),
        arm_id=ArmId("solo"),
    )


def human_wait(assignee: str, deadline: datetime, node_id: str = "review") -> HumanWait:
    return HumanWait(
        address=node_address(node_id),
        wait_kind="form",
        attempt=1,
        state="waiting",
        assignee=assignee,
        waiting_since=NOW,
        deadline_at=deadline,
        on_timeout="fail",
        form_type_id=TypeId("ReviewDecision"),
    )


def wait_matches(wanted: OpenWaitFilter, wait: HumanWait) -> bool:
    checks = (
        wanted.assignee is None or wanted.assignee == wait.assignee,
        wanted.deadline_before is None or wait.deadline_at < wanted.deadline_before,
        wanted.overdue_at is None or wait.deadline_at < wanted.overdue_at,
        wanted.upcoming_at is None or wait.deadline_at >= wanted.upcoming_at,
    )
    return all(checks)


@dataclass(slots=True)
class FakeWaits:
    entries: dict[RunId, tuple[HumanWait, ...]] = field(default_factory=dict[RunId, tuple[HumanWait, ...]])
    calls: Counter[str] = field(default_factory=Counter[str])
    asked: list[int] = field(default_factory=list[int])

    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]:
        self.calls["open_runs"] += 1
        found = [
            (wait.deadline_at, owner)
            for owner, waits in self.entries.items()
            for wait in waits
            if wait_matches(wanted, wait)
        ]
        return tuple(dict.fromkeys(owner for _, owner in sorted(found)))

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        self.calls["waits"] += 1
        return tuple(sorted(self.entries.get(run_id, ()), key=lambda wait: wait.deadline_at))

    async def waits_of(self, run_ids: Sequence[RunId]) -> Mapping[RunId, tuple[HumanWait, ...]]:
        self.calls["waits_of"] += 1
        self.asked.append(len(run_ids))
        return {owner: await self.waits(owner) for owner in run_ids if owner in self.entries}


@dataclass(slots=True)
class FakeCatalog:
    runs: dict[RunId, FixtureRun]
    calls: Counter[str] = field(default_factory=Counter[str])
    observed_ids: list[int] = field(default_factory=list[int])

    async def run_ids(self) -> tuple[RunId, ...]:
        self.calls["run_ids"] += 1
        return tuple(self.runs)

    async def observe(self, run_ids: Sequence[RunId], *, with_call: bool) -> tuple[ObservedRun, ...]:
        if not run_ids:
            return ()
        self.calls["observe"] += 1
        self.observed_ids.append(len(run_ids))
        return tuple(self.runs[owner].observed(with_call) for owner in run_ids if owner in self.runs)


@dataclass(slots=True)
class FakeEvents:
    runs: dict[RunId, FixtureRun]
    reads: list[RunId] = field(default_factory=list[RunId])

    async def stored(self, run_id: RunId) -> tuple[RunEvent, ...]:
        self.reads.append(run_id)
        return self.runs[run_id].events


@dataclass(slots=True)
class CountingStore:
    inner: SqliteRunSummaryStore
    calls: Counter[str] = field(default_factory=Counter[str])

    async def apply(self, changes: SummaryChanges) -> None:
        self.calls["apply"] += 1
        await self.inner.apply(changes)

    async def admissions(self) -> Mapping[RunId, Admission]:
        self.calls["admissions"] += 1
        return await self.inner.admissions()

    async def open_rows(self) -> tuple[OpenRow, ...]:
        self.calls["open_rows"] += 1
        return await self.inner.open_rows()

    async def page(self, selection: SummarySelection) -> SummaryPage:
        self.calls["page"] += 1
        return await self.inner.page(selection)

    async def latest(self, flow_ids: Sequence[FlowId]) -> tuple[SummaryRecord, ...]:
        self.calls["latest"] += 1
        return await self.inner.latest(flow_ids)


def dbos_created(run: FixtureRun, filters: WorkflowFilters) -> bool:
    checks = (
        filters.start_time is None
        or run.created_at >= int(datetime.fromisoformat(filters.start_time).timestamp() * MILLISECONDS),
        filters.end_time is None
        or run.created_at <= int(datetime.fromisoformat(filters.end_time).timestamp() * MILLISECONDS),
        filters.forked_from is None or run.forked_from == filters.forked_from,
    )
    return all(checks)


@dataclass(slots=True)
class FoldedRows:
    runs: dict[RunId, FixtureRun]
    waits: FakeWaits

    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]:
        return await self.waits.open_runs(wanted)

    async def summaries(self, filters: WorkflowFilters, run_ids: Sequence[RunId] | None) -> Sequence[RunSummary]:
        chosen = frozenset(self.runs) if run_ids is None else frozenset(run_ids)
        runs = [run for run in self.runs.values() if run.run_id in chosen and dbos_created(run, filters)]
        ordered = sorted(runs, key=lambda run: (run.created_at, run.run_id), reverse=True)
        return [await self.summary(run) for run in ordered if run.call is not None]

    async def summary(self, run: FixtureRun) -> RunSummary:
        assert run.call is not None
        events = (*run.events, *run.closing())
        view = RunRecordView(
            run_id=run.run_id,
            status=run.workflow_status(),
            call=run.call,
            events=events,
            fold=fold_events(events),
            waits=await self.waits.waits(run.run_id),
        )
        return view.summary()


def fixture_runs() -> tuple[FixtureRun, ...]:
    return (
        FixtureRun(
            run_id(1),
            "SUCCESS",
            stamp(1),
            call_of(FLOW),
            script(1)
            .started(FLOW, "live")
            .node("clean")
            .done("clean")
            .node("reply")
            .done("reply")
            .finished("completed")
            .log(),
            updated_at=stamp(1.5),
        ),
        FixtureRun(
            run_id(2),
            "SUCCESS",
            stamp(2),
            call_of(FLOW, dataset_item_id="cases/bulb", selected_nodes=(NodeId("reply"),)),
            script(2)
            .started(FLOW, "live")
            .node("clean")
            .delta("clean")
            .done("clean", cost="0.5")
            .finished("completed", "0")
            .log(),
            updated_at=stamp(2.5),
        ),
        FixtureRun(
            run_id(3),
            "ERROR",
            stamp(3),
            call_of(OTHER_FLOW),
            script(3).started(OTHER_FLOW, "live").node("clean").done("clean", "failed").finished("failed").log(),
            updated_at=stamp(3.5),
        ),
        FixtureRun(run_id(4), "PENDING", stamp(4), call_of(FLOW), script(4).started(FLOW, "live").node("clean").log()),
        FixtureRun(
            run_id(5),
            "PENDING",
            stamp(5),
            call_of(FLOW),
            script(5).started(FLOW, "live").node("clean").done("clean").node("review").log(),
        ),
        FixtureRun(
            run_id(6),
            "CANCELLED",
            stamp(6),
            call_of(OTHER_FLOW),
            script(6).started(OTHER_FLOW, "live").node("clean").done("clean").node("review").log(),
            updated_at=stamp(9),
        ),
        FixtureRun(
            run_id(7),
            "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
            stamp(7),
            call_of(FLOW),
            script(7).started(FLOW, "live").node("clean").log(),
        ),
        FixtureRun(run_id(8), "ENQUEUED", stamp(8), call_of(FLOW), forked_from=run_id(1)),
        FixtureRun(
            run_id(9),
            "SUCCESS",
            stamp(9),
            call_of(FLOW, "experiment", series=series_tag()),
            script(9).started(FLOW, "experiment").node("clean").done("clean").finished("completed").log(),
            updated_at=stamp(9.5),
        ),
        FixtureRun(
            run_id(10),
            "SUCCESS",
            stamp(10),
            call_of(OTHER_FLOW, "replay"),
            script(10).started(OTHER_FLOW, "replay").node("clean").done("clean").finished("completed").log(),
            updated_at=stamp(10.5),
            forked_from=run_id(3),
        ),
        FixtureRun(run_id(11), "SUCCESS", stamp(11), None, script(11).started(FLOW, "live").log()),
        FixtureRun(
            run_id(12),
            "PENDING",
            stamp(12),
            call_of(OTHER_FLOW),
            script(12).started(OTHER_FLOW, "live").node("review").log(),
            forked_from=run_id(3),
        ),
        FixtureRun(
            run_id(13),
            "PENDING",
            stamp(13),
            call_of(FLOW),
            script(13).started(FLOW, "live").node("clean").done("clean").node("reply").log(),
        ),
    )


def fixture_waits() -> FakeWaits:
    return FakeWaits(
        entries={
            run_id(5): (human_wait(LEAD, NOW + timedelta(hours=2)),),
            run_id(6): (human_wait(EDITOR, NOW - timedelta(hours=1)),),
            run_id(12): (
                human_wait(EDITOR, NOW + timedelta(hours=5)),
                human_wait(LEAD, NOW - timedelta(hours=3), "approve"),
            ),
            run_id(13): (human_wait(LEAD, NOW + timedelta(hours=1)),),
        }
    )


def completed_run(number: int) -> FixtureRun:
    return FixtureRun(
        run_id(number),
        "SUCCESS",
        stamp(number / 100),
        call_of(FLOW if number % 2 else OTHER_FLOW),
        script(number).started(FLOW, "live").node("clean").done("clean").finished("completed").log(),
        updated_at=stamp(number / 100 + 0.001),
    )


def running_run(number: int) -> FixtureRun:
    return replace(completed_run(number), dbos_status="PENDING", events=script(number).started(FLOW, "live").log())
