from typing import Annotated, Final, Literal, assert_never

from pydantic import Field, TypeAdapter

from aqven.ir.common import (
    AbsoluteCodeRef,
    CompiledBinding,
    CompiledPolicy,
    DynamicOutput,
    FieldIr,
    FieldName,
    IrModel,
    JsonSchema,
    RefBinding,
    RefText,
)
from aqven.spec import (
    AgentId,
    FlowId,
    InferenceId,
    Limits,
    NodeId,
    NodeKind,
    StructuredMode,
    TimeoutPolicy,
    ToolId,
    TypeId,
)

type OutputMode = StructuredMode


class CompiledNodeBase(IrModel):
    node_id: NodeId
    parent: NodeId | None = None
    description: Annotated[str, Field(min_length=1)]
    limits: Limits | None = None
    output_schema: JsonSchema


class BoundInputs(IrModel):
    inputs: tuple[CompiledBinding, ...] = ()
    input_schema: JsonSchema


class CompiledLlmNode(CompiledNodeBase, BoundInputs):
    kind: Literal["llm"] = "llm"
    agent: AgentId
    inference: InferenceId
    output_mode: OutputMode


class CompiledCodeNode(CompiledNodeBase, BoundInputs):
    kind: Literal["code"] = "code"
    run: AbsoluteCodeRef
    input_fields: tuple[FieldIr, ...] = ()
    output_fields: Annotated[tuple[FieldIr, ...], Field(min_length=1)]
    dynamic_outputs: tuple[DynamicOutput, ...] = ()


class CompiledToolNode(CompiledNodeBase, BoundInputs):
    kind: Literal["tool"] = "tool"
    tool: ToolId


class CompiledHumanNode(CompiledNodeBase, BoundInputs):
    kind: Literal["human"] = "human"
    form: TypeId
    assignee: Annotated[str, Field(min_length=1)]
    timeout_seconds: Annotated[int, Field(ge=1)]
    on_timeout: TimeoutPolicy


class CompiledParallelNode(CompiledNodeBase):
    kind: Literal["parallel"] = "parallel"
    branches: Annotated[dict[str, NodeId], Field(min_length=1)]
    join: CompiledPolicy
    outputs: Annotated[tuple[RefBinding, ...], Field(min_length=1)]


class CompiledMapNode(CompiledNodeBase):
    kind: Literal["map"] = "map"
    over: RefText
    body: NodeId
    concurrency: Annotated[int, Field(ge=1, le=256)] | None = None
    on_item_error: CompiledPolicy
    outputs: Annotated[tuple[RefBinding, ...], Field(min_length=1)]


class CompiledSwitchCase(IrModel):
    node: NodeId | None = None
    bindings: tuple[CompiledBinding, ...] = ()


class CompiledSwitchNode(CompiledNodeBase):
    kind: Literal["switch"] = "switch"
    on: RefText
    cases: Annotated[dict[str, CompiledSwitchCase], Field(min_length=1)]
    output_names: Annotated[tuple[FieldName, ...], Field(min_length=1)]


class CompiledLoopNode(CompiledNodeBase):
    kind: Literal["loop"] = "loop"
    body: Annotated[tuple[NodeId, ...], Field(min_length=1)]
    init: dict[NodeId, tuple[CompiledBinding, ...]] = Field(default_factory=dict[NodeId, tuple[CompiledBinding, ...]])
    max_iter: Annotated[int, Field(ge=1, le=50)]
    stop: tuple[CompiledPolicy, ...] = ()
    select: CompiledPolicy
    outputs: Annotated[tuple[RefBinding, ...], Field(min_length=1)]


class CompiledCallNode(CompiledNodeBase, BoundInputs):
    kind: Literal["call"] = "call"
    flow: FlowId


class CompiledNarrowNode(CompiledNodeBase):
    kind: Literal["narrow"] = "narrow"
    source: RefText
    to: TypeId


type CompiledNode = Annotated[
    CompiledLlmNode
    | CompiledCodeNode
    | CompiledToolNode
    | CompiledHumanNode
    | CompiledParallelNode
    | CompiledMapNode
    | CompiledSwitchNode
    | CompiledLoopNode
    | CompiledCallNode
    | CompiledNarrowNode,
    Field(discriminator="kind"),
]

COMPILED_NODE_ADAPTER: Final[TypeAdapter[CompiledNode]] = TypeAdapter(CompiledNode)


def node_kind(node: CompiledNode) -> NodeKind:
    return NodeKind(node.kind)


def inner_node_ids(node: CompiledNode) -> tuple[NodeId, ...]:
    match node:
        case CompiledParallelNode():
            return tuple(node.branches.values())
        case CompiledMapNode():
            return (node.body,)
        case CompiledSwitchNode():
            return tuple(case.node for case in node.cases.values() if case.node is not None)
        case CompiledLoopNode():
            return node.body
        case (
            CompiledLlmNode()
            | CompiledCodeNode()
            | CompiledToolNode()
            | CompiledHumanNode()
            | CompiledCallNode()
            | CompiledNarrowNode()
        ):
            return ()
        case _:
            assert_never(node)
