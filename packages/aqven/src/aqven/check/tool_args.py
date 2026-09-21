from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext, ResolvedAgent
from aqven.check.nodes import typed_entries
from aqven.check.prompts import rendered_paths
from aqven.check.typeinfo import Types, fields_contained_types, type_fields
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import LoadedInference
from aqven.spec import (
    AgentId,
    FieldDecl,
    IdType,
    InferenceId,
    LlmNodeSpec,
    RecordType,
    ToolId,
    ToolSpec,
    TypeId,
    TypeRef,
    TypeRefSyntaxError,
    UnionType,
    parse_type_ref,
)

PATH_DEPTH_LIMIT: Final = 4
LIST_SUFFIX: Final = "[]"
IN_PREFIX: Final = "$in."
AGENT_PATH: Final = ("agent",)
WANTED_KINDS: Final = (IdType, RecordType, UnionType)


@dataclass(frozen=True, slots=True)
class InputPath:
    path: str
    type_id: TypeId


@dataclass(frozen=True, slots=True)
class NodeAgent:
    file: str
    agent_id: AgentId
    agent: ResolvedAgent
    inference_id: InferenceId
    loaded: LoadedInference


@dataclass(frozen=True, slots=True)
class Reach:
    paths: tuple[InputPath, ...]
    returned: frozenset[TypeId]
    rendered: frozenset[str] | None
    inference_file: str


def check_tool_args(context: CheckContext) -> Iterable[Diagnostic]:
    types: Types = {type_id: source.spec for type_id, source in context.project.types.items()}
    return tuple(item for usage in _usages(context) for item in _usage(context, types, usage))


def _usages(context: CheckContext) -> Iterator[NodeAgent]:
    for entry, spec in typed_entries(context.graph, LlmNodeSpec):
        inference_id = spec.inference
        agent = context.agents.get(AgentId(spec.agent))
        loaded = context.project.inferences.get(inference_id) if inference_id is not None else None
        if agent is None or not agent.agent.tools or inference_id is None or loaded is None:
            continue
        if loaded.source is None:
            continue
        yield NodeAgent(entry.file, AgentId(spec.agent), agent, inference_id, loaded)


def _usage(context: CheckContext, types: Types, usage: NodeAgent) -> Iterator[Diagnostic]:
    source = usage.loaded.source
    if source is None:
        return
    tools = tuple(
        (tool_id, tool)
        for tool_id in usage.agent.agent.tools or ()
        if (tool := context.tool(tool_id)) is not None and tool.in_
    )
    if not tools:
        return
    reach = Reach(
        paths=tuple(_input_paths(source.spec.in_, types, "", 0, frozenset())),
        returned=frozenset(item for _, tool in tools for item in fields_contained_types(tool.out, types)),
        rendered=rendered_paths(context, usage.loaded),
        inference_file=source.path,
    )
    yield from (item for tool_id, tool in tools for item in _tool(usage, types, tool_id, tool, reach))


def _tool(usage: NodeAgent, types: Types, tool_id: ToolId, tool: ToolSpec, reach: Reach) -> Iterator[Diagnostic]:
    for decl in tool.in_:
        reference = _type_ref(decl)
        type_id = _wanted_type(reference, types)
        if type_id is None or reference is None or reference.is_optional:
            continue
        yield from _field(usage, tool_id, decl, type_id, reach)


def _field(usage: NodeAgent, tool_id: ToolId, decl: FieldDecl, type_id: TypeId, reach: Reach) -> Iterator[Diagnostic]:
    if type_id in reach.returned:
        return
    sources = sorted(item.path for item in reach.paths if item.type_id == type_id)
    if not sources:
        yield _missing(usage, tool_id, decl, type_id, reach)
        return
    if reach.rendered is None or any(_covered(path, reach.rendered) for path in sources):
        return
    yield _unrendered(usage, tool_id, decl, type_id, sources, reach)


def _missing(usage: NodeAgent, tool_id: ToolId, decl: FieldDecl, type_id: TypeId, reach: Reach) -> Diagnostic:
    message = (
        f"tool {tool_id} of agent {usage.agent_id} requires {decl.name} of type {type_id}, and no input of "
        f"inference {usage.inference_id} ({reach.inference_file}) carries {type_id}: the model cannot invent the value"
    )
    hint = f"add an input of type {type_id} to {reach.inference_file} and render it in the prompt"
    return diagnostic(DiagnosticCode.W_TOOL_ARG_UNREACHABLE, usage.file, AGENT_PATH, message, hint=hint)


def _unrendered(
    usage: NodeAgent, tool_id: ToolId, decl: FieldDecl, type_id: TypeId, sources: Sequence[str], reach: Reach
) -> Diagnostic:
    listed = ", ".join(f"{IN_PREFIX}{path}" for path in sources)
    message = (
        f"tool {tool_id} of agent {usage.agent_id} requires {decl.name} of type {type_id}: inference "
        f"{usage.inference_id} ({reach.inference_file}) carries it at {listed}, but the prompt never renders it"
    )
    hint = f"{_render_hint(sources[0])} in the prompt of inference {usage.inference_id}"
    return diagnostic(DiagnosticCode.W_TOOL_ARG_UNREACHABLE, usage.file, AGENT_PATH, message, hint=hint)


def _render_hint(path: str) -> str:
    head, _, tail = path.partition(LIST_SUFFIX)
    if not tail and LIST_SUFFIX not in path:
        return f"render {{{{ {path} }}}}"
    if LIST_SUFFIX in tail:
        return f"render the value at {IN_PREFIX}{path}"
    return f"render {{% for item in {head} %}}{{{{ item{tail} }}}}{{% endfor %}}"


def _covered(path: str, rendered: frozenset[str]) -> bool:
    return any(path == item or path.startswith((f"{item}.", f"{item}{LIST_SUFFIX}")) for item in rendered)


def _wanted_type(reference: TypeRef | None, types: Types) -> TypeId | None:
    spec = types.get(reference.type_id) if reference is not None else None
    return reference.type_id if reference is not None and isinstance(spec, WANTED_KINDS) else None


def _type_ref(decl: FieldDecl) -> TypeRef | None:
    try:
        return parse_type_ref(decl.type)
    except TypeRefSyntaxError:
        return None


def _input_paths(
    fields: Sequence[FieldDecl], types: Types, prefix: str, depth: int, seen: frozenset[TypeId]
) -> Iterator[InputPath]:
    if depth >= PATH_DEPTH_LIMIT:
        return
    for decl in fields:
        reference = _type_ref(decl)
        if reference is None:
            continue
        path = f"{prefix}{decl.name}{LIST_SUFFIX if reference.is_list else ''}"
        yield InputPath(path, reference.type_id)
        spec = types.get(reference.type_id)
        if spec is None or reference.type_id in seen:
            continue
        yield from _input_paths(type_fields(spec), types, f"{path}.", depth + 1, seen | {reference.type_id})
