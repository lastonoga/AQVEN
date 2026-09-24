import asyncio
import uuid
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Final, Literal, Protocol

from dbos import DBOS, WorkflowHandleAsync, WorkflowStatus
from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.allowed_set_view import allowed_set_views
from aqven.engine.errors import CodeLoadError
from aqven.engine.forking import locate_fork, new_run_id, perform_fork
from aqven.engine.launching import settled_record, start_run_workflow
from aqven.engine.llm.errors import LlmNodeError
from aqven.engine.presentation import CurrentFormatterLoader, CurrentTemplateLoader, present_batch
from aqven.engine.prices import launch_models
from aqven.engine.projection import ExecutionFold, RunFold, fold_events
from aqven.engine.protocol import RUN_FLOW_WORKFLOW
from aqven.engine.reader import TERMINAL_DBOS_STATUSES, RunEventLog
from aqven.engine.request import RunCall, RunRecord, RunSpec
from aqven.engine.runtime import NO_OVERRIDES, EngineRuntime, RunOverrides
from aqven.engine.selection import SelectionError, execution_order, range_missing, range_order
from aqven.engine.summaries import QUEUED_DBOS_STATUSES, SummaryListing, epoch_time, fold_cost, run_call_of
from aqven.ir import CompiledFlow, CompiledProject, IrHash, IrLookupError, flow_hash
from aqven.ports.engine import EngineError, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.ports.identity import local_user, resolved_assignee
from aqven.runtime.address import ExecutionAddress, JsonObject, Problem, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution, ResolvedAllowedSet
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.presentation import PresentationRequest, PresentationResponse, PresentationResult
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
from aqven.spec import ArmId, ExperimentId, FlowId, InferenceId, NodeId, RunContextKey

SETTLED_STATUSES: Final = frozenset({"completed", "failed"})
UI_RUNS_PATH: Final = "/runs/"
INPUT_PATH: Final = "input"
CONTEXT_PATH: Final = "context"
CONTEXT_PROBLEM: Final = "CONTEXT_KEY_MISSING"


class PlanSource(Protocol):
    def current(self) -> CompiledProject: ...


def missing_context_keys(flow: CompiledFlow, spec: RunSpec) -> tuple[RunContextKey, ...]:
    if spec.start_node is not None:
        return ()
    provided = spec.run_context()
    return tuple(key for key in flow.context if key not in provided)


def context_problem(flow: CompiledFlow, key: RunContextKey) -> Problem:
    message = f"flow {flow.flow_id} reads $run.context.{key.value} and the run was started without it"
    return Problem(path=(CONTEXT_PATH, key.value), code=CONTEXT_PROBLEM, message=message)


def require_context(flow: CompiledFlow, spec: RunSpec) -> None:
    missing = missing_context_keys(flow, spec)
    if not missing:
        return
    names = ", ".join(key.value for key in missing)
    message = f"flow {flow.flow_id} needs run context keys: {names}; pass them in context, the engine invents none"
    raise EngineError(
        "CONTEXT_MISSING",
        message,
        problems=tuple(context_problem(flow, key) for key in missing),
        details={CONTEXT_PATH: [key.value for key in missing]},
    )


def recorded_allowed_sets(plan: CompiledProject | None, fold: ExecutionFold) -> tuple[ResolvedAllowedSet, ...]:
    if plan is None or fold.inference is None or fold.input_stage != "normalized":
        return ()
    if not isinstance(fold.input_ref, InlineValue):
        return ()
    inference = plan.inferences.get(InferenceId(fold.inference))
    if inference is None:
        return ()
    try:
        return allowed_set_views(inference, fold.input_ref)
    except LlmNodeError:
        return ()


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


def series_of(spec: RunSpec) -> str | None:
    return None if spec.series is None else spec.series.series_id


def experiment_of(spec: RunSpec) -> ExperimentId | None:
    return None if spec.series is None else spec.series.experiment_id


def arm_of(spec: RunSpec) -> ArmId | None:
    return None if spec.series is None else spec.series.arm_id


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
        return fold_cost(self.fold)

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
            dataset_item_id=self.call.spec.dataset_item_id,
            selected_nodes=self.call.spec.selected_nodes,
            start_node=self.call.spec.start_node,
            end_node=self.call.spec.end_node,
            series_id=series_of(self.call.spec),
            experiment_id=experiment_of(self.call.spec),
            arm_id=arm_of(self.call.spec),
        )

    def snapshot(self) -> RunSnapshot:
        summary = self.summary()
        started = self.fold.started
        finished = self.fold.finished
        answers = [(answer.address, answer.attempt) for answer in self.call.spec.human_answers]
        return RunSnapshot(
            **summary.model_dump(),
            execution_id=self.run_id,
            context=self.call.spec.context,
            node_outputs=self.call.spec.node_outputs,
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

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        if request.at != WORKING_COPY or request.dataset_item_id is not None:
            raise EngineError("NOT_RUNNABLE", "a run can start only from the working copy with an explicit input")
        plan = self._current_plan()
        if request.flow_id not in plan.flows:
            raise EngineError("NOT_FOUND", f"flow {request.flow_id} is not in the plan")
        try:
            flow = plan.flow(request.flow_id)
            if request.start_node is not None and request.end_node is not None:
                range_order(flow, request.start_node, request.end_node)
                if not isinstance(request.input, dict):
                    raise EngineError("INPUT_INVALID", "a node range needs an input record")
                flow_input = request.input
                context = request.context.model_dump(mode="json", exclude_none=True) if request.context else {}
                missing = range_missing(
                    flow, request.start_node, request.end_node, flow_input, context, request.node_outputs
                )
                if missing:
                    details = "; ".join(f"{item.reference}: {item.reason}" for item in missing)
                    raise EngineError("INPUT_INVALID", f"node range is missing boundary data: {details}")
            else:
                flow_input = self.validated_input(plan, request.flow_id, request.input)
                execution_order(flow, request.selected_nodes)
        except SelectionError as error:
            raise EngineError("INPUT_INVALID", str(error)) from error
        spec = RunSpec(
            flow_id=request.flow_id,
            mode=request.mode,
            dataset_item_id=dataset_item_id,
            context=request.context,
            selected_nodes=request.selected_nodes,
            start_node=request.start_node,
            end_node=request.end_node,
            node_outputs=request.node_outputs,
            human_answers=request.human_answers or (),
        )
        return await self.launch(plan, spec, flow_input, NO_OVERRIDES)

    async def launch(
        self, plan: CompiledProject, spec: RunSpec, flow_input: JsonObject, overrides: RunOverrides
    ) -> RunStarted:
        if spec.flow_id not in plan.flows:
            raise EngineError("NOT_FOUND", f"flow {spec.flow_id} is not in the plan")
        require_context(plan.flow(spec.flow_id), spec)
        ir_hash = self.runtime.plans.register(plan)
        run_id = RunId(str(uuid.uuid7()))
        self.runtime.services.overrides.register(run_id, overrides)
        await self.runtime.services.prices.warm(launch_models(plan, spec))
        await start_run_workflow(run_id, ir_hash, flow_input, spec)
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
        return await settled_record(handle)

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return (await self._view(run_id)).snapshot()

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        services = self.runtime.services
        user = await local_user(services.settings, services.environ)
        wanted = query.model_copy(update={"assignee": resolved_assignee(query.assignee, user)})
        return await self._listing().page(wanted)

    async def latest_runs(self, flow_ids: Sequence[FlowId]) -> Mapping[FlowId, RunSummary]:
        return await self._listing().latest(flow_ids)

    def _listing(self) -> SummaryListing:
        return SummaryListing(rows=self.runtime.summaries, waits=self.runtime.human_layer)

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
        run_error = (
            finished.error if finished is not None and finished.error and finished.error.address == address else None
        )
        error = fold.error or run_error
        plan = self.runtime.plans.find(IrHash(view.call.ir_hash))
        allowed_sets = recorded_allowed_sets(plan, fold) if include_payloads != "none" else ()
        node = plan.flow(view.call.spec.flow_id).nodes.get(NodeId(address.node_id)) if plan is not None else None
        schema_source: Literal["run", "unavailable"] = "unavailable" if node is None else "run"
        return ExecutionDetail(
            **execution.model_dump(exclude={"input_ref", "output_ref"}),
            input_ref=None if include_payloads == "none" else execution.input_ref,
            output_ref=None if include_payloads == "none" else execution.output_ref,
            provenance={},
            input_schema=getattr(node, "input_schema", None),
            output_schema=node.output_schema if node is not None else None,
            schema_source=schema_source,
            allowed_sets=allowed_sets,
            prompt=fold.prompt,
            response=None,
            attempts=tuple(fold.attempts),
            checks=tuple(fold.checks),
            rule_firings=(),
            error=error,
            human=await self._human_detail(run_id, address),
        )

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        view = await self._view(run_id)
        plan = self.runtime.plans.find(IrHash(view.call.ir_hash))
        if plan is None:
            return PresentationResponse(
                results=tuple(
                    PresentationResult(target=target, status="unavailable", error="run plan snapshot is unavailable")
                    for target in request.targets
                )
            )
        return await asyncio.to_thread(
            present_batch,
            plan,
            view.call.spec.flow_id,
            view.call.spec.run_context(),
            view.fold,
            request,
            CurrentFormatterLoader(self.runtime.services.loader).load,
            self.runtime.services.blobs.read,
            CurrentTemplateLoader(self.runtime.services.loader.root).load,
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
        await self.runtime.summaries.track(forked)
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
