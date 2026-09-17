from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from aqven.loader import (
    LoadedProject,
    SourceSpec,
    YamlPath,
    inner_node_id,
    local_node_id,
    parent_node_id,
)
from aqven.spec import (
    BoundField,
    CallNodeSpec,
    CodeNodeSpec,
    FieldBinding,
    FieldDecl,
    FlowId,
    FlowSpec,
    HumanNodeSpec,
    InputField,
    LlmNodeSpec,
    LoopNodeSpec,
    MapNodeSpec,
    NarrowNodeSpec,
    NodeId,
    NodeSpec,
    ParallelNodeSpec,
    SwitchNodeSpec,
    ToolNodeSpec,
)


class SitePurpose(StrEnum):
    INPUT = "input"
    OUTPUT = "output"
    RETURN = "return"
    CASE_BIND = "case_bind"
    MAP_OVER = "map_over"
    SWITCH_ON = "switch_on"
    NARROW_FROM = "narrow_from"


@dataclass(frozen=True, slots=True, eq=False)
class NodeEntry:
    owner: FlowId
    node_id: NodeId
    local_id: NodeId
    parent: NodeId | None
    source: SourceSpec[NodeSpec]

    @property
    def spec(self) -> NodeSpec:
        return self.source.spec

    @property
    def file(self) -> str:
        return self.source.path


@dataclass(frozen=True, slots=True, eq=False)
class Frame:
    entry: NodeEntry
    case_key: str | None


@dataclass(frozen=True, slots=True, eq=False)
class Scope:
    owner: FlowId
    frames: tuple[Frame, ...]
    own: NodeEntry | None


@dataclass(frozen=True, slots=True, eq=False)
class BindingSite:
    entry: NodeEntry | None
    file: str
    path: YamlPath
    text: str
    scope: Scope
    slot: FieldDecl | None
    purpose: SitePurpose


@dataclass(frozen=True, slots=True, eq=False)
class ValueSite:
    entry: NodeEntry
    file: str
    path: YamlPath
    slot: FieldDecl
    value: object


type SiteExtractor = Callable[[ProjectGraph, NodeEntry], Iterator[BindingSite]]


@dataclass(frozen=True, slots=True)
class ProjectGraph:
    project: LoadedProject
    entries: Mapping[tuple[FlowId, NodeId], NodeEntry]

    def owners(self) -> tuple[FlowId, ...]:
        return tuple(self.project.flows)

    def entry(self, owner: FlowId, node_id: str) -> NodeEntry | None:
        return self.entries.get((owner, NodeId(node_id)))

    def owner_entries(self, owner: FlowId) -> tuple[NodeEntry, ...]:
        return tuple(entry for (entry_owner, _), entry in self.entries.items() if entry_owner == owner)

    def all_entries(self) -> tuple[NodeEntry, ...]:
        return tuple(self.entries.values())

    def top(self, owner: FlowId, local: str) -> NodeEntry | None:
        return self.entry(owner, local)

    def inner(self, container: NodeEntry, local: str) -> NodeEntry | None:
        return self.entry(container.owner, inner_node_id(container.node_id, local))

    def parent(self, entry: NodeEntry) -> NodeEntry | None:
        if entry.parent is None:
            return None
        return self.entry(entry.owner, entry.parent)

    def children(self, entry: NodeEntry) -> tuple[NodeEntry, ...]:
        return tuple(item for item in self.owner_entries(entry.owner) if item.parent == entry.node_id)

    def flow_spec(self, flow_id: str) -> FlowSpec | None:
        flow = self.project.flows.get(FlowId(flow_id))
        source = flow.source if flow is not None else None
        return source.spec if source is not None else None

    def owner_source_path(self, owner: FlowId) -> str | None:
        flow = self.project.flows.get(owner)
        source = flow.source if flow is not None else None
        return source.path if source is not None else None

    def broken_node(self, local: str) -> bool:
        return local in self.project.broken_ids

    def order(self, owner: FlowId) -> tuple[NodeId, ...]:
        flow = self.flow_spec(owner)
        return tuple(flow.order) if flow is not None else ()

    def scope_of(self, entry: NodeEntry) -> Scope:
        return Scope(owner=entry.owner, frames=self.frames(entry), own=None)

    def inner_scope(self, entry: NodeEntry, case_key: str | None = None) -> Scope:
        return Scope(owner=entry.owner, frames=(*self.frames(entry), Frame(entry, case_key)), own=None)

    def own_scope(self, entry: NodeEntry) -> Scope:
        return Scope(owner=entry.owner, frames=(*self.frames(entry), Frame(entry, None)), own=entry)

    def frames(self, entry: NodeEntry) -> tuple[Frame, ...]:
        parent = self.parent(entry)
        if parent is None:
            return ()
        return (*self.frames(parent), Frame(parent, case_key_for(parent.spec, entry.local_id)))

    def binding_sites(self) -> tuple[BindingSite, ...]:
        node_sites = (site for entry in self.all_entries() for site in self.entry_sites(entry))
        return (*node_sites, *self._flow_sites())

    def entry_sites(self, entry: NodeEntry) -> Iterator[BindingSite]:
        extractor = SITE_EXTRACTORS[type(entry.spec)]
        return extractor(self, entry)

    def value_sites(self) -> tuple[ValueSite, ...]:
        return tuple(site for entry in self.all_entries() for site in _value_sites(self, entry))

    def _flow_sites(self) -> Iterator[BindingSite]:
        for flow in self.project.flows.values():
            source = flow.source
            if source is None:
                continue
            scope = Scope(owner=flow.flow_id, frames=(), own=None)
            yield from _binding_sites(None, source.path, ("returns",), source.spec.returns, scope, SitePurpose.RETURN)


def build_graph(project: LoadedProject) -> ProjectGraph:
    flow_entries = (
        _entry(flow.flow_id, node_id, source)
        for flow in project.flows.values()
        for node_id, source in flow.nodes.items()
    )
    entries = {(entry.owner, entry.node_id): entry for entry in flow_entries}
    return ProjectGraph(project=project, entries=entries)


def case_key_for(spec: NodeSpec, local: str) -> str | None:
    if not isinstance(spec, SwitchNodeSpec):
        return None
    return next((key for key, case in spec.cases.items() if case.node == local), None)


def _entry(owner: FlowId, node_id: NodeId, source: SourceSpec[NodeSpec]) -> NodeEntry:
    return NodeEntry(
        owner=owner,
        node_id=node_id,
        local_id=local_node_id(node_id),
        parent=parent_node_id(node_id),
        source=source,
    )


def _field_sites(
    entry: NodeEntry | None,
    file: str,
    key: YamlPath,
    fields: Sequence[InputField | BoundField],
    scope: Scope,
    purpose: SitePurpose,
) -> Iterator[BindingSite]:
    for index, decl in enumerate(fields):
        if decl.from_ is None:
            continue
        yield BindingSite(entry, file, (*key, index, "from"), decl.from_, scope, decl, purpose)


def _binding_sites(
    entry: NodeEntry | None,
    file: str,
    key: YamlPath,
    bindings: Sequence[FieldBinding],
    scope: Scope,
    purpose: SitePurpose,
) -> Iterator[BindingSite]:
    for index, binding in enumerate(bindings):
        if binding.from_ is None:
            continue
        yield BindingSite(entry, file, (*key, index, "from"), binding.from_, scope, None, purpose)


def _single(
    entry: NodeEntry, key: YamlPath, text: str | None, scope: Scope, purpose: SitePurpose
) -> Iterator[BindingSite]:
    if text is None:
        return
    yield BindingSite(entry, entry.file, key, text, scope, None, purpose)


def _binding_node_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, LlmNodeSpec | ToolNodeSpec | CallNodeSpec):
        return
    yield from _binding_sites(entry, entry.file, ("in",), spec.in_, graph.scope_of(entry), SitePurpose.INPUT)


def _step_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, CodeNodeSpec | HumanNodeSpec):
        return
    yield from _field_sites(entry, entry.file, ("in",), spec.in_, graph.scope_of(entry), SitePurpose.INPUT)


def _parallel_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, ParallelNodeSpec):
        return
    yield from _field_sites(entry, entry.file, ("out",), spec.out, graph.own_scope(entry), SitePurpose.OUTPUT)


def _map_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, MapNodeSpec):
        return
    yield from _single(entry, ("over",), spec.over, graph.scope_of(entry), SitePurpose.MAP_OVER)
    yield from _field_sites(entry, entry.file, ("out",), spec.out, graph.own_scope(entry), SitePurpose.OUTPUT)


def _switch_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, SwitchNodeSpec):
        return
    yield from _single(entry, ("on",), spec.on, graph.scope_of(entry), SitePurpose.SWITCH_ON)
    for key, case in spec.cases.items():
        scope = graph.inner_scope(entry, key)
        bindings = case.bind or ()
        yield from _binding_sites(entry, entry.file, ("cases", key, "bind"), bindings, scope, SitePurpose.CASE_BIND)


def _loop_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, LoopNodeSpec):
        return
    outer = graph.scope_of(entry)
    for local, bindings in (spec.init or {}).items():
        yield from _binding_sites(entry, entry.file, ("init", local), bindings, outer, SitePurpose.INPUT)
    yield from _field_sites(entry, entry.file, ("out",), spec.out, graph.own_scope(entry), SitePurpose.OUTPUT)


def _narrow_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[BindingSite]:
    spec = entry.spec
    if not isinstance(spec, NarrowNodeSpec):
        return
    yield from _single(entry, ("from",), spec.from_, graph.scope_of(entry), SitePurpose.NARROW_FROM)


SITE_EXTRACTORS: Final[Mapping[type, SiteExtractor]] = {
    LlmNodeSpec: _binding_node_sites,
    CodeNodeSpec: _step_sites,
    ToolNodeSpec: _binding_node_sites,
    HumanNodeSpec: _step_sites,
    CallNodeSpec: _binding_node_sites,
    ParallelNodeSpec: _parallel_sites,
    MapNodeSpec: _map_sites,
    SwitchNodeSpec: _switch_sites,
    LoopNodeSpec: _loop_sites,
    NarrowNodeSpec: _narrow_sites,
}


def _value_sites(graph: ProjectGraph, entry: NodeEntry) -> Iterator[ValueSite]:
    spec = entry.spec
    inputs: Sequence[InputField] = spec.in_ if isinstance(spec, INPUT_NODE_CLASSES) else ()
    for index, decl in enumerate(inputs):
        if decl.from_ is None:
            yield ValueSite(entry, entry.file, ("in", index, "value"), decl, decl.value)
    if isinstance(spec, SwitchNodeSpec):
        yield from _case_value_sites(entry, spec)


def _case_value_sites(entry: NodeEntry, spec: SwitchNodeSpec) -> Iterator[ValueSite]:
    slots = {decl.name: decl for decl in spec.out}
    literals = (
        (key, index, binding, slot)
        for key, case in spec.cases.items()
        for index, binding in enumerate(case.bind or ())
        if binding.from_ is None and (slot := slots.get(binding.name)) is not None
    )
    for key, index, binding, slot in literals:
        yield ValueSite(entry, entry.file, ("cases", key, "bind", index, "value"), slot, binding.value)


INPUT_NODE_CLASSES: Final = (CodeNodeSpec, HumanNodeSpec)
