from collections.abc import Callable, Container, Iterable, Mapping
from typing import Annotated, Final, Literal, Self, assert_never

from pydantic import Field, model_validator

from aqven.ir.common import IR_VERSION, CompiledBinding, IrModel, JsonSchema, TypeRefText
from aqven.ir.nodes import (
    CompiledCallNode,
    CompiledCodeNode,
    CompiledHumanNode,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledMapNode,
    CompiledNarrowNode,
    CompiledNode,
    CompiledParallelNode,
    CompiledSwitchNode,
    CompiledToolNode,
    inner_node_ids,
)
from aqven.ir.registry import (
    CompiledAgent,
    CompiledInference,
    CompiledMcpServer,
    CompiledTool,
    judges_of,
    tool_server_ids,
)
from aqven.spec import (
    AgentId,
    ContractPredicate,
    FlowId,
    InferenceId,
    Limits,
    McpServerId,
    NodeId,
    ProjectPolicies,
    ProviderSpec,
    RunContextKey,
    ToolId,
    TypeId,
)

type IrEntityKind = Literal["flow", "node", "agent", "inference", "tool", "mcp_server", "type"]


class IrLookupError(LookupError):
    def __init__(self, kind: IrEntityKind, entity_id: str) -> None:
        super().__init__(f"{kind} {entity_id} is not in the compiled plan")
        self.kind = kind
        self.entity_id = entity_id


class IrIntegrityError(ValueError):
    def __init__(self, problems: Iterable[str]) -> None:
        self.problems = tuple(problems)
        super().__init__("; ".join(self.problems))


def _lookup[K: str, V](entries: Mapping[K, V], kind: IrEntityKind, key: K) -> V:
    value = entries.get(key)
    if value is None:
        raise IrLookupError(kind, key)
    return value


def _mismatched_keys[K: str, V](kind: IrEntityKind, entries: Mapping[K, V], identity: Callable[[V], str]) -> list[str]:
    return [
        f"{kind} under key {key} names itself {identity(value)}"
        for key, value in entries.items()
        if key != identity(value)
    ]


def _missing(kind: IrEntityKind, owner: str, wanted: Iterable[str], known: Container[str]) -> list[str]:
    return [
        f"{owner} references {kind} {entity_id}, which does not exist" for entity_id in wanted if entity_id not in known
    ]


class CompiledFlow(IrModel):
    flow_id: FlowId
    description: Annotated[str, Field(min_length=1)]
    input_type: TypeRefText
    output_type: TypeRefText
    input_schema: JsonSchema
    output_schema: JsonSchema
    returns: Annotated[tuple[CompiledBinding, ...], Field(min_length=1)]
    context: tuple[RunContextKey, ...] = ()
    limits: Limits | None = None
    order: Annotated[tuple[NodeId, ...], Field(min_length=1)]
    nodes: Annotated[dict[NodeId, CompiledNode], Field(min_length=1)]
    requires: tuple[ContractPredicate, ...] = ()

    @model_validator(mode="after")
    def _check_nodes(self) -> Self:
        problems = [
            *_mismatched_keys("node", self.nodes, lambda node: node.node_id),
            *_missing("node", f"order of flow {self.flow_id}", self.order, self.nodes),
            *(
                problem
                for node in self.nodes.values()
                for problem in _missing("node", f"node {node.node_id}", inner_node_ids(node), self.nodes)
            ),
        ]
        if problems:
            raise IrIntegrityError(problems)
        return self

    def node(self, node_id: NodeId) -> CompiledNode:
        return _lookup(self.nodes, "node", node_id)


class CompiledProject(IrModel):
    ir_version: Literal["aqven/ir/v1"] = IR_VERSION
    package: Annotated[str, Field(min_length=1)]
    description: Annotated[str, Field(min_length=1)]
    providers: tuple[ProviderSpec, ...] = ()
    policies: ProjectPolicies | None = None
    limits: Limits | None = None
    type_schemas: dict[TypeId, JsonSchema] = Field(default_factory=dict[TypeId, JsonSchema])
    agents: dict[AgentId, CompiledAgent] = Field(default_factory=dict[AgentId, CompiledAgent])
    inferences: dict[InferenceId, CompiledInference] = Field(default_factory=dict[InferenceId, CompiledInference])
    tools: dict[ToolId, CompiledTool] = Field(default_factory=dict[ToolId, CompiledTool])
    mcp_servers: dict[McpServerId, CompiledMcpServer] = Field(default_factory=dict[McpServerId, CompiledMcpServer])
    flows: dict[FlowId, CompiledFlow] = Field(default_factory=dict[FlowId, CompiledFlow])

    @model_validator(mode="after")
    def _check_registries(self) -> Self:
        problems = [
            *_mismatched_keys("agent", self.agents, lambda agent: agent.agent_id),
            *_mismatched_keys("inference", self.inferences, lambda inference: inference.inference_id),
            *_mismatched_keys("tool", self.tools, lambda tool: tool.tool_id),
            *_mismatched_keys("mcp_server", self.mcp_servers, lambda server: server.server_id),
            *_mismatched_keys("flow", self.flows, lambda flow: flow.flow_id),
            *(problem for rule in PROJECT_REFERENCE_RULES for problem in rule(self)),
        ]
        if problems:
            raise IrIntegrityError(problems)
        return self

    def flow(self, flow_id: FlowId) -> CompiledFlow:
        return _lookup(self.flows, "flow", flow_id)

    def agent(self, agent_id: AgentId) -> CompiledAgent:
        return _lookup(self.agents, "agent", agent_id)

    def inference(self, inference_id: InferenceId) -> CompiledInference:
        return _lookup(self.inferences, "inference", inference_id)

    def tool(self, tool_id: ToolId) -> CompiledTool:
        return _lookup(self.tools, "tool", tool_id)

    def mcp_server(self, server_id: McpServerId) -> CompiledMcpServer:
        return _lookup(self.mcp_servers, "mcp_server", server_id)

    def type_schema(self, type_id: TypeId) -> JsonSchema:
        return _lookup(self.type_schemas, "type", type_id)


type ReferenceRule = Callable[[CompiledProject], list[str]]


def _agent_references(project: CompiledProject) -> list[str]:
    return [
        problem
        for agent in project.agents.values()
        for problem in (
            *_missing("tool", f"agent {agent.agent_id}", agent.tools, project.tools),
            *_missing("mcp_server", f"agent {agent.agent_id}", agent.mcp_servers, project.mcp_servers),
            *_missing("agent", f"agent {agent.agent_id}", (sub.agent for sub in agent.subagents), project.agents),
            *_missing(
                "inference", f"agent {agent.agent_id}", (sub.inference for sub in agent.subagents), project.inferences
            ),
        )
    ]


def _inference_references(project: CompiledProject) -> list[str]:
    return [
        problem
        for inference in project.inferences.values()
        for judge in judges_of(inference)
        for problem in (
            *_missing("agent", f"inference {inference.inference_id}", (judge.agent,), project.agents),
            *_missing("inference", f"inference {inference.inference_id}", (judge.inference,), project.inferences),
        )
    ]


def _tool_references(project: CompiledProject) -> list[str]:
    return [
        problem
        for tool in project.tools.values()
        for problem in _missing("mcp_server", f"tool {tool.tool_id}", tool_server_ids(tool), project.mcp_servers)
    ]


def _node_references(project: CompiledProject) -> list[str]:
    return [
        problem
        for flow in project.flows.values()
        for node in flow.nodes.values()
        for problem in _references_of(project, node)
    ]


def _references_of(project: CompiledProject, node: CompiledNode) -> list[str]:
    owner = f"node {node.node_id}"
    match node:
        case CompiledLlmNode():
            return [
                *_missing("agent", owner, (node.agent,), project.agents),
                *_missing("inference", owner, (node.inference,), project.inferences),
            ]
        case CompiledToolNode():
            return _missing("tool", owner, (node.tool,), project.tools)
        case CompiledCallNode():
            return _missing("flow", owner, (node.flow,), project.flows)
        case (
            CompiledCodeNode()
            | CompiledHumanNode()
            | CompiledParallelNode()
            | CompiledMapNode()
            | CompiledSwitchNode()
            | CompiledLoopNode()
            | CompiledNarrowNode()
        ):
            return []
        case _:
            assert_never(node)


PROJECT_REFERENCE_RULES: Final[tuple[ReferenceRule, ...]] = (
    _agent_references,
    _inference_references,
    _tool_references,
    _node_references,
)
