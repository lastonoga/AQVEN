from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Final

from aqven.ir import CompiledAgent, CompiledFlow, CompiledLlmNode, CompiledNode, CompiledProject
from aqven.loader import local_node_id
from aqven.ports.engine import EngineError
from aqven.runtime.address import Problem
from aqven.spec import AgentId, FlowId, NodeId

OVERRIDES_FIELD: Final = "agent_overrides"
NODE_UNKNOWN: Final = "AGENT_OVERRIDE_NODE_UNKNOWN"
NODE_AMBIGUOUS: Final = "AGENT_OVERRIDE_NODE_AMBIGUOUS"
NODE_NOT_LLM: Final = "AGENT_OVERRIDE_NOT_LLM"
AGENT_UNKNOWN: Final = "AGENT_UNKNOWN"
NONE_LISTED: Final = "none"
LIST_SEPARATOR: Final = ", "
PROBLEM_SEPARATOR: Final = "; "


def listed(names: Iterable[str]) -> str:
    return LIST_SEPARATOR.join(sorted(names)) or NONE_LISTED


def matching_nodes(flow: CompiledFlow, node_id: NodeId) -> tuple[NodeId, ...]:
    if node_id in flow.nodes:
        return (node_id,)
    return tuple(candidate for candidate in flow.nodes if local_node_id(candidate) == node_id)


@dataclass(frozen=True, slots=True)
class AgentOverride:
    plan: CompiledProject
    flow: CompiledFlow
    node_id: NodeId
    agent_id: AgentId
    matches: tuple[NodeId, ...]

    @classmethod
    def of(cls, plan: CompiledProject, flow: CompiledFlow, node_id: NodeId, agent_id: AgentId) -> AgentOverride:
        return cls(plan, flow, node_id, agent_id, matching_nodes(flow, node_id))

    @property
    def target(self) -> NodeId:
        return self.matches[0]

    def problem(self, code: str, message: str) -> Problem:
        return Problem(path=(OVERRIDES_FIELD, self.node_id), code=code, message=message)

    def llm_nodes(self) -> str:
        return listed(node_id for node_id, node in self.flow.nodes.items() if isinstance(node, CompiledLlmNode))


type OverrideRule = Callable[[AgentOverride], Problem | None]


def unknown_node(override: AgentOverride) -> Problem | None:
    if override.matches:
        return None
    message = f"{override.node_id} is not a node of flow {override.flow.flow_id}; its llm nodes: {override.llm_nodes()}"
    return override.problem(NODE_UNKNOWN, message)


def ambiguous_node(override: AgentOverride) -> Problem | None:
    if len(override.matches) < 2:
        return None
    message = f"{override.node_id} names several nodes of flow {override.flow.flow_id}: {listed(override.matches)}"
    return override.problem(NODE_AMBIGUOUS, f"{message}; name one of them in full")


def not_llm(override: AgentOverride) -> Problem | None:
    node = override.flow.nodes[override.target]
    if isinstance(node, CompiledLlmNode):
        return None
    message = (
        f"{override.node_id} is a {node.kind} node and has no agent; "
        f"llm nodes of flow {override.flow.flow_id}: {override.llm_nodes()}"
    )
    return override.problem(NODE_NOT_LLM, message)


def unknown_agent(override: AgentOverride) -> Problem | None:
    if override.agent_id in override.plan.agents:
        return None
    message = f"agent {override.agent_id} does not exist in the project; agents: {listed(override.plan.agents)}"
    return override.problem(AGENT_UNKNOWN, message)


OVERRIDE_RULES: Final[tuple[OverrideRule, ...]] = (unknown_node, ambiguous_node, not_llm, unknown_agent)


def override_problem(override: AgentOverride) -> Problem | None:
    return next((problem for problem in (rule(override) for rule in OVERRIDE_RULES) if problem is not None), None)


def answered_by(node: CompiledNode, agent: CompiledAgent) -> CompiledNode:
    if not isinstance(node, CompiledLlmNode):
        return node
    return node.model_copy(update={"agent": agent.agent_id, "output_mode": agent.output.mode})


def rejected(problems: tuple[Problem, ...]) -> EngineError:
    message = f"{OVERRIDES_FIELD}: {PROBLEM_SEPARATOR.join(problem.message for problem in problems)}"
    return EngineError("INPUT_INVALID", message, problems=problems)


def with_agent_overrides(
    plan: CompiledProject, flow_id: FlowId, overrides: Mapping[NodeId, AgentId]
) -> CompiledProject:
    if not overrides:
        return plan
    flow = plan.flow(flow_id)
    requested = tuple(AgentOverride.of(plan, flow, node, agent) for node, agent in sorted(overrides.items()))
    problems = tuple(problem for problem in map(override_problem, requested) if problem is not None)
    if problems:
        raise rejected(problems)
    swapped = {item.target: answered_by(flow.nodes[item.target], plan.agent(item.agent_id)) for item in requested}
    answered = flow.model_copy(update={"nodes": {**flow.nodes, **swapped}})
    return plan.model_copy(update={"flows": {**plan.flows, flow_id: answered}})
