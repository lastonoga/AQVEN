import asyncio
from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Final

from dbos import DBOS, SetWorkflowID, WorkflowStatus

from aqven.app.workers import InvalidWorkerCount, configured_workers
from aqven.engine.errors import EngineNotLaunched
from aqven.engine.facade import DbosEngineFacade
from aqven.engine.loading import CodeLoader
from aqven.engine.runtime import RUNTIME_SLOT, EngineRuntime, active_runtime
from aqven.ir import IrHash, IrLookupError
from aqven.runtime.address import RunId
from aqven.runtime.runs import Page
from aqven.series.bound import BoundPlan, largest_case
from aqven.series.estimate import CatalogRunSampler, EstimateOutcome, EstimatePlan, SeriesEstimator
from aqven.series.events import SeriesEventLog
from aqven.series.ids import new_series_id
from aqven.series.model import (
    SETTLED_STATUSES,
    TERMINAL_STATUSES,
    AnalysisInput,
    AttemptRecord,
    AttemptState,
    ExperimentOrigin,
    SeriesAnalysis,
    SeriesChange,
    SeriesEstimate,
    SeriesId,
    SeriesPlanRecord,
    SeriesRecord,
    SeriesStatus,
    SeriesVerdict,
)
from aqven.series.planner import PlannedSeries, PlanningState, SeriesPlanner, plan_request
from aqven.series.plans import PlanRegistrar
from aqven.series.presenter import (
    ACTIVE_STATUSES,
    UNKNOWN_MODEL,
    AgentModels,
    CaseBoard,
    SeriesProgressFacts,
    detail_view,
    shown_status,
    started_view,
    summary_view,
)
from aqven.series.protocol import APPROVAL_TOPIC, UNSTARTED_GRACE_SECONDS, WAIT_POLL_SECONDS
from aqven.series.services import SeriesServices
from aqven.series.settings import InvalidSpendCap, project_spend_cap
from aqven.series.stats.wording import cancelled_text
from aqven.series.store import InvalidCursor, series_cursor
from aqven.series.views import (
    LaunchRequest,
    SeriesCancelRequest,
    SeriesCaseRow,
    SeriesCasesQuery,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesListQuery,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.series.workflow import ApprovalMessage, run_series
from aqven.server.errors import ApiFailure
from aqven.spec import AgentId, ExperimentId, LookQuestion, SeriesSplit, VerdictReason, VerdictState
from aqven.write.model import WriteActor

SHOWN_CASES: Final = 50
FAILED_WORKFLOW_STATUSES: Final = frozenset({"ERROR", "MAX_RECOVERY_ATTEMPTS_EXCEEDED"})
CANCELLED_WORKFLOW_STATUS: Final = "CANCELLED"
UNSTARTED_MESSAGE: Final = "the series workflow was not started"
APPROVAL_KEY: Final = "approve:{series_id}"

type ReconcileRule = Callable[[SeriesRecord, WorkflowStatus | None, datetime], SeriesChange | None]


def utc_now() -> datetime:
    return datetime.now(UTC)


def not_found(series_id: str) -> ApiFailure:
    return ApiFailure("NOT_FOUND", f"series {series_id} is not in the project database")


def state_conflict(record: SeriesRecord, action: str) -> ApiFailure:
    message = f"series {record.series_id} is {record.status.value} and cannot be {action}"
    return ApiFailure("SERIES_STATE_CONFLICT", message, conflict={"status": record.status.value})


def is_look(record: SeriesRecord) -> bool:
    return isinstance(record.plan.question, LookQuestion) or not isinstance(record.origin, ExperimentOrigin)


def finished_count(attempts: Sequence[AttemptRecord]) -> int:
    return sum(1 for attempt in attempts if attempt.state is AttemptState.FINISHED)


def cancelled_verdict(record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> SeriesVerdict | None:
    if is_look(record):
        return None
    total = record.plan.case_count * record.plan.repeats * len(record.plan.variants)
    text = cancelled_text(finished_count(attempts), total)
    return SeriesVerdict(state=VerdictState.INVALID, reason=VerdictReason.CANCELLED, text=text)


def failed_workflow(record: SeriesRecord, status: WorkflowStatus | None, now: datetime) -> SeriesChange | None:
    if status is None or str(status.status) not in FAILED_WORKFLOW_STATUSES:
        return None
    return SeriesChange(status=SeriesStatus.FAILED, finished_at=now, error=str(status.error))


def cancelled_workflow(record: SeriesRecord, status: WorkflowStatus | None, now: datetime) -> SeriesChange | None:
    if status is None or str(status.status) != CANCELLED_WORKFLOW_STATUS:
        return None
    return SeriesChange(status=SeriesStatus.CANCELLED, finished_at=now)


def unstarted_workflow(record: SeriesRecord, status: WorkflowStatus | None, now: datetime) -> SeriesChange | None:
    if status is not None or now - record.created_at < timedelta(seconds=UNSTARTED_GRACE_SECONDS):
        return None
    return SeriesChange(status=SeriesStatus.FAILED, finished_at=now, error=UNSTARTED_MESSAGE)


RECONCILE_RULES: Final[tuple[ReconcileRule, ...]] = (failed_workflow, cancelled_workflow, unstarted_workflow)


def reconciliation(record: SeriesRecord, status: WorkflowStatus | None, now: datetime) -> SeriesChange | None:
    return next((change for rule in RECONCILE_RULES if (change := rule(record, status, now)) is not None), None)


def closing_event(record: SeriesRecord, last_seq: int) -> SeriesFinishedEvent | None:
    if record.status not in TERMINAL_STATUSES:
        return None
    return SeriesFinishedEvent(
        seq=last_seq + 1,
        at=record.finished_at or utc_now(),
        series_id=record.series_id,
        status=record.status,
        verdict=None if record.verdict is None else record.verdict.state,
    )


def series_record(series_id: SeriesId, planned: PlannedSeries, outcome: EstimateOutcome, now: datetime) -> SeriesRecord:
    draft = planned.draft
    estimate = outcome.estimate
    plan = SeriesPlanRecord(
        subject=draft.subject,
        question=draft.question,
        variants=tuple(build.record for build in planned.variants),
        checks=planned.checks,
        judge_ir_hash=planned.judge_ir_hash,
        package=planned.package,
        repeats=draft.repeats,
        case_count=len(planned.cases),
        per_attempt_usd=outcome.per_attempt_usd,
        snapshot=planned.snapshot,
    )
    return SeriesRecord(
        series_id=series_id,
        origin=draft.origin,
        flow_id=draft.flow_id,
        dataset_id=draft.dataset_id,
        on=draft.on,
        status=SeriesStatus.AWAITING_APPROVAL if estimate.needs_approval else SeriesStatus.RUNNING,
        plan=plan,
        estimate=estimate,
        cap_usd=estimate.cap_usd,
        needs_approval=estimate.needs_approval,
        created_at=now,
    )


def estimate_plan(planned: PlannedSeries) -> EstimatePlan:
    draft = planned.draft
    experiment = draft.experiment
    return EstimatePlan(
        experiment_id=draft.experiment_id,
        question=draft.question,
        on=draft.on,
        cases=len(planned.cases),
        repeats=draft.repeats,
        available=planned.choice.available,
        planned_cases=None if experiment is None else experiment.source.spec.plan.cases,
        variants=tuple(build.record for build in planned.variants),
        checks=planned.checks,
        base=planned.base,
        cases_sha256=planned.snapshot.cases_sha256,
        warnings=planned.choice.warnings,
        bound=bound_plan(planned),
    )


def bound_plan(planned: PlannedSeries) -> BoundPlan:
    return BoundPlan(
        base=planned.base,
        projects={build.record.variant_id: build.plan for build in planned.variants},
        judges=planned.judges.plan,
        checks=planned.checks,
        case=largest_case(planned.cases),
        subject=planned.draft.subject,
    )


def dev_rows(rows: Sequence[SeriesCaseRow]) -> tuple[SeriesCaseRow, ...]:
    visible = [row for row in rows if row.split is SeriesSplit.DEV]
    ordered = sorted(visible, key=lambda row: not row.failing)
    return tuple(ordered[:SHOWN_CASES])


def wanted_row(row: SeriesCaseRow, query: SeriesCasesQuery) -> bool:
    return (not query.failures or row.failing) and (not query.divergent or row.divergent)


def optional_runtime() -> EngineRuntime | None:
    return RUNTIME_SLOT.current


def launched_runtime() -> EngineRuntime:
    try:
        return active_runtime()
    except EngineNotLaunched as error:
        raise ApiFailure("NOT_RUNNABLE", "the engine is not running: a series needs the project server") from error


async def launch_series(series_id: SeriesId) -> None:
    with SetWorkflowID(series_id):
        await DBOS.start_workflow_async(run_series, series_id)


@dataclass(frozen=True, slots=True)
class SeriesService:
    services: SeriesServices

    async def estimate(self, experiment_id: ExperimentId, request: LaunchRequest) -> SeriesEstimate:
        start = SeriesStartRequest(
            experiment_id=experiment_id,
            on=request.on,
            cases=request.cases,
            repeats=request.repeats,
            cap_usd=request.cap_usd,
        )
        planned = await self._planned(start, None)
        return (await self._estimated(planned, request.cap_usd)).estimate

    async def start(self, request: SeriesStartRequest, actor: WriteActor) -> SeriesStarted:
        series_id = new_series_id(request.client_op_id)
        existing = await self.services.store.series(series_id)
        if existing is not None:
            await launch_series(series_id)
            return await self._started(existing)
        runtime = launched_runtime()
        planned = await self._planned(request, runtime.plans)
        outcome = await self._estimated(planned, request.cap_usd)
        record = series_record(series_id, planned, outcome, utc_now())
        created = await self.services.store.create(record, planned.cases)
        current = record if created else await self._record(series_id)
        await launch_series(series_id)
        return await self._started(current)

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult:
        record = await self._waited(await self._reconciled(request.series_id), request.wait_seconds)
        waiting = await self.services.waits.open_runs()
        attempts = await self.services.store.attempts(record.series_id)
        facts = await self._facts(record, attempts, waiting)
        analysis = await self._analysis(record, attempts)
        detail = detail_view(record, facts, analysis, self._models(record))
        if not request.include_cases:
            return SeriesGetResult(series=detail, cases=None, hidden_cases=0)
        rows = await self._rows(record, attempts, waiting)
        shown = dev_rows(rows)
        return SeriesGetResult(series=detail, cases=shown, hidden_cases=len(rows) - len(shown))

    async def list(self, query: SeriesListQuery) -> Page[SeriesSummaryView]:
        try:
            records = await self.services.store.search(query, query.limit + 1)
        except InvalidCursor as error:
            raise ApiFailure("REQUEST_INVALID", str(error)) from error
        page = records[: query.limit]
        waiting = await self.services.waits.open_runs()
        views = [await self._summary(await self._reconciled(record.series_id), waiting) for record in page]
        items = tuple(view for view in views if query.status is None or view.status is query.status)
        more = len(records) > query.limit and bool(page)
        return Page[SeriesSummaryView](
            items=items, next_cursor=series_cursor(page[-1]) if more else None, total_estimate=None
        )

    async def cases(self, series_id: SeriesId, query: SeriesCasesQuery) -> tuple[SeriesCaseRow, ...]:
        record = await self._reconciled(series_id)
        attempts = await self.services.store.attempts(series_id)
        rows = await self._rows(record, attempts, await self.services.waits.open_runs())
        return tuple(row for row in rows if wanted_row(row, query))

    async def approve(self, series_id: SeriesId, actor: WriteActor) -> SeriesSummaryView:
        record = await self._reconciled(series_id)
        if record.status is not SeriesStatus.AWAITING_APPROVAL:
            raise state_conflict(record, "approved")
        message = ApprovalMessage(approved_by=actor.id).model_dump(mode="json")
        key = APPROVAL_KEY.format(series_id=series_id)
        await DBOS.send_async(series_id, message, topic=APPROVAL_TOPIC, idempotency_key=key)
        change = SeriesChange(status=SeriesStatus.RUNNING, approved_by=actor.id, approved_at=utc_now())
        updated = await self.services.store.update(series_id, change)
        return await self._summary(updated, await self.services.waits.open_runs())

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView:
        record = await self._reconciled(request.series_id)
        if record.status not in ACTIVE_STATUSES:
            raise state_conflict(record, "cancelled")
        await DBOS.cancel_workflow_async(record.series_id, cancel_children=True)
        current = await self._reconciled(record.series_id)
        if current.status in ACTIVE_STATUSES:
            current = await self._mark_cancelled(current)
        if current.status is not SeriesStatus.CANCELLED:
            raise state_conflict(current, "cancelled")
        return await self._summary(current, await self.services.waits.open_runs())

    async def events(self, series_id: SeriesId, after_seq: int) -> AsyncIterator[SeriesEvent]:
        await self._record(series_id)
        last: SeriesEvent | None = None
        async for event in SeriesEventLog().follow(series_id, after_seq):
            last = event
            yield event
        closing = await self._closing(series_id, last, after_seq)
        if closing is not None:
            yield closing

    async def _mark_cancelled(self, record: SeriesRecord) -> SeriesRecord:
        attempts = await self.services.store.attempts(record.series_id)
        change = SeriesChange(
            status=SeriesStatus.CANCELLED, finished_at=utc_now(), verdict=cancelled_verdict(record, attempts)
        )
        return await self.services.store.update(record.series_id, change)

    async def _closing(self, series_id: SeriesId, last: SeriesEvent | None, after_seq: int) -> SeriesEvent | None:
        if isinstance(last, SeriesFinishedEvent):
            return None
        record = await self._reconciled(series_id)
        return closing_event(record, after_seq if last is None else last.seq)

    async def _planned(self, request: SeriesStartRequest, registrar: PlanRegistrar | None) -> PlannedSeries:
        state = await self.services.workspace.state()
        planner = SeriesPlanner(
            types=CodeLoader(self.services.root),
            engine_version=self.services.engine_version,
            holdout_share=self.services.splits.holdout_share,
        )
        return await planner.plan(plan_request(request), PlanningState(state.report, state.snapshot), registrar)

    async def _estimated(self, planned: PlannedSeries, request_cap: Decimal | None) -> EstimateOutcome:
        runtime = optional_runtime()
        sampler = None if runtime is None else CatalogRunSampler(DbosEngineFacade(runtime=runtime))
        estimator = SeriesEstimator(store=self.services.store, prices=self.services.prices, sampler=sampler)
        return await estimator.estimate(estimate_plan(planned), request_cap, await self._cap(), await self._workers())

    async def _cap(self) -> Decimal:
        try:
            return await project_spend_cap(self.services.settings)
        except InvalidSpendCap as error:
            raise ApiFailure("NOT_RUNNABLE", str(error)) from error

    async def _workers(self) -> int | None:
        try:
            return await configured_workers(self.services.settings)
        except InvalidWorkerCount:
            return None

    async def _record(self, series_id: SeriesId) -> SeriesRecord:
        record = await self.services.store.series(series_id)
        if record is None:
            raise not_found(series_id)
        return record

    async def _reconciled(self, series_id: SeriesId) -> SeriesRecord:
        record = await self._record(series_id)
        if record.status not in ACTIVE_STATUSES or optional_runtime() is None:
            return record
        status = await DBOS.get_workflow_status_async(series_id)
        change = reconciliation(record, status, utc_now())
        if change is None:
            return record
        if change.status is SeriesStatus.CANCELLED:
            attempts = await self.services.store.attempts(series_id)
            change = change.model_copy(update={"verdict": cancelled_verdict(record, attempts)})
        return await self.services.store.update(series_id, change)

    async def _waits(self, record: SeriesRecord, attempts: Sequence[AttemptRecord], waiting: frozenset[RunId]) -> int:
        if record.status is not SeriesStatus.RUNNING:
            return 0
        return sum(1 for row in attempts if row.state is AttemptState.RUNNING and row.run_id in waiting)

    async def _facts(
        self, record: SeriesRecord, attempts: Sequence[AttemptRecord], waiting: frozenset[RunId]
    ) -> SeriesProgressFacts:
        return SeriesProgressFacts(
            done=finished_count(attempts),
            spend=await self.services.store.spend(record.series_id),
            waits=await self._waits(record, attempts, waiting),
        )

    async def _summary(self, record: SeriesRecord, waiting: frozenset[RunId]) -> SeriesSummaryView:
        attempts = await self.services.store.attempts(record.series_id)
        return summary_view(record, await self._facts(record, attempts, waiting))

    async def _started(self, record: SeriesRecord) -> SeriesStarted:
        attempts = await self.services.store.attempts(record.series_id)
        waiting = await self.services.waits.open_runs()
        return started_view(record, await self._facts(record, attempts, waiting))

    async def _settled(self, record: SeriesRecord) -> bool:
        if record.status in SETTLED_STATUSES:
            return True
        attempts = await self.services.store.attempts(record.series_id)
        waits = await self._waits(record, attempts, await self.services.waits.open_runs())
        return shown_status(record, waits) in SETTLED_STATUSES

    async def _waited(self, record: SeriesRecord, wait_seconds: int) -> SeriesRecord:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + wait_seconds
        current = record
        while not await self._settled(current) and loop.time() < deadline:
            await asyncio.sleep(min(WAIT_POLL_SECONDS, max(0.0, deadline - loop.time())))
            current = await self._reconciled(current.series_id)
        return current

    async def _analysis(self, record: SeriesRecord, attempts: tuple[AttemptRecord, ...]) -> SeriesAnalysis:
        if record.analysis is not None:
            return record.analysis
        cases = await self.services.store.cases(record.series_id)
        source = AnalysisInput(
            series_id=record.series_id,
            question=record.plan.question,
            split=record.on,
            status=record.status,
            stop=record.stop,
            inputs_changed=False,
            variants=record.plan.variants,
            checks=record.plan.checks,
            repeats=record.plan.repeats,
            case_names=tuple(case.name for case in cases),
            attempts=attempts,
        )
        return await asyncio.to_thread(self.services.analyst.analyze, source)

    async def _rows(
        self, record: SeriesRecord, attempts: tuple[AttemptRecord, ...], waiting: frozenset[RunId]
    ) -> tuple[SeriesCaseRow, ...]:
        cases = await self.services.store.cases(record.series_id)
        return CaseBoard(record=record, attempts=attempts, waiting=waiting).rows(cases)

    def _models(self, record: SeriesRecord) -> AgentModels:
        runtime = optional_runtime()
        judge_hash = record.plan.judge_ir_hash
        plan = None if runtime is None or judge_hash is None else runtime.plans.find(IrHash(judge_hash))

        def model(agent_id: AgentId) -> str:
            if plan is None:
                return UNKNOWN_MODEL
            try:
                return plan.agent(agent_id).primary.model
            except IrLookupError:
                return UNKNOWN_MODEL

        return model
