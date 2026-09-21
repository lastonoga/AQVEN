from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.graph import Frame, NodeEntry, Scope
from aqven.spec import (
    AgentId,
    BoundField,
    CallNodeSpec,
    CodeNodeSpec,
    FieldBinding,
    FieldStep,
    HumanNodeSpec,
    InputField,
    LlmNodeSpec,
    LoopNodeSpec,
    MapNodeSpec,
    ModelFamily,
    NarrowNodeSpec,
    ParallelNodeSpec,
    Ref,
    RefRoot,
    RefSyntaxError,
    SwitchNodeSpec,
    ToolNodeSpec,
    parse_ref,
)


class OriginKind(StrEnum):
    LLM = "llm"
    INDEX = "index"
    INPUT = "input"
    CONTEXT = "context"
    LITERAL = "literal"
    STEP = "step"
    CONTROL = "control"


@dataclass(frozen=True, slots=True)
class Origin:
    kind: OriginKind
    entry: NodeEntry | None = None


type Origins = frozenset[Origin]
type CallStack = tuple[NodeEntry, ...]
type RootTracer = Callable[[ProvenanceTracer, Scope, Ref, CallStack], Origins]
type NodeTracer = Callable[[ProvenanceTracer, NodeEntry, str | None, CallStack], Origins]

NOTHING: Final[Origins] = frozenset()


def origins_of(kind: OriginKind, entry: NodeEntry | None = None) -> Origins:
    return frozenset({Origin(kind, entry)})


def llm_entries(origins: Iterable[Origin]) -> tuple[NodeEntry, ...]:
    return tuple(origin.entry for origin in origins if origin.kind is OriginKind.LLM and origin.entry is not None)


def entry_families(context: CheckContext, entry: NodeEntry) -> frozenset[ModelFamily]:
    spec = entry.spec
    agent = context.agents.get(AgentId(spec.agent)) if isinstance(spec, LlmNodeSpec) else None
    return agent.families if agent is not None else frozenset()


def primary_family(context: CheckContext, entry: NodeEntry) -> ModelFamily | None:
    spec = entry.spec
    agent = context.agents.get(AgentId(spec.agent)) if isinstance(spec, LlmNodeSpec) else None
    return agent.family if agent is not None else None


@dataclass(slots=True)
class ProvenanceTracer:
    context: CheckContext
    through_code: bool
    visiting: set[tuple[object, ...]] = field(default_factory=set[tuple[object, ...]])

    def binding_origins(self, entry: NodeEntry, binding: InputField | FieldBinding) -> Origins:
        if binding.from_ is None:
            return origins_of(OriginKind.LITERAL)
        return self.ref_origins(self.context.graph.scope_of(entry), binding.from_, ())

    def ref_origins(self, scope: Scope, text: str, calls: CallStack) -> Origins:
        try:
            ref = parse_ref(text)
        except RefSyntaxError:
            return NOTHING
        key = _visit_key(scope, text, calls)
        if key in self.visiting:
            return NOTHING
        root = ROOT_TRACERS.get(ref.root)
        if root is None:
            return NOTHING
        self.visiting.add(key)
        try:
            return root(self, scope, ref, calls)
        finally:
            self.visiting.discard(key)

    def node_origins(self, entry: NodeEntry, field_name: str | None, calls: CallStack) -> Origins:
        tracer = NODE_TRACERS.get(type(entry.spec))
        return tracer(self, entry, field_name, calls) if tracer is not None else NOTHING

    def call_sites(self, flow_id: str) -> tuple[NodeEntry, ...]:
        return tuple(
            entry
            for entry in self.context.graph.all_entries()
            if isinstance(entry.spec, CallNodeSpec) and entry.spec.flow == flow_id
        )

    def fields_origins(
        self, scope: Scope, fields: Sequence[InputField | BoundField | FieldBinding], name: str | None, calls: CallStack
    ) -> Origins:
        selected = [item for item in fields if name is None or item.name == name]
        literal = origins_of(OriginKind.LITERAL) if any(item.from_ is None for item in selected) else NOTHING
        traced = (self.ref_origins(scope, item.from_, calls) for item in selected if item.from_ is not None)
        return literal.union(*traced)


def _visit_key(scope: Scope, text: str, calls: CallStack) -> tuple[object, ...]:
    frames = tuple((id(frame.entry), frame.case_key) for frame in scope.frames)
    own = id(scope.own) if scope.own is not None else None
    return (scope.owner, frames, own, text, tuple(id(call) for call in calls))


def _first_field(ref: Ref) -> str | None:
    step = next(iter(ref.steps), None)
    return step.name if isinstance(step, FieldStep) else None


def _nearest(scope: Scope, kind: type) -> Frame | None:
    return next((frame for frame in reversed(scope.frames) if isinstance(frame.entry.spec, kind)), None)


def _constant(kind: OriginKind) -> RootTracer:
    def trace(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
        return origins_of(kind)

    return trace


def _item(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    frame = _nearest(scope, MapNodeSpec)
    spec = frame.entry.spec if frame is not None else None
    if frame is None or not isinstance(spec, MapNodeSpec):
        return NOTHING
    return tracer.ref_origins(tracer.context.graph.scope_of(frame.entry), spec.over, calls)


def _case(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    frame = _nearest(scope, SwitchNodeSpec)
    spec = frame.entry.spec if frame is not None else None
    if frame is None or not isinstance(spec, SwitchNodeSpec):
        return NOTHING
    return tracer.ref_origins(tracer.context.graph.scope_of(frame.entry), spec.on, calls)


def _input(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    sites = calls[-1:] if calls else tracer.call_sites(scope.owner)
    outer = calls[:-1]
    graph = tracer.context.graph
    traced = (
        tracer.fields_origins(graph.scope_of(site), site.spec.in_, _first_field(ref), outer)
        for site in sites
        if isinstance(site.spec, CallNodeSpec)
    )
    return origins_of(OriginKind.INPUT).union(*traced)


def _acc(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    frame = _nearest(scope, LoopNodeSpec)
    return _body_origins(tracer, frame.entry if frame is not None else None, ref, calls)


def _iter(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    return _body_origins(tracer, scope.own, ref, calls)


def _body_origins(tracer: ProvenanceTracer, loop: NodeEntry | None, ref: Ref, calls: CallStack) -> Origins:
    local = _first_field(ref)
    inner = tracer.context.graph.inner(loop, local) if loop is not None and local is not None else None
    if inner is None:
        return NOTHING
    field_step = ref.steps[2] if len(ref.steps) > 2 else None
    name = field_step.name if isinstance(field_step, FieldStep) else None
    return tracer.node_origins(inner, name, calls)


def _branch(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    own = scope.own
    spec = own.spec if own is not None else None
    if own is None or not isinstance(spec, ParallelNodeSpec):
        return NOTHING
    local = spec.body.get(ref.key or "")
    inner = tracer.context.graph.inner(own, local) if local is not None else None
    return tracer.node_origins(inner, _first_field(ref), calls) if inner is not None else NOTHING


def _ok(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    own = scope.own
    if own is None:
        return NOTHING
    children = tracer.context.graph.children(own)
    return NOTHING.union(*(tracer.node_origins(node, None, calls) for node in children))


def _node(tracer: ProvenanceTracer, scope: Scope, ref: Ref, calls: CallStack) -> Origins:
    graph = tracer.context.graph
    name = ref.node_id or ""
    containers = (frame.entry for frame in reversed(scope.frames))
    inner = next((node for node in (graph.inner(item, name) for item in containers) if node), None)
    visible = inner or graph.top(scope.owner, name)
    return tracer.node_origins(visible, _first_field(ref), calls) if visible is not None else NOTHING


def _llm_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    return origins_of(OriginKind.LLM, entry)


def _step_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    return origins_of(OriginKind.STEP, entry)


def _code_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    spec = entry.spec
    if not isinstance(spec, CodeNodeSpec):
        return NOTHING
    if not tracer.through_code:
        return origins_of(OriginKind.STEP, entry)
    return tracer.fields_origins(tracer.context.graph.scope_of(entry), spec.in_, None, calls)


def _narrow_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    spec = entry.spec
    if not isinstance(spec, NarrowNodeSpec):
        return NOTHING
    return tracer.ref_origins(tracer.context.graph.scope_of(entry), spec.from_, calls)


def _bound_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    spec = entry.spec
    if not isinstance(spec, ParallelNodeSpec | MapNodeSpec | LoopNodeSpec):
        return NOTHING
    return tracer.fields_origins(tracer.context.graph.own_scope(entry), spec.out, name, calls)


def _switch_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    spec = entry.spec
    if not isinstance(spec, SwitchNodeSpec):
        return NOTHING
    graph = tracer.context.graph
    bound = (
        tracer.fields_origins(graph.inner_scope(entry, key), case.bind, name, calls)
        for key, case in spec.cases.items()
        if case.bind is not None
    )
    inner_nodes = (
        graph.inner(entry, case.node) for case in spec.cases.values() if case.bind is None and case.node is not None
    )
    delegated = (tracer.node_origins(node, name, calls) for node in inner_nodes if node is not None)
    return NOTHING.union(*bound, *delegated)


def _call_node(tracer: ProvenanceTracer, entry: NodeEntry, name: str | None, calls: CallStack) -> Origins:
    spec = entry.spec
    flow = tracer.context.graph.flow_spec(spec.flow) if isinstance(spec, CallNodeSpec) else None
    if flow is None or not isinstance(spec, CallNodeSpec) or entry in calls:
        return NOTHING
    scope = Scope(owner=spec.flow, frames=(), own=None)
    return tracer.fields_origins(scope, flow.returns, name, (*calls, entry))


ROOT_TRACERS: Final[Mapping[RefRoot, RootTracer]] = {
    RefRoot.INPUT: _input,
    RefRoot.RUN_CONTEXT: _constant(OriginKind.CONTEXT),
    RefRoot.INDEX: _constant(OriginKind.INDEX),
    RefRoot.LOOP: _constant(OriginKind.CONTROL),
    RefRoot.FAILED: _constant(OriginKind.CONTROL),
    RefRoot.ITEM: _item,
    RefRoot.CASE: _case,
    RefRoot.ACC: _acc,
    RefRoot.ITER: _iter,
    RefRoot.BRANCH: _branch,
    RefRoot.OK: _ok,
    RefRoot.NODE: _node,
}

NODE_TRACERS: Final[Mapping[type, NodeTracer]] = {
    LlmNodeSpec: _llm_node,
    ToolNodeSpec: _step_node,
    HumanNodeSpec: _step_node,
    CodeNodeSpec: _code_node,
    NarrowNodeSpec: _narrow_node,
    ParallelNodeSpec: _bound_node,
    MapNodeSpec: _bound_node,
    LoopNodeSpec: _bound_node,
    SwitchNodeSpec: _switch_node,
    CallNodeSpec: _call_node,
}
