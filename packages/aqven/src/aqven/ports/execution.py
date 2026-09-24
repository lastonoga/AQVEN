from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Annotated, Literal, Protocol, assert_never, runtime_checkable

from pydantic import AwareDatetime, Field, JsonValue

from aqven.ir import (
    CompiledBinding,
    CompiledCallNode,
    CompiledCodeNode,
    CompiledFlow,
    CompiledHumanNode,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledMapNode,
    CompiledNarrowNode,
    CompiledNode,
    CompiledParallelNode,
    CompiledProject,
    CompiledSwitchNode,
    CompiledToolNode,
    IrHash,
)
from aqven.runtime.address import ExecutionAddress, JsonObject, RequestModel, ResourceModel, RunId
from aqven.runtime.costs import EXACT_COST, weakest_cost_source
from aqven.runtime.events import OutputPartKind, RunEvent
from aqven.runtime.executions import RunError
from aqven.runtime.vocabulary import AttemptCauseKind, CostSource, RunMode
from aqven.spec import FlowId, NodeId


@dataclass(frozen=True, slots=True)
class EventStamp:
    run_id: RunId
    seq: int
    at: AwareDatetime


type EventBuilder = Callable[[EventStamp], RunEvent]


class RunEventSink(Protocol):
    async def emit(self, build: EventBuilder) -> RunEvent: ...


class OutputPart(RequestModel):
    kind: OutputPartKind
    index: Annotated[int, Field(ge=0)]
    tool_call_id: str | None = None
    tool_name: str | None = None


class OutputSink(Protocol):
    async def append(self, attempt: int, part: OutputPart, delta: str) -> None: ...

    async def discard(self, attempt: int, cause: AttemptCauseKind) -> None: ...

    async def flush(self) -> None: ...


class ScopeFrame(RequestModel):
    item: JsonValue = None
    index: Annotated[int, Field(ge=0)] | None = None
    case: JsonValue = None
    acc: JsonObject | None = None
    iter: JsonObject | None = None
    loop: JsonObject | None = None
    ok: tuple[JsonValue, ...] | None = None
    failed: tuple[JsonValue, ...] | None = None
    branch: JsonObject | None = None


class ChildEntry(RequestModel):
    branch_key: str | None = None
    iteration: Annotated[int, Field(ge=0)] | None = None
    item_index: Annotated[int, Field(ge=0)] | None = None
    frame: ScopeFrame = Field(default_factory=ScopeFrame)


class NodeUsage(ResourceModel):
    cost_usd: Decimal = Decimal(0)
    tokens_in: Annotated[int, Field(ge=0)] = 0
    tokens_out: Annotated[int, Field(ge=0)] = 0
    requests: Annotated[int, Field(ge=0)] = 0
    tool_calls: Annotated[int, Field(ge=0)] = 0
    cost_source: CostSource = EXACT_COST
    unpriced_calls: Annotated[int, Field(ge=0)] = 0


def combined_usage(parts: Iterable[NodeUsage]) -> NodeUsage:
    listed = tuple(parts)
    return NodeUsage(
        cost_usd=sum((Decimal(part.cost_usd) for part in listed), Decimal(0)),
        tokens_in=sum(part.tokens_in for part in listed),
        tokens_out=sum(part.tokens_out for part in listed),
        requests=sum(part.requests for part in listed),
        tool_calls=sum(part.tool_calls for part in listed),
        cost_source=weakest_cost_source(part.cost_source for part in listed),
        unpriced_calls=sum(part.unpriced_calls for part in listed),
    )


class NodeSucceeded(ResourceModel):
    status: Literal["ok"] = "ok"
    output: JsonValue
    usage: NodeUsage = Field(default_factory=NodeUsage)
    attempt: Annotated[int, Field(ge=1)] = 1
    model: str | None = None
    cache_hit: bool = False
    degraded: bool = False
    checks_failed: Annotated[int, Field(ge=0)] = 0


class NodeFailed(ResourceModel):
    status: Literal["failed"] = "failed"
    error: RunError
    usage: NodeUsage = Field(default_factory=NodeUsage)
    attempt: Annotated[int, Field(ge=1)] = 1
    model: str | None = None


class NodeSkipped(ResourceModel):
    status: Literal["skipped"] = "skipped"
    reason: str


class NodeCancelled(ResourceModel):
    status: Literal["cancelled"] = "cancelled"
    reason: str | None = None


type NodeOutcome = Annotated[
    NodeSucceeded | NodeFailed | NodeSkipped | NodeCancelled,
    Field(discriminator="status"),
]


class ExecutionScope(Protocol):
    @property
    def run_id(self) -> RunId: ...

    @property
    def mode(self) -> RunMode: ...

    @property
    def ir_hash(self) -> IrHash: ...

    @property
    def project(self) -> CompiledProject: ...

    @property
    def flow(self) -> CompiledFlow: ...

    @property
    def address(self) -> ExecutionAddress: ...

    @property
    def frame(self) -> ScopeFrame: ...

    @property
    def events(self) -> RunEventSink: ...

    @property
    def output(self) -> OutputSink: ...

    def resolve(self, ref: str) -> JsonValue: ...

    def bind(self, bindings: Sequence[CompiledBinding]) -> JsonObject: ...

    def output_of(self, node_id: NodeId) -> JsonValue: ...

    async def run_child(self, node_id: NodeId, entry: ChildEntry) -> NodeOutcome: ...

    async def run_flow(self, flow_id: FlowId, flow_input: JsonObject) -> NodeOutcome: ...


class NodeExecutor[N](Protocol):
    async def execute(self, node: N, scope: ExecutionScope) -> NodeOutcome: ...


@dataclass(frozen=True, slots=True)
class NodeExecutors:
    llm: NodeExecutor[CompiledLlmNode]
    code: NodeExecutor[CompiledCodeNode]
    tool: NodeExecutor[CompiledToolNode]
    human: NodeExecutor[CompiledHumanNode]
    parallel: NodeExecutor[CompiledParallelNode]
    map: NodeExecutor[CompiledMapNode]
    switch: NodeExecutor[CompiledSwitchNode]
    loop: NodeExecutor[CompiledLoopNode]
    call: NodeExecutor[CompiledCallNode]
    narrow: NodeExecutor[CompiledNarrowNode]


@runtime_checkable
class InputOverlayScope(Protocol):
    async def run_child_with_inputs(self, node_id: NodeId, entry: ChildEntry, inputs: JsonObject) -> NodeOutcome: ...


async def execute_node(executors: NodeExecutors, node: CompiledNode, scope: ExecutionScope) -> NodeOutcome:
    match node:
        case CompiledLlmNode():
            return await executors.llm.execute(node, scope)
        case CompiledCodeNode():
            return await executors.code.execute(node, scope)
        case CompiledToolNode():
            return await executors.tool.execute(node, scope)
        case CompiledHumanNode():
            return await executors.human.execute(node, scope)
        case CompiledParallelNode():
            return await executors.parallel.execute(node, scope)
        case CompiledMapNode():
            return await executors.map.execute(node, scope)
        case CompiledSwitchNode():
            return await executors.switch.execute(node, scope)
        case CompiledLoopNode():
            return await executors.loop.execute(node, scope)
        case CompiledCallNode():
            return await executors.call.execute(node, scope)
        case CompiledNarrowNode():
            return await executors.narrow.execute(node, scope)
        case _:
            assert_never(node)
