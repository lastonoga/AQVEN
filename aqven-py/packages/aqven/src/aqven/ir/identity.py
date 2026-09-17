from dataclasses import dataclass, field
from typing import Final, assert_never

from pydantic import JsonValue

from aqven.ir.hashing import HashDomain, IrHash, hash_of, model_hash, model_json
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
)
from aqven.ir.plan import CompiledFlow, CompiledProject
from aqven.ir.registry import (
    CompiledAgent,
    CompiledInference,
    CompiledMcpServer,
    CompiledTool,
    judges_of,
    tool_server_ids,
)
from aqven.spec import AgentId, FlowId, InferenceId, McpServerId, ToolId

PLAN_EXCLUDED_FIELDS: Final = frozenset({"description", "type_schemas"})
BEHAVIOR_EXCLUDED_FIELDS: Final = frozenset({"description"})


@dataclass(slots=True)
class _Reach:
    project: CompiledProject
    flows: dict[FlowId, CompiledFlow] = field(default_factory=dict[FlowId, CompiledFlow])
    agents: dict[AgentId, CompiledAgent] = field(default_factory=dict[AgentId, CompiledAgent])
    inferences: dict[InferenceId, CompiledInference] = field(default_factory=dict[InferenceId, CompiledInference])
    tools: dict[ToolId, CompiledTool] = field(default_factory=dict[ToolId, CompiledTool])
    mcp_servers: dict[McpServerId, CompiledMcpServer] = field(default_factory=dict[McpServerId, CompiledMcpServer])

    def flow(self, flow_id: FlowId) -> None:
        if flow_id in self.flows:
            return
        compiled = self.project.flow(flow_id)
        self.flows[flow_id] = compiled
        for node in compiled.nodes.values():
            self.node(node)

    def node(self, node: CompiledNode) -> None:
        match node:
            case CompiledLlmNode():
                self.agent(node.agent)
                self.inference(node.inference)
            case CompiledToolNode():
                self.tool(node.tool)
            case CompiledCallNode():
                self.flow(node.flow)
            case (
                CompiledCodeNode()
                | CompiledHumanNode()
                | CompiledParallelNode()
                | CompiledMapNode()
                | CompiledSwitchNode()
                | CompiledLoopNode()
                | CompiledNarrowNode()
            ):
                return
            case _:
                assert_never(node)

    def agent(self, agent_id: AgentId) -> None:
        if agent_id in self.agents:
            return
        compiled = self.project.agent(agent_id)
        self.agents[agent_id] = compiled
        for tool_id in compiled.tools:
            self.tool(tool_id)
        for server_id in compiled.mcp_servers:
            self.mcp_server(server_id)
        for subagent in compiled.subagents:
            self.agent(subagent.agent)
            self.inference(subagent.inference)

    def inference(self, inference_id: InferenceId) -> None:
        if inference_id in self.inferences:
            return
        compiled = self.project.inference(inference_id)
        self.inferences[inference_id] = compiled
        for judge in judges_of(compiled):
            self.agent(judge.agent)
            self.inference(judge.inference)

    def tool(self, tool_id: ToolId) -> None:
        if tool_id in self.tools:
            return
        compiled = self.project.tool(tool_id)
        self.tools[tool_id] = compiled
        for server_id in tool_server_ids(compiled):
            self.mcp_server(server_id)

    def mcp_server(self, server_id: McpServerId) -> None:
        self.mcp_servers[server_id] = self.project.mcp_server(server_id)

    def plan(self) -> CompiledProject:
        return CompiledProject(
            ir_version=self.project.ir_version,
            package=self.project.package,
            description=self.project.description,
            providers=self.project.providers,
            policies=self.project.policies,
            limits=self.project.limits,
            agents=self.agents,
            inferences=self.inferences,
            tools=self.tools,
            mcp_servers=self.mcp_servers,
            flows=self.flows,
        )


def flow_closure(project: CompiledProject, flow_id: FlowId) -> CompiledProject:
    reach = _Reach(project)
    reach.flow(flow_id)
    return reach.plan()


def flow_hash(project: CompiledProject, flow_id: FlowId) -> IrHash:
    plan = flow_closure(project, flow_id).model_dump(mode="json", by_alias=True, exclude=set(PLAN_EXCLUDED_FIELDS))
    return hash_of(HashDomain.FLOW_SPEC, {"flow_id": flow_id, "plan": plan})


def project_hash(project: CompiledProject) -> IrHash:
    return model_hash(HashDomain.PROJECT, project)


def node_body_hash(node: CompiledNode) -> IrHash:
    return model_hash(HashDomain.NODE_BODY, node)


def node_behavior_hash(project: CompiledProject, node: CompiledNode) -> IrHash:
    reach = _Reach(project)
    reach.node(node)
    dependencies: dict[str, JsonValue] = {
        "agents": {key: model_json(value) for key, value in reach.agents.items()},
        "inferences": {key: model_json(value) for key, value in reach.inferences.items()},
        "tools": {key: model_json(value) for key, value in reach.tools.items()},
        "mcp_servers": {key: model_json(value) for key, value in reach.mcp_servers.items()},
        "flows": {key: flow_hash(project, key) for key in reach.flows},
    }
    body = node.model_dump(mode="json", by_alias=True, exclude=set(BEHAVIOR_EXCLUDED_FIELDS))
    return hash_of(HashDomain.NODE_BEHAVIOR, {"node": body, "dependencies": dependencies})
