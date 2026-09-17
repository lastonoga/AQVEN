import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final, Protocol

from dbos import DBOS, SetWorkflowID, WorkflowHandleAsync, WorkflowStatus
from dbos import error as dbos_errors
from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.errors import CodeLoadError
from aqven.engine.forking import locate_fork, new_run_id, perform_fork
from aqven.engine.interpreter import run_flow
from aqven.engine.projection import RunFold, fold_events
from aqven.engine.protocol import (
    POLLING_INTERVAL_SECONDS,
    RUN_FLOW_WORKFLOW,
)
from aqven.engine.reader import TERMINAL_DBOS_STATUSES, RunEventLog
from aqven.engine.request import RUN_CALL_ARGUMENTS, RunCall, RunRecord, RunSpec
from aqven.engine.runtime import NO_OVERRIDES, EngineRuntime, RunOverrides
from aqven.ir import CompiledProject, IrLookupError, flow_hash
from aqven.ports.engine import EngineError, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, JsonObject, Problem, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution, RunError
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.runs import (
    WORKING_COPY,
    CancelRequest,
    CancelResult,
    ForkRequest,
    Lineage,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
    SpecVersionInfo,
)
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import IncludePayloads, RunStatus
from aqven.spec import FlowId

QUEUED_DBOS_STATUSES: Final = frozenset({"ENQUEUED", "DELAYED"})
SETTLED_STATUSES: Final = frozenset({"completed", "failed"})
MILLISECONDS: Final = 1000
UI_RUNS_PATH: Final = "/runs/"
INPUT_PATH: Final = "input"
FIRST_PAGE: Final = 0


class PlanSource(Protocol):
    def current(self) -> CompiledProject: ...


def epoch_time(stamp: int | None) -> datetime:
    return datetime.fromtimestamp((stamp or 0) / MILLISECONDS, UTC)


def run_call_of(status: WorkflowStatus) -> RunCall | None:
    inputs = status.input
    if inputs is None:
        return None
    try:
        ir_hash, flow_input, spec = RUN_CALL_ARGUMENTS.validate_python(tuple(inputs["args"]))
        return RunCall(ir_hash=ir_hash, flow_input=flow_input, spec=RunSpec.model_validate(spec))
    except ValidationError, KeyError:
        return None


async def stored_run_call(run_id: RunId) -> RunCall | None:
    status = await DBOS.get_workflow_status_async(run_id)
    return None if status is None else run_call_of(status)


def derived_status(status: WorkflowStatus, fold: RunFold, waiting: bool) -> RunStatus:
    if fold.finished is not None:
        return fold.finished.status
    dbos_status = str(status.status)
    terminal = TERMINAL_DBOS_STATUSES.get(dbos_status)
    if terminal is not None:
        return terminal
    if dbos_status in QUEUED_DBOS_STATUSES:
        return "queued"
    return "suspended" if waiting else "running"


def validation_problems(error: ValidationError, prefix: str) -> tuple[Problem, ...]:
    return tuple(
        Problem(path=(prefix, *(part for part in item["loc"])), code=item["type"], message=item["msg"])
        for item in error.errors()
    )


def not_found(run_id: RunId) -> EngineError:
    return EngineError("NOT_FOUND", f"run {run_id} not found")


@dataclass(frozen=True, slots=True)
class RunRecordView:
    run_id: RunId
    status: WorkflowStatus
    call: RunCall
    events: tuple[RunEvent, ...]
    fold: RunFold
    waits: tuple[HumanWait, ...]

    @property
    def run_status(self) -> RunStatus:
        return derived_status(self.status, self.fold, bool(self.waits))

    def cost(self) -> tuple[Decimal, int, int]:
        finished = self.fold.finished
        if finished is not None and (finished.cost_usd or finished.tokens_in or finished.tokens_out):
            return finished.cost_usd, finished.tokens_in, finished.tokens_out
        executions = self.fold.executions.values()
        return (
            sum((fold.cost_usd for fold in executions), Decimal(0)),
            sum(fold.tokens_in for fold in executions),
            sum(fold.tokens_out for fold in executions),
        )

    def summary(self) -> RunSummary:
        cost, tokens_in, tokens_out = self.cost()
        started = self.fold.started
        finished = self.fold.finished
        forked_from = self.status.forked_from
        return RunSummary(
            run_id=self.run_id,
            flow_id=self.call.spec.flow_id,
            status=self.run_status,
            mode=self.call.spec.mode,
            started_at=epoch_time(self.status.created_at),
            finished_at=finished.at if finished is not None else None,
            cost_usd=cost,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            node_counts=self.fold.node_counts(),
            content_hash=started.content_hash if started is not None else "",
            definition_changed=False,
            waits=self.waits,
            lineage=Lineage(relation="fork", parent_run_id=RunId(forked_from)) if forked_from else None,
        )

    def snapshot(self) -> RunSnapshot:
        summary = self.summary()
        started = self.fold.started
        finished = self.fold.finished
        answers = [(answer.address, answer.attempt) for answer in self.call.spec.human_answers]
        return RunSnapshot(
            **summary.model_dump(),
            execution_id=self.run_id,
            spec_version=SpecVersionInfo(
                id=self.call.ir_hash,
                content_hash=summary.content_hash,
                release_hash=None,
                git_commit=None,
                origin="working_copy",
                sources={},
            ),
            input_ref=InlineValue(value=self.call.flow_input),
            output_ref=finished.output_ref if finished is not None else None,
            error=finished.error if finished is not None else None,
            seed=None,
            cassette_id=None,
            catalog_snapshot_at=None,
            effective_config={},
            config_hash="",
            limits=self.call.spec.limits,
            trace_id=None,
            order=started.order if started is not None else (),
            executions=self.fold.executions_view(),
            human_answers=self.fold.answer_statuses(answers),
            last_seq=len(self.events),
        )


@dataclass(frozen=True, slots=True)
class DbosEngineFacade:
    runtime: EngineRuntime
    plan_source: PlanSource | None = None
    log: RunEventLog = field(default_factory=RunEventLog)

    async def start_run(self, request: RunStartRequest) -> RunStarted:
        if request.at != WORKING_COPY or request.dataset_item_id is not None:
            raise EngineError("NOT_RUNNABLE", "a run can start only from the working copy with an explicit input")
        plan = self._current_plan()
        flow_input = self.validated_input(plan, request.flow_id, request.input)
        spec = RunSpec(flow_id=request.flow_id, mode=request.mode, human_answers=request.human_answers or ())
        return await self.launch(plan, spec, flow_input, NO_OVERRIDES)

    async def launch(
        self, plan: CompiledProject, spec: RunSpec, flow_input: JsonObject, overrides: RunOverrides
    ) -> RunStarted:
        if spec.flow_id not in plan.flows:
            raise EngineError("NOT_FOUND", f"flow {spec.flow_id} is not in the plan")
        ir_hash = self.runtime.plans.register(plan)
        run_id = RunId(str(uuid.uuid7()))
        self.runtime.services.overrides.register(run_id, overrides)
        with SetWorkflowID(run_id):
            await DBOS.start_workflow_async(run_flow, ir_hash, flow_input, spec.model_dump(mode="json"))
        return RunStarted(
            run_id=run_id,
            status="running",
            content_hash=flow_hash(plan, spec.flow_id),
            spec_version_id=ir_hash,
            last_seq=0,
            ui_url=f"{UI_RUNS_PATH}{run_id}",
        )

    def validated_input(self, plan: CompiledProject, flow_id: FlowId, value: JsonValue) -> JsonObject:
        try:
            flow = plan.flow(flow_id)
            annotation = self.runtime.services.loader.type_annotation(plan.package, flow.input_type)
        except IrLookupError as error:
            raise EngineError("NOT_FOUND", str(error)) from error
        except CodeLoadError as error:
            raise EngineError("NOT_RUNNABLE", str(error)) from error
        adapter: TypeAdapter[object] = TypeAdapter(annotation)
        try:
            validated = adapter.validate_python(value)
        except ValidationError as error:
            raise EngineError(
                "INPUT_INVALID",
                "input does not match the flow input type",
                problems=validation_problems(error, INPUT_PATH),
            ) from error
        dumped: JsonValue = adapter.dump_python(validated, mode="json", by_alias=True)
        if not isinstance(dumped, dict):
            raise EngineError("INPUT_INVALID", "flow input must be a record")
        return dumped

    async def result(self, run_id: RunId) -> RunRecord:
        await self._status(run_id)
        handle: WorkflowHandleAsync[JsonObject] = await DBOS.retrieve_workflow_async(run_id)
        try:
            raw = await handle.get_result(polling_interval_sec=POLLING_INTERVAL_SECONDS)
        except dbos_errors.DBOSAwaitedWorkflowCancelledError:
            return RunRecord(status="cancelled")
        except Exception as error:
            return RunRecord(status="failed", error=RunError(code="INTERNAL", message=str(error), address=None))
        return RunRecord.model_validate(raw)

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return (await self._view(run_id)).snapshot()

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        statuses = await DBOS.list_workflows_async(name=RUN_FLOW_WORKFLOW, sort_desc=True, load_output=False)
        views = [view for view in [await self._view_of(status) for status in statuses] if view is not None]
        matching = [view.summary() for view in views if _matches(view, query)]
        start = int(query.cursor) if query.cursor and query.cursor.isdigit() else FIRST_PAGE
        page = matching[start : start + query.limit]
        following = start + query.limit
        return Page[RunSummary](
            items=tuple(page),
            next_cursor=str(following) if following < len(matching) else None,
            total_estimate=len(matching),
        )

    async def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        await self._status(run_id)
        async for event in self.log.follow(run_id, after_seq):
            yield event

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        await self._status(run_id)
        events = [event for event in await self.log.snapshot(run_id) if event.seq > query.after_seq]
        page = events[: query.limit]
        more = len(events) > query.limit
        return Page[RunEvent](
            items=tuple(page),
            next_cursor=str(page[-1].seq) if more and page else None,
            total_estimate=len(events),
        )

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        view = await self._view(run_id)
        return tuple(
            execution
            for execution in view.fold.executions_view()
            if (query.node_id is None or execution.address.node_id == query.node_id)
            and (query.status is None or execution.status == query.status)
        )

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        view = await self._view(run_id)
        fold = view.fold.execution(address)
        if fold is None:
            raise EngineError("NOT_FOUND", f"run {run_id} has no execution at {address.model_dump_json()}")
        execution = fold.view()
        finished = view.fold.finished
        error = (
            finished.error if finished is not None and finished.error and finished.error.address == address else None
        )
        return ExecutionDetail(
            **execution.model_dump(exclude={"output_ref"}),
            output_ref=None if include_payloads == "none" else execution.output_ref,
            provenance={},
            prompt=None,
            response=None,
            attempts=tuple(fold.attempts),
            checks=(),
            rule_firings=(),
            error=error,
            human=await self._human_detail(run_id, address),
        )

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        await self._status(run_id)
        return await self.runtime.human_layer.resume(run_id, request)

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        await self._status(run_id)
        if request.overrides is not None or request.at != "original":
            raise EngineError(
                "NOT_RUNNABLE", "the DBOS engine does not support a fork with edits or on the working copy"
            )
        point = await locate_fork(run_id, request.from_)
        if point is None:
            raise EngineError("NOT_FOUND", f"node {request.from_.model_dump_json()} did not execute in run {run_id}")
        forked = new_run_id()
        overrides = self.runtime.services.overrides
        overrides.register(forked, overrides.of(run_id))
        await perform_fork(point, forked)
        return RunForked(run_id=forked, lineage_parent=run_id)

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        view = await self._view(run_id)
        current = view.run_status
        if current in SETTLED_STATUSES:
            raise EngineError("RUN_STATE_CONFLICT", f"run {run_id} is already {current}", details={"status": current})
        if current != "cancelled":
            await DBOS.cancel_workflow_async(run_id, cancel_children=True)
        return CancelResult(status="cancelled")

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        await self._status(run_id)
        return await self.runtime.human_layer.waits(run_id)

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        await self._status(run_id)
        return await self.runtime.human_layer.wait_detail(run_id, address)

    def _current_plan(self) -> CompiledProject:
        if self.plan_source is None:
            raise EngineError("NOT_RUNNABLE", "working copy plan source is not connected")
        try:
            return self.plan_source.current()
        except Exception as error:
            raise EngineError("NOT_RUNNABLE", f"working copy does not compile: {error}") from error

    async def _status(self, run_id: RunId) -> WorkflowStatus:
        status = await DBOS.get_workflow_status_async(run_id)
        if status is None or status.name != RUN_FLOW_WORKFLOW:
            raise not_found(run_id)
        return status

    async def _view(self, run_id: RunId) -> RunRecordView:
        view = await self._view_of(await self._status(run_id))
        if view is None:
            raise not_found(run_id)
        return view

    async def _view_of(self, status: WorkflowStatus) -> RunRecordView | None:
        call = run_call_of(status)
        if call is None:
            return None
        run_id = RunId(status.workflow_id)
        events = await self.log.snapshot(run_id)
        return RunRecordView(
            run_id=run_id,
            status=status,
            call=call,
            events=events,
            fold=fold_events(events),
            waits=await self.runtime.human_layer.waits(run_id),
        )

    async def _human_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail | None:
        try:
            return await self.runtime.human_layer.wait_detail(run_id, address)
        except EngineError:
            return None


def _matches(view: RunRecordView, query: RunListQuery) -> bool:
    checks = (
        query.flow_id is None or view.call.spec.flow_id == query.flow_id,
        query.status is None or view.run_status == query.status,
        query.mode is None or view.call.spec.mode == query.mode,
        query.parent_run_id is None or view.status.forked_from == query.parent_run_id,
        query.assignee is None or any(wait.assignee == query.assignee for wait in view.waits),
    )
    return all(checks)
