import time
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field, replace
from decimal import Decimal
from typing import Final, assert_never

from dbos import DBOS, SetWorkflowID, WorkflowHandleAsync
from dbos import error as dbos_errors
from pydantic import JsonValue

from aqven.engine.addressing import (
    ROOT_CONTEXT,
    AddressContext,
    address_key,
    call_prefix,
    child_workflow_id,
    prefixed_node_id,
)
from aqven.engine.events import BatchedOutputSink, BufferedEventSink, EventSink, StreamEventSink
from aqven.engine.failures import failure_of, run_error
from aqven.engine.forking import root_run_id
from aqven.engine.overrides import override_outcome
from aqven.engine.protocol import POLLING_INTERVAL_SECONDS, RUN_BRANCH_WORKFLOW, RUN_FLOW_WORKFLOW
from aqven.engine.request import (
    NODE_OUTCOME_ADAPTER,
    BranchResult,
    BranchTicket,
    RunRecord,
    RunSpec,
    RunUsageTotals,
)
from aqven.engine.runtime import EngineRuntime, active_runtime
from aqven.engine.selection import SelectionError, execution_order, range_order
from aqven.engine.steps import node_boundary
from aqven.engine.values import RefSources, RefUnresolved, ValueStore, evaluate_ref
from aqven.ir import (
    CompiledBinding,
    CompiledFlow,
    CompiledNode,
    CompiledProject,
    IrHash,
    LiteralBinding,
    RefBinding,
    flow_hash,
    node_kind,
)
from aqven.ports.execution import (
    ChildEntry,
    EventStamp,
    NodeCancelled,
    NodeFailed,
    NodeOutcome,
    NodeSkipped,
    NodeSucceeded,
    OutputSink,
    ScopeFrame,
    execute_node,
)
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId
from aqven.runtime.events import NodeFinished, NodeStarted, RunEvent, RunFinished, RunStartedEvent
from aqven.runtime.overrides import override_for
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import FinishedExecutionStatus, RunMode
from aqven.spec import FlowId, NodeId, NodeKind

BRANCH_KINDS: Final = frozenset({NodeKind.PARALLEL, NodeKind.MAP})
USAGE_KINDS: Final = frozenset({NodeKind.LLM, NodeKind.CODE, NodeKind.TOOL, NodeKind.HUMAN})
NODE_ID_SEPARATOR: Final = "__"
PLAN_MISSING: Final = "PLAN_MISSING"
FLOW_NOT_FOUND: Final = "FLOW_NOT_FOUND"
INTERNAL: Final = "INTERNAL"
RETURNS_BINDING: Final = "RETURNS_UNRESOLVED"
MILLISECONDS: Final = 1000


@dataclass(slots=True)
class RunState:
    runtime: EngineRuntime
    run_id: RunId
    ir_hash: IrHash
    spec: RunSpec
    project: CompiledProject
    events: EventSink
    attempts: dict[str, int] = field(default_factory=dict[str, int])
    usage: RunUsageTotals = field(default_factory=RunUsageTotals)
    branches: int = 0

    def next_attempt(self, address: ExecutionAddress) -> int:
        key = address_key(address)
        self.attempts[key] = self.attempts.get(key, 0) + 1
        return self.attempts[key]

    def next_branch(self) -> int:
        self.branches += 1
        return self.branches

    def merge_attempts(self, attempts: dict[str, int]) -> None:
        for key, count in attempts.items():
            self.attempts[key] = max(self.attempts.get(key, 0), count)


@dataclass(frozen=True, slots=True)
class FlowFrame:
    flow: CompiledFlow
    flow_input: JsonObject
    prefix: str
    values: ValueStore


def containers(flow: CompiledFlow, owner: NodeId | None) -> Iterator[NodeId]:
    current = owner
    while current is not None and current in flow.nodes:
        yield current
        current = flow.nodes[current].parent


def visible_node(flow: CompiledFlow, owner: NodeId | None, name: str) -> NodeId | None:
    candidates = (*(NodeId(f"{container}{NODE_ID_SEPARATOR}{name}") for container in containers(flow, owner)), name)
    return next((NodeId(candidate) for candidate in candidates if candidate in flow.nodes), None)


def merged_frame(outer: ScopeFrame, inner: ScopeFrame) -> ScopeFrame:
    values = {
        **outer.model_dump(include=set(outer.model_fields_set)),
        **inner.model_dump(include=set(inner.model_fields_set)),
    }
    return ScopeFrame.model_validate(values)


@dataclass(frozen=True, slots=True)
class NodeScope:
    state: RunState
    flow_frame: FlowFrame
    owner: CompiledNode | None
    address: ExecutionAddress
    chain: tuple[AddressContext, ...]
    frame: ScopeFrame
    output: OutputSink
    attempt: int = 1
    overlay: JsonObject | None = None

    @property
    def run_id(self) -> RunId:
        return self.state.run_id

    @property
    def root_run_id(self) -> RunId:
        return self.state.run_id

    @property
    def mode(self) -> RunMode:
        return self.state.spec.mode

    @property
    def ir_hash(self) -> IrHash:
        return self.state.ir_hash

    @property
    def project(self) -> CompiledProject:
        return self.state.project

    @property
    def flow(self) -> CompiledFlow:
        return self.flow_frame.flow

    @property
    def events(self) -> EventSink:
        return self.state.events

    @property
    def run_spec(self) -> RunSpec:
        return self.state.spec

    def resolve(self, ref: str) -> JsonValue:
        sources = RefSources(
            flow_input=self.flow_frame.flow_input,
            run_context=self.state.spec.run_context(),
            frame=self.frame,
            node_output=self._visible_output,
        )
        return evaluate_ref(ref, sources)

    def bind(self, bindings: Sequence[CompiledBinding]) -> JsonObject:
        return {binding.name: self._bound(binding) for binding in bindings}

    def output_of(self, node_id: NodeId) -> JsonValue:
        return self._lookup(node_id)

    async def run_child(self, node_id: NodeId, entry: ChildEntry) -> NodeOutcome:
        return await self._child(node_id, entry, None)

    async def run_child_with_inputs(self, node_id: NodeId, entry: ChildEntry, inputs: JsonObject) -> NodeOutcome:
        return await self._child(node_id, entry, inputs)

    async def run_flow(self, flow_id: FlowId, flow_input: JsonObject) -> NodeOutcome:
        called = FlowFrame(
            flow=self.project.flow(flow_id),
            flow_input=flow_input,
            prefix=call_prefix(self.address),
            values=ValueStore(),
        )
        return await run_flow_nodes(self.state, called, self.chain)

    def derive(self, entry: ChildEntry) -> NodeScope:
        entered = self.chain[0].enter(entry)
        return replace(self, chain=entered_chain(self.chain, entered), frame=merged_frame(self.frame, entry.frame))

    def scope_for(self, node: CompiledNode, chain: tuple[AddressContext, ...], frame: ScopeFrame) -> NodeScope:
        address = chain[0].at(prefixed_node_id(self.flow_frame.prefix, node.node_id))
        return NodeScope(
            state=self.state,
            flow_frame=self.flow_frame,
            owner=node,
            address=address,
            chain=chain,
            frame=frame,
            output=BatchedOutputSink(run_id=self.state.run_id, address=address),
        )

    def _bound(self, binding: CompiledBinding) -> JsonValue:
        if self.overlay is not None and binding.name in self.overlay:
            return self.overlay[binding.name]
        match binding:
            case RefBinding():
                return self.resolve(binding.ref)
            case LiteralBinding():
                return binding.value
            case _:
                assert_never(binding)

    def _visible_output(self, name: str) -> JsonValue:
        owner = self.owner.node_id if self.owner is not None else None
        node_id = visible_node(self.flow, owner, name)
        if node_id is None:
            raise RefUnresolved(f"${name}.out", f"node {name} is not visible from {owner or 'returns'}")
        return self._lookup(node_id)

    def _lookup(self, node_id: NodeId) -> JsonValue:
        prefixed = prefixed_node_id(self.flow_frame.prefix, node_id)
        values = self.flow_frame.values
        found = next((address for address in (ctx.at(prefixed) for ctx in self.chain) if values.has(address)), None)
        if found is None:
            raise RefUnresolved(f"${node_id}.out", "node has no output in this execution scope")
        return values.get(found)

    @property
    def launches_branches(self) -> bool:
        return self.owner is not None and node_kind(self.owner) in BRANCH_KINDS

    async def start_child(self, node_id: NodeId, entry: ChildEntry, overlay: JsonObject | None) -> StartedBranch:
        node = self.flow.node(node_id)
        chain = entered_chain(self.chain, self.chain[0].enter(entry))
        return await start_branch(self, node, chain, merged_frame(self.frame, entry.frame), overlay)

    async def collect_child(self, started: StartedBranch) -> NodeOutcome:
        return await collect_branch(self, started)

    async def _child(self, node_id: NodeId, entry: ChildEntry, overlay: JsonObject | None) -> NodeOutcome:
        node = self.flow.node(node_id)
        chain = entered_chain(self.chain, self.chain[0].enter(entry))
        frame = merged_frame(self.frame, entry.frame)
        if self.launches_branches:
            return await launch_branch(self, node, chain, frame, overlay)
        return await run_node(replace(self.scope_for(node, chain, frame), overlay=overlay))


def entered_chain(chain: tuple[AddressContext, ...], entered: AddressContext) -> tuple[AddressContext, ...]:
    return chain if entered == chain[0] else (entered, *chain)


def finished_status(outcome: NodeOutcome) -> FinishedExecutionStatus:
    match outcome:
        case NodeSucceeded():
            return "ok"
        case NodeFailed():
            return "failed"
        case NodeSkipped():
            return "skipped"
        case NodeCancelled():
            return "cancelled"
        case _:
            assert_never(outcome)


def output_ref(outcome: NodeOutcome) -> InlineValue | None:
    return InlineValue(value=outcome.output) if isinstance(outcome, NodeSucceeded) else None


def stops_flow(outcome: NodeOutcome) -> bool:
    return isinstance(outcome, NodeFailed | NodeCancelled)


@dataclass(frozen=True, slots=True)
class NodeStartedBuilder:
    address: ExecutionAddress
    kind: NodeKind
    attempt: int

    def __call__(self, stamp: EventStamp) -> RunEvent:
        return NodeStarted(
            seq=stamp.seq,
            at=stamp.at,
            run_id=stamp.run_id,
            address=self.address,
            kind=self.kind,
            attempt=self.attempt,
            queued_ms=0,
        )


@dataclass(frozen=True, slots=True)
class NodeFinishedBuilder:
    address: ExecutionAddress
    outcome: NodeOutcome
    attempt: int
    latency_ms: int

    def __call__(self, stamp: EventStamp) -> RunEvent:
        outcome = self.outcome
        succeeded = outcome if isinstance(outcome, NodeSucceeded) else None
        usage = outcome.usage if isinstance(outcome, NodeSucceeded | NodeFailed) else None
        attempt = (
            max(self.attempt, outcome.attempt) if isinstance(outcome, NodeSucceeded | NodeFailed) else self.attempt
        )
        return NodeFinished(
            seq=stamp.seq,
            at=stamp.at,
            run_id=stamp.run_id,
            address=self.address,
            status=finished_status(outcome),
            attempt=attempt,
            output_ref=output_ref(outcome),
            cost_usd=usage.cost_usd if usage is not None else Decimal(0),
            tokens_in=usage.tokens_in if usage is not None else 0,
            tokens_out=usage.tokens_out if usage is not None else 0,
            latency_ms=self.latency_ms,
            model=outcome.model if isinstance(outcome, NodeSucceeded | NodeFailed) else None,
            cache_hit=succeeded.cache_hit if succeeded is not None else False,
            degraded=succeeded.degraded if succeeded is not None else False,
            checks_failed=succeeded.checks_failed if succeeded is not None else 0,
            error=outcome.error if isinstance(outcome, NodeFailed) else None,
        )


async def guarded_execute(scope: NodeScope, node: CompiledNode) -> NodeOutcome:
    override = override_for(scope.state.spec.outputs, scope.address)
    if override is not None:
        return override_outcome(override, scope.address)
    try:
        return await execute_node(scope.state.runtime.executors, node, scope)
    except Exception as error:
        return failure_of(error, scope.address)


async def run_node(scope: NodeScope) -> NodeOutcome:
    node = scope.owner
    if node is None:
        return NodeFailed(error=run_error(INTERNAL, "execution has no node", scope.address))
    state = scope.state
    attempt = state.next_attempt(scope.address)
    await node_boundary(scope.address.model_dump(mode="json"), attempt)
    await state.events.emit(NodeStartedBuilder(scope.address, node_kind(node), attempt))
    started = time.monotonic()
    outcome = await guarded_execute(replace(scope, attempt=attempt), node)
    record_outcome(scope, node, outcome)
    latency = int((time.monotonic() - started) * MILLISECONDS)
    await state.events.emit(NodeFinishedBuilder(scope.address, outcome, attempt, latency))
    return outcome


def record_outcome(scope: NodeScope, node: CompiledNode, outcome: NodeOutcome) -> None:
    if isinstance(outcome, NodeSucceeded):
        scope.flow_frame.values.put(scope.address, outcome.output)
    if isinstance(outcome, NodeSucceeded | NodeFailed) and node_kind(node) in USAGE_KINDS:
        scope.state.usage = scope.state.usage.plus_node(outcome.usage)


async def run_flow_nodes(state: RunState, frame: FlowFrame, chain: tuple[AddressContext, ...]) -> NodeOutcome:
    anchor = chain[0].at(prefixed_node_id(frame.prefix, frame.flow.flow_id))
    root = NodeScope(
        state=state,
        flow_frame=frame,
        owner=None,
        address=anchor,
        chain=chain,
        frame=ScopeFrame(),
        output=BatchedOutputSink(run_id=state.run_id, address=anchor),
    )
    selected = state.spec.selected_nodes if not frame.prefix else None
    ranged = not frame.prefix and state.spec.start_node is not None and state.spec.end_node is not None
    order = (
        range_order(frame.flow, state.spec.start_node, state.spec.end_node)
        if ranged and state.spec.start_node is not None and state.spec.end_node is not None
        else execution_order(frame.flow, selected)
    )
    selected_outputs: dict[str, JsonValue] = {}
    for node_id in order:
        outcome = await run_node(root.scope_for(frame.flow.node(node_id), chain, ScopeFrame()))
        if stops_flow(outcome):
            return outcome
        if ranged or (selected is not None and node_id in selected):
            selected_outputs[node_id] = outcome.output if isinstance(outcome, NodeSucceeded) else None
    if ranged or selected is not None:
        return NodeSucceeded(output=selected_outputs)
    try:
        return NodeSucceeded(output=root.bind(frame.flow.returns))
    except RefUnresolved as error:
        return NodeFailed(error=run_error(RETURNS_BINDING, str(error), anchor))


def context_tuple(context: AddressContext) -> tuple[str | None, int | None, int | None]:
    return (context.branch_key, context.iteration, context.item_index)


@dataclass(frozen=True, slots=True)
class StartedBranch:
    handle: WorkflowHandleAsync[JsonObject]
    order: int

    @property
    def workflow_id(self) -> str:
        return self.handle.workflow_id


async def start_branch(
    parent: NodeScope,
    node: CompiledNode,
    chain: tuple[AddressContext, ...],
    frame: ScopeFrame,
    overlay: JsonObject | None,
) -> StartedBranch:
    state = parent.state
    address = chain[0].at(prefixed_node_id(parent.flow_frame.prefix, node.node_id))
    order = state.next_branch()
    ticket = BranchTicket(
        run_id=state.run_id,
        spec=state.spec,
        flow_id=parent.flow.flow_id,
        flow_input=parent.flow_frame.flow_input,
        prefix=parent.flow_frame.prefix,
        node_id=node.node_id,
        chain=tuple(context_tuple(context) for context in chain),
        frame=frame.model_dump(mode="json", include=set(frame.model_fields_set)),
        values=parent.flow_frame.values.snapshot(),
        attempts=dict(state.attempts),
        overlay=overlay,
    )
    with SetWorkflowID(child_workflow_id(DBOS.workflow_id or state.run_id, address)):
        handle = await DBOS.start_workflow_async(run_branch, state.ir_hash, ticket.model_dump(mode="json"))
    return StartedBranch(handle=handle, order=order)


async def collect_branch(parent: NodeScope, started: StartedBranch) -> NodeOutcome:
    state = parent.state
    try:
        raw = await started.handle.get_result(polling_interval_sec=POLLING_INTERVAL_SECONDS)
    except dbos_errors.DBOSAwaitedWorkflowCancelledError:
        return NodeCancelled(reason=f"branch {started.workflow_id} was cancelled")
    result = BranchResult.model_validate(raw)
    parent.flow_frame.values.merge(result.values)
    state.merge_attempts(result.attempts)
    state.usage = state.usage.plus(result.usage)
    state.events.defer(started.order, result.events)
    return NODE_OUTCOME_ADAPTER.validate_python(result.outcome)


async def launch_branch(
    parent: NodeScope,
    node: CompiledNode,
    chain: tuple[AddressContext, ...],
    frame: ScopeFrame,
    overlay: JsonObject | None,
) -> NodeOutcome:
    return await collect_branch(parent, await start_branch(parent, node, chain, frame, overlay))


async def execute_branch(runtime: EngineRuntime, ir_hash: IrHash, ticket: BranchTicket) -> BranchResult:
    sink = BufferedEventSink(run_id=root_run_id(DBOS.workflow_id or ticket.run_id))
    plan = runtime.plans.find(ir_hash)
    chain = tuple(AddressContext(*context) for context in ticket.chain)
    address = chain[0].at(prefixed_node_id(ticket.prefix, ticket.node_id))
    if plan is None:
        failed = NodeFailed(error=run_error(PLAN_MISSING, f"plan snapshot {ir_hash} not found", address))
        return BranchResult(
            outcome=failed.model_dump(mode="json"), events=(), values={}, attempts={}, usage=RunUsageTotals()
        )
    state = RunState(
        runtime=runtime,
        run_id=root_run_id(DBOS.workflow_id or ticket.run_id),
        ir_hash=ir_hash,
        spec=ticket.spec,
        project=plan,
        events=sink,
        attempts=dict(ticket.attempts),
    )
    values = ValueStore(dict(ticket.values))
    frame = FlowFrame(flow=plan.flow(ticket.flow_id), flow_input=ticket.flow_input, prefix=ticket.prefix, values=values)
    node = frame.flow.node(NodeId(ticket.node_id))
    scope = NodeScope(
        state=state,
        flow_frame=frame,
        owner=node,
        address=address,
        chain=chain,
        frame=ScopeFrame.model_validate(ticket.frame),
        output=BatchedOutputSink(run_id=state.run_id, address=address),
        overlay=ticket.overlay,
    )
    outcome = await run_node(scope)
    return BranchResult(
        outcome=outcome.model_dump(mode="json"),
        events=sink.drain(),
        values=values.added_since(ticket.values),
        attempts=state.attempts,
        usage=state.usage,
    )


@DBOS.workflow(name=RUN_BRANCH_WORKFLOW)
async def run_branch(ir_hash: str, ticket: JsonObject) -> JsonObject:
    result = await execute_branch(active_runtime(), IrHash(ir_hash), BranchTicket.model_validate(ticket))
    return result.model_dump(mode="json")


@dataclass(frozen=True, slots=True)
class RunStartedBuilder:
    flow: CompiledFlow
    content_hash: str
    mode: RunMode
    flow_input: JsonObject
    order: tuple[NodeId, ...]

    def __call__(self, stamp: EventStamp) -> RunEvent:
        return RunStartedEvent(
            seq=stamp.seq,
            at=stamp.at,
            run_id=stamp.run_id,
            flow_id=self.flow.flow_id,
            content_hash=self.content_hash,
            mode=self.mode,
            order=self.order,
            input_ref=InlineValue(value=self.flow_input),
        )


@dataclass(frozen=True, slots=True)
class RunFinishedBuilder:
    record: RunRecord

    def __call__(self, stamp: EventStamp) -> RunEvent:
        record = self.record
        return RunFinished(
            seq=stamp.seq,
            at=stamp.at,
            run_id=stamp.run_id,
            status=record.status,
            output_ref=InlineValue(value=record.output) if record.status == "completed" else None,
            error=record.error,
            cost_usd=record.usage.cost_usd,
            tokens_in=record.usage.tokens_in,
            tokens_out=record.usage.tokens_out,
        )


def record_of(outcome: NodeOutcome, usage: RunUsageTotals) -> RunRecord:
    match outcome:
        case NodeSucceeded():
            return RunRecord(status="completed", output=outcome.output, usage=usage)
        case NodeFailed():
            return RunRecord(status="failed", error=outcome.error, usage=usage)
        case NodeCancelled():
            return RunRecord(status="cancelled", usage=usage)
        case NodeSkipped():
            return RunRecord(status="completed", usage=usage)
        case _:
            assert_never(outcome)


def failed_record(code: str, message: str) -> RunRecord:
    return RunRecord(status="failed", error=run_error(code, message, None))


async def finish(sink: EventSink, record: RunRecord) -> RunRecord:
    await sink.emit(RunFinishedBuilder(record))
    return record


async def guarded_flow(state: RunState, frame: FlowFrame) -> NodeOutcome:
    try:
        return await run_flow_nodes(state, frame, (ROOT_CONTEXT,))
    except Exception as error:
        failure = failure_of(error, None)
        return NodeFailed(error=run_error(INTERNAL, failure.error.message, None))


async def interpret(runtime: EngineRuntime, ir_hash: IrHash, flow_input: JsonObject, spec: RunSpec) -> RunRecord:
    run_id = RunId(DBOS.workflow_id or "")
    sink = StreamEventSink(run_id=run_id)
    plan = runtime.plans.find(ir_hash)
    if plan is None:
        return await finish(sink, failed_record(PLAN_MISSING, f"plan snapshot {ir_hash} is not in the store"))
    if spec.flow_id not in plan.flows:
        return await finish(sink, failed_record(FLOW_NOT_FOUND, f"flow {spec.flow_id} is not in plan {ir_hash}"))
    flow = plan.flow(spec.flow_id)
    try:
        order = (
            range_order(flow, spec.start_node, spec.end_node)
            if spec.start_node is not None and spec.end_node is not None
            else execution_order(flow, spec.selected_nodes)
        )
    except SelectionError as error:
        return await finish(sink, failed_record("INPUT_INVALID", str(error)))
    await sink.emit(RunStartedBuilder(flow, flow_hash(plan, spec.flow_id), spec.mode, flow_input, order))
    state = RunState(runtime=runtime, run_id=run_id, ir_hash=ir_hash, spec=spec, project=plan, events=sink)
    values = ValueStore()
    if spec.start_node is not None:
        first = flow.order.index(spec.start_node)
        preceding = frozenset(flow.order[:first])
        for node_id, output in spec.node_outputs.items():
            if node_id not in flow.nodes:
                continue
            owner = node_id
            while (parent := flow.node(owner).parent) is not None:
                owner = parent
            if owner in preceding:
                values.put(ROOT_CONTEXT.at(node_id), output)
    frame = FlowFrame(flow=flow, flow_input=flow_input, prefix="", values=values)
    outcome = await guarded_flow(state, frame)
    return await finish(sink, record_of(outcome, state.usage))


@DBOS.workflow(name=RUN_FLOW_WORKFLOW)
async def run_flow(ir_hash: str, flow_input: JsonObject, spec: JsonObject) -> JsonObject:
    record = await interpret(active_runtime(), IrHash(ir_hash), flow_input, RunSpec.model_validate(spec))
    return record.model_dump(mode="json")
