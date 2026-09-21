import asyncio
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from pydantic import JsonValue

from aqven.ir import (
    CompiledBinding,
    CompiledCodeNode,
    CompiledFlow,
    CompiledNode,
    CompiledProject,
    FieldIr,
    IrHash,
    LiteralBinding,
    RefBinding,
)
from aqven.policies.paths import pick
from aqven.ports.execution import (
    ChildEntry,
    EventBuilder,
    EventStamp,
    NodeFailed,
    NodeOutcome,
    NodeSucceeded,
    NodeUsage,
    OutputPart,
    ScopeFrame,
)
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId, node_address
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import RunError
from aqven.runtime.vocabulary import AttemptCauseKind, RunMode
from aqven.spec import CodeRef, FlowId, NodeId, RefRoot, parse_ref

SCHEMA: Final[dict[str, JsonValue]] = {"type": "object"}
RUN_ID: Final = RunId("run-1")
IR_HASH: Final = IrHash("sha256-" + "0" * 64)


@dataclass(frozen=True, slots=True)
class ChildCall:
    node_id: NodeId
    entry: ChildEntry
    inputs: JsonObject | None


type Behavior = Callable[[ChildCall], Awaitable[NodeOutcome]]


@dataclass(slots=True)
class RecordingSink:
    events: list[RunEvent] = field(default_factory=list[RunEvent])

    async def emit(self, build: EventBuilder) -> RunEvent:
        event = build(EventStamp(RUN_ID, len(self.events) + 1, datetime(2026, 9, 17, tzinfo=UTC)))
        self.events.append(event)
        return event


@dataclass(slots=True)
class SilentOutput:
    async def append(self, attempt: int, part: OutputPart, delta: str) -> None:
        return None

    async def discard(self, attempt: int, cause: AttemptCauseKind) -> None:
        return None

    async def flush(self) -> None:
        return None


@dataclass(slots=True)
class Tracker:
    running: int = 0
    peak: int = 0
    cancelled: list[NodeId] = field(default_factory=list[NodeId])
    finished: list[str] = field(default_factory=list[str])


@dataclass(slots=True)
class FakeScope:
    node: CompiledNode
    behaviors: Mapping[NodeId, Behavior]
    input_value: JsonObject = field(default_factory=dict[str, JsonValue])
    outputs: dict[NodeId, JsonValue] = field(default_factory=dict[NodeId, JsonValue])
    scope_frame: ScopeFrame = field(default_factory=ScopeFrame)
    sink: RecordingSink = field(default_factory=RecordingSink)
    calls: list[ChildCall] = field(default_factory=list[ChildCall])

    @property
    def run_id(self) -> RunId:
        return RUN_ID

    @property
    def mode(self) -> RunMode:
        return "live"

    @property
    def ir_hash(self) -> IrHash:
        return IR_HASH

    @property
    def project(self) -> CompiledProject:
        return CompiledProject(package="shop", description="project", flows={self.flow.flow_id: self.flow})

    @property
    def flow(self) -> CompiledFlow:
        return flow_of(self.node, tuple(self.behaviors))

    @property
    def address(self) -> ExecutionAddress:
        return node_address(self.node.node_id)

    @property
    def frame(self) -> ScopeFrame:
        return self.scope_frame

    @property
    def events(self) -> RecordingSink:
        return self.sink

    @property
    def output(self) -> SilentOutput:
        return SilentOutput()

    def resolve(self, ref: str) -> JsonValue:
        parsed = parse_ref(ref)
        roots: Mapping[RefRoot, JsonValue] = {
            RefRoot.INPUT: self.input_value,
            RefRoot.ITEM: self.scope_frame.item,
            RefRoot.INDEX: self.scope_frame.index,
            RefRoot.ACC: self.scope_frame.acc,
        }
        head = self.outputs.get(parsed.node_id) if parsed.node_id is not None else roots.get(parsed.root)
        return pick(head, parsed.steps)

    def bind(self, bindings: Sequence[CompiledBinding]) -> JsonObject:
        return {binding.name: self._bound(binding) for binding in bindings}

    def output_of(self, node_id: NodeId) -> JsonValue:
        return self.outputs.get(node_id)

    async def run_child(self, node_id: NodeId, entry: ChildEntry) -> NodeOutcome:
        return await self._run(ChildCall(node_id, entry, None))

    async def run_flow(self, flow_id: FlowId, flow_input: JsonObject) -> NodeOutcome:
        return failed("E_NOT_SUPPORTED", f"flow {flow_id}")

    def _bound(self, binding: CompiledBinding) -> JsonValue:
        if isinstance(binding, LiteralBinding):
            return binding.value
        return self.resolve(binding.ref)

    async def _run(self, call: ChildCall) -> NodeOutcome:
        self.calls.append(call)
        return await self.behaviors[call.node_id](call)


@dataclass(slots=True)
class OverlayScope(FakeScope):
    async def run_child_with_inputs(self, node_id: NodeId, entry: ChildEntry, inputs: JsonObject) -> NodeOutcome:
        return await self._run(ChildCall(node_id, entry, inputs))


def flow_of(node: CompiledNode, children: Sequence[NodeId]) -> CompiledFlow:
    inner = tuple(child_node(child, node.node_id) for child in children)
    return CompiledFlow(
        flow_id=FlowId("intake"),
        description="flow",
        input_type="CaseRequest",
        output_type="CaseOutcome",
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        returns=(RefBinding(name="result", ref=f"${node.node_id}.out"),),
        order=(node.node_id,),
        nodes={item.node_id: item for item in (node, *inner)},
    )


def child_node(node_id: NodeId, parent: NodeId) -> CompiledCodeNode:
    return CompiledCodeNode(
        node_id=node_id,
        parent=parent,
        description="body",
        run=CodeRef("shop.nodes:run"),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        output_fields=(FieldIr(name="value", type="Text", description="value"),),
    )


def usage(cost: str, tokens: int = 1) -> NodeUsage:
    return NodeUsage(cost_usd=Decimal(cost), tokens_in=tokens, tokens_out=tokens, requests=1)


def succeeded(output: JsonValue, cost: str = "0.001") -> NodeSucceeded:
    return NodeSucceeded(output=output, usage=usage(cost))


def failed(code: str, message: str, cost: str = "0") -> NodeFailed:
    return NodeFailed(error=RunError(code=code, message=message, address=None), usage=usage(cost, 0))


def after(delay: float, outcome: NodeOutcome, tracker: Tracker, label: str) -> Behavior:
    async def behave(call: ChildCall) -> NodeOutcome:
        tracker.running += 1
        tracker.peak = max(tracker.peak, tracker.running)
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            tracker.cancelled.append(call.node_id)
            raise
        finally:
            tracker.running -= 1
        tracker.finished.append(label)
        return outcome

    return behave


def by_item(outcomes: Callable[[ChildCall], tuple[float, NodeOutcome]], tracker: Tracker) -> Behavior:
    async def behave(call: ChildCall) -> NodeOutcome:
        delay, outcome = outcomes(call)
        return await after(delay, outcome, tracker, str(call.entry.item_index))(call)

    return behave
