from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Final

from pydantic import BaseModel, JsonValue

from aqven.loader.aliases import ANY, Pattern, children, sites
from aqven.loader.layout import local_node_id
from aqven.loader.project import LoadedExperiment, LoadedFlow, LoadedProject, SourceSpec
from aqven.loader.strict_yaml import Position, YamlPath
from aqven.spec import BUILTIN_TYPE_IDS, TEXT_SUFFIX, FlowId, RefRoot, RefSyntaxError, parse_ref

NODE_QUALIFIER: Final = "."
REF_PREFIX: Final = "$"
OPTIONAL_SUFFIX: Final = "?"
LIST_SUFFIX: Final = "[]"


class EntityKind(StrEnum):
    PROJECT = "project"
    AGENT = "agent"
    TOOL = "tool"
    MCP_SERVER = "mcp_server"
    TYPE = "type"
    INFERENCE = "inference"
    FLOW = "flow"
    NODE = "node"
    DATASET = "dataset"
    EXPERIMENT = "experiment"
    ARM = "arm"
    FINDING = "finding"
    CODE = "code"


QUALIFIED_KINDS: Final = frozenset({EntityKind.NODE, EntityKind.ARM, EntityKind.FINDING})


def scoped(owner: str, name: str) -> str:
    return f"{owner}{NODE_QUALIFIER}{name}"


@dataclass(frozen=True, slots=True, order=True)
class EntityKey:
    kind: EntityKind
    id: str

    def __str__(self) -> str:
        return f"{self.kind.value}:{self.id}"


@dataclass(frozen=True, slots=True)
class Reference:
    source: EntityKey
    file: str
    field: YamlPath
    line: int | None
    target: EntityKey


@dataclass(frozen=True, slots=True)
class ProjectIndex:
    definitions: Mapping[EntityKey, str]
    references: tuple[Reference, ...]

    def incoming(self, key: EntityKey) -> tuple[Reference, ...]:
        return tuple(reference for reference in self.references if reference.target == key)

    def outgoing(self, key: EntityKey) -> tuple[Reference, ...]:
        return tuple(reference for reference in self.references if reference.source == key)

    def find(self, kind: EntityKind, name: str) -> tuple[EntityKey, ...]:
        exact = EntityKey(kind, name)
        known = {*self.definitions, *(reference.target for reference in self.references)}
        if exact in known:
            return (exact,)
        if kind not in QUALIFIED_KINDS:
            return ()
        return tuple(sorted(key for key in self.definitions if key.kind is kind and name in _short_names(key)))


@dataclass(frozen=True, slots=True)
class _Source:
    path: str
    spec: BaseModel
    positions: Mapping[YamlPath, Position]


def _source[S: BaseModel](source: SourceSpec[S] | None) -> _Source | None:
    if source is None:
        return None
    return _Source(source.path, source.spec, source.positions)


@dataclass(frozen=True, slots=True)
class _Document:
    key: EntityKey
    path: str
    source: _Source | None
    flow: LoadedFlow | None = None


type _Site = tuple[Pattern, EntityKind]

FIELD_TYPES: Final[tuple[_Site, ...]] = (
    (("in", ANY, "type"), EntityKind.TYPE),
    (("out", ANY, "type"), EntityKind.TYPE),
)


def _evaluators(key: str) -> tuple[_Site, ...]:
    return (
        ((key, ANY, "run"), EntityKind.CODE),
        ((key, ANY, "inference"), EntityKind.INFERENCE),
        ((key, ANY, "agent"), EntityKind.AGENT),
    )


FLOW_SITES: Final[tuple[_Site, ...]] = (
    (("input",), EntityKind.TYPE),
    (("output",), EntityKind.TYPE),
    (("order", ANY), EntityKind.NODE),
    (("requires", ANY, "nodes", ANY), EntityKind.NODE),
)

SITES: Final[Mapping[EntityKind, tuple[_Site, ...]]] = {
    EntityKind.AGENT: (
        (("tools", ANY), EntityKind.TOOL),
        (("mcp_servers", ANY), EntityKind.MCP_SERVER),
        (("subagents", ANY, "agent"), EntityKind.AGENT),
        (("subagents", ANY, "inference"), EntityKind.INFERENCE),
        (("approval", "tools", ANY), EntityKind.TOOL),
    ),
    EntityKind.TOOL: (
        (("run",), EntityKind.CODE),
        (("mcp", "server"), EntityKind.MCP_SERVER),
        (("wait", "poll"), EntityKind.CODE),
        *FIELD_TYPES,
    ),
    EntityKind.TYPE: (
        (("fields", ANY, "type"), EntityKind.TYPE),
        (("variants", ANY, "fields", ANY, "type"), EntityKind.TYPE),
    ),
    EntityKind.INFERENCE: (
        *FIELD_TYPES,
        (("prompt",), EntityKind.CODE),
        (("display", "input", "run"), EntityKind.CODE),
        (("display", "output", "run"), EntityKind.CODE),
        (("allowed_sets", ANY, "type"), EntityKind.TYPE),
        *_evaluators("checks"),
    ),
    EntityKind.FLOW: FLOW_SITES,
    EntityKind.ARM: FLOW_SITES,
    EntityKind.NODE: (
        (("inference",), EntityKind.INFERENCE),
        (("agent",), EntityKind.AGENT),
        (("tool",), EntityKind.TOOL),
        (("flow",), EntityKind.FLOW),
        (("run",), EntityKind.CODE),
        (("form",), EntityKind.TYPE),
        (("to",), EntityKind.TYPE),
        (("body",), EntityKind.NODE),
        (("body", ANY), EntityKind.NODE),
        (("cases", ANY, "node"), EntityKind.NODE),
        (("join", "run"), EntityKind.CODE),
        (("on_item_error", "run"), EntityKind.CODE),
        (("stop", ANY, "run"), EntityKind.CODE),
        (("select", "run"), EntityKind.CODE),
        *FIELD_TYPES,
    ),
    EntityKind.EXPERIMENT: (
        (("subject", "flow"), EntityKind.FLOW),
        (("subject", "arm"), EntityKind.ARM),
        (("cases", "dataset"), EntityKind.DATASET),
        (("variants", ANY, "arm"), EntityKind.ARM),
        (("variants", ANY, "agents", ANY), EntityKind.AGENT),
        *_evaluators("checks"),
        (("checks", ANY, "validated_by"), EntityKind.EXPERIMENT),
    ),
    EntityKind.FINDING: ((("experiment",), EntityKind.EXPERIMENT),),
}


def build_index(project: LoadedProject) -> ProjectIndex:
    documents = tuple(_documents(project))
    definitions = {document.key: document.path for document in documents}
    references = tuple(reference for document in documents for reference in _references(document))
    return ProjectIndex(definitions, references)


def _documents(project: LoadedProject) -> Iterator[_Document]:
    project_key = EntityKey(EntityKind.PROJECT, project.project.spec.package)
    yield _Document(project_key, project.project.path, _source(project.project))
    yield from _registry(EntityKind.AGENT, project.agents)
    yield from _registry(EntityKind.TOOL, project.tools)
    yield from _registry(EntityKind.MCP_SERVER, project.mcp_servers)
    yield from _registry(EntityKind.TYPE, project.types)
    for inference_id, inference in project.inferences.items():
        path = _defined_at(inference.source, inference.builder_path, inference.folder)
        yield _Document(EntityKey(EntityKind.INFERENCE, inference_id), path, _source(inference.source))
    for flow_id, flow in project.flows.items():
        yield _flow_document(EntityKey(EntityKind.FLOW, flow_id), flow)
        yield from _node_documents(flow)
    yield from _registry(EntityKind.DATASET, project.datasets)
    for experiment in project.experiments.values():
        yield from _experiment_documents(experiment)


def _flow_document(key: EntityKey, flow: LoadedFlow) -> _Document:
    return _Document(key, _defined_at(flow.source, flow.builder_path, flow.folder), _source(flow.source), flow)


def _node_documents(flow: LoadedFlow) -> Iterator[_Document]:
    for node_id, node in flow.nodes.items():
        yield _Document(EntityKey(EntityKind.NODE, _qualified(flow, node_id)), node.path, _source(node), flow)


def _experiment_documents(experiment: LoadedExperiment) -> Iterator[_Document]:
    owner = experiment.experiment_id
    yield _Document(EntityKey(EntityKind.EXPERIMENT, owner), experiment.source.path, _source(experiment.source))
    for arm_id, arm in experiment.arms.items():
        scoped_arm = replace(arm, flow_id=FlowId(scoped(owner, arm_id)))
        yield _flow_document(EntityKey(EntityKind.ARM, scoped_arm.flow_id), scoped_arm)
        yield from _node_documents(scoped_arm)
    for series, finding in experiment.findings.items():
        yield _Document(EntityKey(EntityKind.FINDING, scoped(owner, series)), finding.path, _source(finding))


def _registry[K: str, S: BaseModel](kind: EntityKind, table: Mapping[K, SourceSpec[S]]) -> Iterator[_Document]:
    return (_Document(EntityKey(kind, name), source.path, _source(source)) for name, source in table.items())


def _defined_at[S: BaseModel](source: SourceSpec[S] | None, builder_path: str | None, folder: str) -> str:
    return source.path if source is not None else builder_path or folder


def _references(document: _Document) -> Iterator[Reference]:
    source = document.source
    if source is None:
        return
    data: JsonValue = source.spec.model_dump(mode="json", by_alias=True, exclude_none=True)
    listed = (
        (path, kind, text) for pattern, kind in SITES.get(document.key.kind, ()) for path, text in sites(data, pattern)
    )
    for path, kind, text in (*listed, *_data_refs(document, data)):
        target = TARGETS.get(kind, _as_written)(document, text)
        if target is None:
            continue
        position = source.positions.get(path)
        line = position[0] if position is not None else None
        yield Reference(document.key, source.path, path, line, EntityKey(kind, target))


def _data_refs(document: _Document, data: JsonValue) -> Iterator[tuple[YamlPath, EntityKind, str]]:
    if document.flow is None:
        return
    for path, text in _strings(data):
        node = _node_of(text)
        if node is not None:
            yield path, EntityKind.NODE, node


def _strings(data: JsonValue, path: YamlPath = ()) -> Iterator[tuple[YamlPath, str]]:
    if isinstance(data, str):
        yield path, data
    for key, value in children(data):
        yield from _strings(value, (*path, key))


def _node_of(text: str) -> str | None:
    if not text.startswith(REF_PREFIX):
        return None
    try:
        ref = parse_ref(text)
    except RefSyntaxError:
        return None
    return ref.node_id if ref.root is RefRoot.NODE else None


def _short_names(key: EntityKey) -> tuple[str, str]:
    name = key.id.rpartition(NODE_QUALIFIER)[2]
    return name, local_node_id(name)


def _qualified(flow: LoadedFlow, node: str) -> str:
    return scoped(flow.flow_id, node)


def _as_written(document: _Document, text: str) -> str | None:
    return text


def _node_target(document: _Document, text: str) -> str | None:
    flow = document.flow
    if flow is None:
        return None
    expanded: dict[str, str] = {local_node_id(node_id): node_id for node_id in flow.nodes}
    return _qualified(flow, expanded.get(text, text))


def _type_target(document: _Document, text: str) -> str | None:
    name = text.removesuffix(OPTIONAL_SUFFIX).removesuffix(LIST_SUFFIX)
    return None if name in BUILTIN_TYPE_IDS else name


def _code_target(document: _Document, text: str) -> str | None:
    return None if text.endswith(TEXT_SUFFIX) else text


def _arm_target(document: _Document, text: str) -> str | None:
    return scoped(document.key.id, text) if document.key.kind is EntityKind.EXPERIMENT else None


TARGETS: Final[Mapping[EntityKind, Callable[[_Document, str], str | None]]] = {
    EntityKind.NODE: _node_target,
    EntityKind.TYPE: _type_target,
    EntityKind.CODE: _code_target,
    EntityKind.ARM: _arm_target,
}
