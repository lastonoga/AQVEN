import posixpath
from collections.abc import Collection, Iterable, Iterator, Mapping
from typing import Final

from liquid.exceptions import LiquidError

from aqven.check.context import CheckContext
from aqven.check.nodes import typed_entries
from aqven.check.templates import SERVICE_TAGS, IncludeLoader, prompt_environment
from aqven.check.types import reachable
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import SourceSpec, YamlPath, include_candidates
from aqven.spec import (
    AgentId,
    AgentSpec,
    DefaultOnTimeout,
    Effect,
    LlmNodeSpec,
    ToolNodeSpec,
    ToolSpec,
)

WRITE_EFFECTS: Final = frozenset({Effect.WRITE, Effect.EXTERNAL})
PROVIDER_SEPARATOR: Final = ":"


def check_registry(context: CheckContext) -> Iterable[Diagnostic]:
    agents = (
        item
        for agent_id, source in context.project.agents.items()
        for item in (
            *_agent_models(context, source),
            *_agent_references(context, source),
            *_subagents(context, agent_id, source),
            *_approval(source),
            *_instructions(context, source),
        )
    )
    tools = (item for source in context.project.tools.values() for item in _tool(context, source))
    return (*_llm_nodes(context), *_tool_nodes(context), *agents, *tools)


def known(context: CheckContext, table: Collection[str], name: str) -> bool:
    return name in table or name in context.project.broken_ids


def known_agent(context: CheckContext, name: str) -> bool:
    return known(context, context.project.agents, name)


def known_inference(context: CheckContext, name: str) -> bool:
    return known(context, context.project.inferences, name)


def _llm_nodes(context: CheckContext) -> Iterator[Diagnostic]:
    for entry, spec in typed_entries(context.graph, LlmNodeSpec):
        if spec.inference is None:
            message = "llm node has no inference: no <node>.inference.yaml next to the node and no inference key"
            yield diagnostic(DiagnosticCode.E_INFERENCE_UNKNOWN, entry.file, (), message)
        if spec.inference is not None and not known_inference(context, spec.inference):
            message = f"inference {spec.inference} does not exist in the project"
            yield diagnostic(DiagnosticCode.E_INFERENCE_UNKNOWN, entry.file, ("inference",), message)
        if not known_agent(context, spec.agent):
            message = f"agent {spec.agent} does not exist in the project"
            yield diagnostic(DiagnosticCode.E_AGENT_UNKNOWN, entry.file, ("agent",), message)


def _tool_nodes(context: CheckContext) -> Iterator[Diagnostic]:
    for entry, spec in typed_entries(context.graph, ToolNodeSpec):
        tool = context.tool(spec.tool)
        if tool is None and not known(context, context.project.tools, spec.tool):
            message = f"tool {spec.tool} does not exist in the project"
            yield diagnostic(DiagnosticCode.E_TOOL_UNKNOWN, entry.file, ("tool",), message)
        if tool is not None and tool.run is None:
            message = f"tool {spec.tool} is an MCP tool: only a tool with run can be a node: tool step"
            yield diagnostic(DiagnosticCode.E_SPEC_INVALID, entry.file, ("tool",), message)


def _agent_models(context: CheckContext, source: SourceSpec[AgentSpec]) -> Iterator[Diagnostic]:
    declared = {str(provider.id) for provider in context.spec.providers}
    agent = source.spec
    models: tuple[tuple[YamlPath, str], ...] = (
        (("model",), agent.model),
        *((("fallback_models", index), model) for index, model in enumerate(agent.fallback_models or ())),
    )
    for path, model in models:
        provider = model.partition(PROVIDER_SEPARATOR)[0]
        if provider in declared:
            continue
        message = f"provider {provider} of model {model} is not in providers of aqven.yaml"
        yield diagnostic(DiagnosticCode.E_PROVIDER_UNKNOWN, source.path, path, message)


def _agent_references(context: CheckContext, source: SourceSpec[AgentSpec]) -> Iterator[Diagnostic]:
    agent = source.spec
    project = context.project
    for index, tool in enumerate(agent.tools or ()):
        if not known(context, project.tools, tool):
            message = f"tool {tool} does not exist in the project"
            yield diagnostic(DiagnosticCode.E_TOOL_UNKNOWN, source.path, ("tools", index), message)
    for index, server in enumerate(agent.mcp_servers or ()):
        if not known(context, project.mcp_servers, server):
            message = f"MCP server {server} does not exist in the project"
            yield diagnostic(DiagnosticCode.E_MCP_SERVER_UNKNOWN, source.path, ("mcp_servers", index), message)


def _subagents(context: CheckContext, agent_id: AgentId, source: SourceSpec[AgentSpec]) -> Iterator[Diagnostic]:
    for index, subagent in enumerate(source.spec.subagents or ()):
        path: YamlPath = ("subagents", index)
        if not known_agent(context, subagent.agent):
            message = f"subagent {subagent.name}: agent {subagent.agent} does not exist"
            yield diagnostic(DiagnosticCode.E_AGENT_UNKNOWN, source.path, (*path, "agent"), message)
        if not known_inference(context, subagent.inference):
            message = f"subagent {subagent.name}: inference {subagent.inference} does not exist"
            yield diagnostic(DiagnosticCode.E_INFERENCE_UNKNOWN, source.path, (*path, "inference"), message)
    edges = _subagent_edges(context.project.agents)
    if agent_id in reachable(edges, agent_id):
        message = f"agent {agent_id} calls itself through a chain of subagents"
        yield diagnostic(DiagnosticCode.E_AGENT_RECURSION, source.path, ("subagents",), message)


def _subagent_edges(agents: Mapping[AgentId, SourceSpec[AgentSpec]]) -> Mapping[AgentId, tuple[AgentId, ...]]:
    return {
        agent_id: tuple(subagent.agent for subagent in source.spec.subagents or ())
        for agent_id, source in agents.items()
    }


def _approval(source: SourceSpec[AgentSpec]) -> Iterator[Diagnostic]:
    agent = source.spec
    approval = agent.approval
    if approval is None:
        return
    tools = set(agent.tools or ())
    for index, tool in enumerate(approval.tools):
        if tool in tools:
            continue
        message = f"approval names tool {tool}, which is not in the agent tools"
        yield diagnostic(DiagnosticCode.E_APPROVAL_TOOL, source.path, ("approval", "tools", index), message)
    if isinstance(approval.on_timeout, DefaultOnTimeout):
        message = "policy: default is not allowed for approval: human silence does not approve a tool call"
        yield diagnostic(DiagnosticCode.E_HUMAN_DEFAULT_INVALID, source.path, ("approval", "on_timeout"), message)


def _instructions(context: CheckContext, source: SourceSpec[AgentSpec]) -> Iterator[Diagnostic]:
    instructions = source.spec.instructions
    if instructions is None:
        return
    candidates = include_candidates((posixpath.dirname(source.path),), instructions)
    file = next((path for path in candidates if path in context.project.texts), None)
    if file is None:
        message = f"instructions file {instructions} not found relative to the agent file or the project root"
        yield diagnostic(DiagnosticCode.E_PROMPT_MISSING, source.path, ("instructions",), message)
        return
    yield from _plain_text(file, context.project.texts[file])


def _plain_text(file: str, text: str) -> Iterator[Diagnostic]:
    environment = prompt_environment(IncludeLoader({}, ()))
    try:
        analysis = environment.from_string(text, name=file).analyze(include_partials=False)
    except LiquidError as error:
        yield diagnostic(DiagnosticCode.E_PROMPT_SYNTAX, file, (), f"instructions parse error: {error}")
        return
    for tag in sorted(set(analysis.tags) - SERVICE_TAGS):
        message = f"agent instructions are level 1 text: tag {tag} is not allowed"
        yield diagnostic(DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, file, (), message)
    for name in sorted(analysis.globals):
        message = f"agent instructions are level 1 text: variable {name} is not allowed"
        yield diagnostic(DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED, file, (), message)


def _tool(context: CheckContext, source: SourceSpec[ToolSpec]) -> Iterator[Diagnostic]:
    tool = source.spec
    yield from _idempotency(source)
    if tool.mcp is not None and not known(context, context.project.mcp_servers, tool.mcp.server):
        message = f"MCP server {tool.mcp.server} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_MCP_SERVER_UNKNOWN, source.path, ("mcp", "server"), message)


def _idempotency(source: SourceSpec[ToolSpec]) -> Iterator[Diagnostic]:
    tool = source.spec
    keys = tool.idempotency_key or []
    if tool.effect in WRITE_EFFECTS and not keys:
        message = f"effect: {tool.effect.value} requires idempotency_key: names of in fields"
        yield diagnostic(DiagnosticCode.E_TOOL_IDEMPOTENCY, source.path, ("effect",), message)
    names = {decl.name for decl in tool.in_}
    unknown = [key for key in keys if key not in names]
    if tool.run is not None and unknown:
        message = f"idempotency_key names fields outside in: {', '.join(unknown)}"
        yield diagnostic(DiagnosticCode.E_TOOL_IDEMPOTENCY, source.path, ("idempotency_key",), message)
