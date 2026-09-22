from collections.abc import Callable, Mapping
from typing import Annotated, Final, Literal, Self

from pydantic import Field, model_validator

from aqven.spec.agent import DefaultOnTimeout as DefaultOnTimeout
from aqven.spec.agent import EscalateOnTimeout as EscalateOnTimeout
from aqven.spec.agent import FailOnTimeout as FailOnTimeout
from aqven.spec.agent import TimeoutPolicy as TimeoutPolicy
from aqven.spec.common import Limits, SpecModel
from aqven.spec.fields import BoundField, FieldBinding, FieldDecl, InputField, OutputField
from aqven.spec.names import AgentId, CodeRef, FlowId, InferenceId, NodeId, ToolId, TypeId
from aqven.spec.policy import PolicyRef
from aqven.spec.tool import JobWaitSpec as JobWaitSpec


class NodeHeader(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Node"]


class NodeTag[K: str](NodeHeader):
    node: K


class NodeBase(NodeHeader):
    description: str = Field(min_length=1)
    limits: Limits | None = None


class SwitchCase(SpecModel):
    node: NodeId | None = None
    bind: list[FieldBinding] | None = None

    @model_validator(mode="after")
    def _check_branch(self) -> Self:
        if self.node is None and self.bind is None:
            raise ValueError("a switch case sets node, bind or both")
        return self


class LlmNodeSpec(NodeBase, NodeTag[Literal["llm"]]):
    inference: InferenceId | None = None
    agent: AgentId
    in_: list[FieldBinding] = Field(default_factory=list[FieldBinding], alias="in")


class CodeNodeSpec(NodeBase, NodeTag[Literal["code"]]):
    run: CodeRef
    in_: list[InputField] = Field(default_factory=list[InputField], alias="in")
    out: list[OutputField] = Field(min_length=1)


class ToolNodeSpec(NodeBase, NodeTag[Literal["tool"]]):
    tool: ToolId
    in_: list[FieldBinding] = Field(default_factory=list[FieldBinding], alias="in")


class HumanNodeSpec(NodeBase, NodeTag[Literal["human"]]):
    form: TypeId
    assignee: str = Field(min_length=1)
    timeout_seconds: int = Field(ge=1)
    on_timeout: TimeoutPolicy
    in_: list[InputField] = Field(default_factory=list[InputField], alias="in")


class ParallelNodeSpec(NodeBase, NodeTag[Literal["parallel"]]):
    body: dict[str, NodeId] = Field(min_length=1)
    join: PolicyRef
    out: list[BoundField] = Field(min_length=1)


class MapNodeSpec(NodeBase, NodeTag[Literal["map"]]):
    over: str
    body: NodeId
    concurrency: int | None = Field(default=None, ge=1, le=256)
    on_item_error: PolicyRef
    out: list[BoundField] = Field(min_length=1)


class SwitchNodeSpec(NodeBase, NodeTag[Literal["switch"]]):
    on: str
    cases: dict[str, SwitchCase] = Field(min_length=1)
    out: list[FieldDecl] = Field(min_length=1)


class LoopNodeSpec(NodeBase, NodeTag[Literal["loop"]]):
    body: list[NodeId] = Field(min_length=1)
    init: dict[NodeId, list[FieldBinding]] | None = None
    max_iter: int = Field(ge=1, le=50)
    stop: list[PolicyRef] | None = None
    select: PolicyRef
    out: list[BoundField] = Field(min_length=1)


class CallNodeSpec(NodeBase, NodeTag[Literal["call"]]):
    flow: FlowId
    in_: list[FieldBinding] = Field(default_factory=list[FieldBinding], alias="in")


class NarrowNodeSpec(NodeBase, NodeTag[Literal["narrow"]]):
    from_: str = Field(alias="from")
    to: TypeId


type NodeSpec = Annotated[
    LlmNodeSpec
    | CodeNodeSpec
    | ToolNodeSpec
    | HumanNodeSpec
    | ParallelNodeSpec
    | MapNodeSpec
    | SwitchNodeSpec
    | LoopNodeSpec
    | CallNodeSpec
    | NarrowNodeSpec,
    Field(discriminator="node"),
]

UNSUPPORTED_NODE_KINDS: Final = frozenset({"seq", "race", "gate", "try", "const"})

NODE_SPEC_CLASSES: tuple[
    type[LlmNodeSpec],
    type[CodeNodeSpec],
    type[ToolNodeSpec],
    type[HumanNodeSpec],
    type[ParallelNodeSpec],
    type[MapNodeSpec],
    type[SwitchNodeSpec],
    type[LoopNodeSpec],
    type[CallNodeSpec],
    type[NarrowNodeSpec],
] = (
    LlmNodeSpec,
    CodeNodeSpec,
    ToolNodeSpec,
    HumanNodeSpec,
    ParallelNodeSpec,
    MapNodeSpec,
    SwitchNodeSpec,
    LoopNodeSpec,
    CallNodeSpec,
    NarrowNodeSpec,
)


def inner_nodes(spec: NodeSpec) -> tuple[NodeId, ...]:
    reader = INNER_NODE_READERS.get(type(spec))
    return reader(spec) if reader is not None else ()


def _parallel_inner(spec: NodeSpec) -> tuple[NodeId, ...]:
    return tuple(spec.body.values()) if isinstance(spec, ParallelNodeSpec) else ()


def _map_inner(spec: NodeSpec) -> tuple[NodeId, ...]:
    return (spec.body,) if isinstance(spec, MapNodeSpec) else ()


def _switch_inner(spec: NodeSpec) -> tuple[NodeId, ...]:
    if not isinstance(spec, SwitchNodeSpec):
        return ()
    return tuple(case.node for case in spec.cases.values() if case.node is not None)


def _loop_inner(spec: NodeSpec) -> tuple[NodeId, ...]:
    return tuple(spec.body) if isinstance(spec, LoopNodeSpec) else ()


INNER_NODE_READERS: Final[Mapping[type, Callable[[NodeSpec], tuple[NodeId, ...]]]] = {
    ParallelNodeSpec: _parallel_inner,
    MapNodeSpec: _map_inner,
    SwitchNodeSpec: _switch_inner,
    LoopNodeSpec: _loop_inner,
}
