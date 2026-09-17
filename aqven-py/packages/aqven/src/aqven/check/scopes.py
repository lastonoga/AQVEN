from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final, Literal

from pydantic import JsonValue

from aqven.check.graph import NodeEntry, ProjectGraph, Scope
from aqven.check.schemas import schema_of
from aqven.check.shapes import (
    Missing,
    NotList,
    Opaque,
    list_of,
    max_items,
    narrow_case,
    optional_of,
    step_element,
    step_field,
)
from aqven.diagnostics import DiagnosticCode
from aqven.spec import (
    DATE,
    INT,
    LOCALE,
    MAP_ITEM_ERROR,
    TENANT_ID,
    TIME_ZONE,
    CallNodeSpec,
    CodeNodeSpec,
    FieldDecl,
    FieldStep,
    HumanNodeSpec,
    IndexStep,
    InferenceId,
    LiftStep,
    LlmNodeSpec,
    LoopNodeSpec,
    LoopStopReason,
    MapNodeSpec,
    NarrowNodeSpec,
    ParallelNodeSpec,
    Ref,
    RefRoot,
    RefStep,
    RefSyntaxError,
    SwitchNodeSpec,
    ToolId,
    ToolNodeSpec,
    TypeId,
    TypeModelError,
    TypeModels,
    TypeRefSyntaxError,
    annotated_record,
    parse_ref,
    parse_type_ref,
)

CONTEXT_TYPES_BY_KEY: Final[Mapping[str, TypeId]] = {
    "date": DATE,
    "time_zone": TIME_ZONE,
    "locale": LOCALE,
    "tenant_id": TENANT_ID,
}


@dataclass(frozen=True, slots=True)
class Resolved:
    annotation: object | None
    nodes: tuple[NodeEntry, ...]


@dataclass(frozen=True, slots=True)
class Unresolved:
    code: DiagnosticCode
    message: str


@dataclass(frozen=True, slots=True)
class InferenceScope:
    inference_id: str


type Resolution = Resolved | Unresolved
type RootHandler = Callable[[Scope, Ref], Resolution]
type Side = Literal["in", "out"]

INFERENCE_ROOTS: Final[Mapping[RefRoot, Side]] = {RefRoot.IN: "in", RefRoot.OUT: "out"}

UNTYPED: Final = Resolved(annotation=None, nodes=())
JOIN_ALL: Final = "all"


@dataclass(slots=True)
class RefResolver:
    graph: ProjectGraph
    type_models: TypeModels
    outputs: dict[int, object | None] = field(default_factory=dict[int, object | None])
    schemas: dict[int, tuple[object, JsonValue | None]] = field(
        default_factory=dict[int, tuple[object, JsonValue | None]]
    )
    dependencies: dict[int, tuple[NodeEntry, ...]] = field(default_factory=dict[int, tuple[NodeEntry, ...]])
    records: dict[str, object | None] = field(default_factory=dict[str, object | None])
    resolutions: dict[tuple[object, ...], Resolution] = field(default_factory=dict[tuple[object, ...], Resolution])
    handlers: dict[RefRoot, RootHandler] = field(init=False)

    def __post_init__(self) -> None:
        self.handlers = {
            RefRoot.INPUT: self._input,
            RefRoot.RUN_CONTEXT: self._run_context,
            RefRoot.IN: self._inference_only,
            RefRoot.OUT: self._inference_only,
            RefRoot.ITEM: self._item,
            RefRoot.INDEX: self._index,
            RefRoot.CASE: self._case,
            RefRoot.ACC: self._acc,
            RefRoot.ITER: self._iter,
            RefRoot.LOOP: self._loop,
            RefRoot.BRANCH: self._branch,
            RefRoot.OK: self._ok,
            RefRoot.FAILED: self._failed,
            RefRoot.NODE: self._node,
        }

    def resolve(self, scope: Scope, text: str) -> Resolution:
        key = _scope_key(scope, text)
        if key not in self.resolutions:
            self.resolutions[key] = self._resolve(scope, text)
        return self.resolutions[key]

    def _resolve(self, scope: Scope, text: str) -> Resolution:
        try:
            ref = parse_ref(text)
        except RefSyntaxError as error:
            return Unresolved(DiagnosticCode.E_REF_SYNTAX, f"reference {text}: {error.reason}")
        head = self.handlers[ref.root](scope, ref)
        if isinstance(head, Unresolved) or head.annotation is None:
            return head
        return self._walk(head, ref.steps, text)

    def resolve_inference(self, scope: InferenceScope, text: str) -> Resolution:
        try:
            ref = parse_ref(text)
        except RefSyntaxError as error:
            return Unresolved(DiagnosticCode.E_REF_SYNTAX, f"path {text}: {error.reason}")
        side = INFERENCE_ROOTS.get(ref.root)
        if side is None:
            return Unresolved(DiagnosticCode.E_REF_SCOPE, f"path {text}: in an inference the root is $in or $out")
        head = Resolved(self.inference_record(scope.inference_id, side), ())
        if head.annotation is None:
            return head
        return self._walk(head, ref.steps, text)

    def inference_record(self, inference_id: str | None, side: Side) -> object | None:
        loaded = self.graph.project.inferences.get(InferenceId(inference_id)) if inference_id is not None else None
        source = loaded.source if loaded is not None else None
        if source is None:
            return None
        fields = source.spec.in_ if side == "in" else source.spec.out
        return self.record(f"inference.{inference_id}.{side}", fields)

    def tool_record(self, tool_id: str, side: Side) -> object | None:
        source = self.graph.project.tools.get(ToolId(tool_id))
        if source is None:
            return None
        fields = source.spec.in_ if side == "in" else source.spec.out
        return self.record(f"tool.{tool_id}.{side}", fields)

    def schema(self, annotation: object) -> JsonValue | None:
        cached = self.schemas.get(id(annotation))
        if cached is not None:
            return cached[1]
        schema = schema_of(annotation)
        self.schemas[id(annotation)] = (annotation, schema)
        return schema

    def type_annotation(self, text: str) -> object | None:
        try:
            return self.type_models.annotation(parse_type_ref(text))
        except TypeRefSyntaxError, TypeModelError:
            return None

    def field_annotation(self, decl: FieldDecl) -> object | None:
        try:
            return self.type_models.field_annotation(decl)
        except TypeModelError:
            return None

    def record(self, name: str, fields: Sequence[FieldDecl]) -> object | None:
        if name not in self.records:
            self.records[name] = self._build_record(name, fields)
        return self.records[name]

    def _build_record(self, name: str, fields: Sequence[FieldDecl]) -> object | None:
        try:
            return self.type_models.record(name.replace(".", "_"), fields)
        except TypeModelError:
            return None

    def node_output(self, entry: NodeEntry) -> object | None:
        key = id(entry)
        if key not in self.outputs:
            self.outputs[key] = OUTPUT_READERS[type(entry.spec)](self, entry)
        return self.outputs[key]

    def entry_dependencies(self, entry: NodeEntry) -> tuple[NodeEntry, ...]:
        key = id(entry)
        if key not in self.dependencies:
            self.dependencies[key] = self._dependencies(entry)
        return self.dependencies[key]

    def _dependencies(self, entry: NodeEntry) -> tuple[NodeEntry, ...]:
        referenced = (
            node
            for site in self.graph.entry_sites(entry)
            for node in _nodes_of(self.resolve(site.scope, site.text))
            if node is not entry
        )
        return (*_distinct(referenced), *self.graph.children(entry))

    def _walk(self, head: Resolved, steps: Sequence[RefStep], text: str) -> Resolution:
        annotation: object = head.annotation
        lifts: list[int | None] = []
        for step in steps:
            outcome = self._step(annotation, step, lifts)
            if isinstance(outcome, Unresolved):
                return Unresolved(outcome.code, f"reference {text}: {outcome.message}")
            annotation = outcome
        for limit in reversed(lifts):
            annotation = list_of(annotation, limit)
        return Resolved(annotation=annotation, nodes=head.nodes)

    def _step(self, annotation: object, step: RefStep, lifts: list[int | None]) -> object | Unresolved:
        match step:
            case FieldStep():
                return _step_outcome(step_field(annotation, step.name))
            case LiftStep():
                lifts.append(max_items(annotation))
                return _step_outcome(step_element(annotation))
            case IndexStep():
                return _step_outcome(step_element(annotation))

    def _input(self, scope: Scope, ref: Ref) -> Resolution:
        flow = self.graph.flow_spec(scope.owner)
        if flow is None:
            return _scope_error(scope, "$input is available only in nodes of a flow with a flow.yaml spec")
        return Resolved(self.type_annotation(flow.input), ())

    def _run_context(self, scope: Scope, ref: Ref) -> Resolution:
        flow = self.graph.flow_spec(scope.owner)
        declared = {key.value for key in (flow.context or ())} if flow is not None else set[str]()
        key = ref.key or ""
        if key not in declared:
            return _scope_error(scope, f"context key {key} is not declared in the flow context")
        return Resolved(self.type_annotation(CONTEXT_TYPES_BY_KEY[key]), ())

    def _inference_only(self, scope: Scope, ref: Ref) -> Resolution:
        message = (
            "$in and $out are available only in inference paths: schema_from, allowed_sets, checks; nodes use $input"
        )
        return _scope_error(scope, message)

    def _item(self, scope: Scope, ref: Ref) -> Resolution:
        mapped = _nearest(scope, MapNodeSpec)
        if mapped is None or not isinstance(mapped.entry.spec, MapNodeSpec):
            return _scope_error(scope, "$item is available only in a map body")
        over = self.resolve(self.graph.scope_of(mapped.entry), mapped.entry.spec.over)
        if isinstance(over, Unresolved) or over.annotation is None:
            return UNTYPED
        element = step_element(over.annotation)
        return Resolved(element if not isinstance(element, Missing | Opaque | NotList) else None, ())

    def _index(self, scope: Scope, ref: Ref) -> Resolution:
        if _nearest(scope, MapNodeSpec) is None:
            return _scope_error(scope, "$index is available only in a map body")
        return Resolved(self.type_annotation(INT), ())

    def _case(self, scope: Scope, ref: Ref) -> Resolution:
        switch = _nearest(scope, SwitchNodeSpec)
        if switch is None or not isinstance(switch.entry.spec, SwitchNodeSpec):
            return _scope_error(scope, "$case is available only in a switch case")
        on = self.resolve(self.graph.scope_of(switch.entry), switch.entry.spec.on)
        if isinstance(on, Unresolved) or on.annotation is None:
            return UNTYPED
        if switch.case_key is None:
            return Resolved(on.annotation, ())
        narrowed = narrow_case(on.annotation, switch.case_key)
        return Resolved(narrowed, ()) if narrowed is not None else UNTYPED

    def _acc(self, scope: Scope, ref: Ref) -> Resolution:
        loop = _nearest(scope, LoopNodeSpec)
        if loop is None:
            return _scope_error(scope, "$acc is available only in a loop body")
        return Resolved(self.body_record(loop.entry, previous=True), ())

    def _iter(self, scope: Scope, ref: Ref) -> Resolution:
        own = scope.own
        if own is None or not isinstance(own.spec, LoopNodeSpec):
            return _scope_error(scope, "$iter is available in stop, select and out of a loop")
        return Resolved(self.body_record(own, previous=False), ())

    def body_record(self, entry: NodeEntry, *, previous: bool) -> object | None:
        key = _key(entry, "acc" if previous else "iter")
        if key not in self.records:
            self.records[key] = self._build_body(entry, key, previous)
        return self.records[key]

    def _build_body(self, entry: NodeEntry, key: str, previous: bool) -> object | None:
        spec = entry.spec
        body = spec.body if isinstance(spec, LoopNodeSpec) else []
        outputs: dict[str, object | None] = {local: self._body_output(entry, local, previous) for local in body}
        if not outputs or any(output is None for output in outputs.values()):
            return None
        return annotated_record(key.replace(".", "_"), outputs)

    def _body_output(self, entry: NodeEntry, local: str, previous: bool) -> object | None:
        inner = self.graph.inner(entry, local)
        output = self.node_output(inner) if inner is not None else None
        if inner is None or output is None:
            return None
        wrapped = annotated_record(_key(inner, "out").replace(".", "_"), {"out": output})
        return optional_of(wrapped) if previous else wrapped

    def _loop(self, scope: Scope, ref: Ref) -> Resolution:
        own = scope.own
        if own is None or not isinstance(own.spec, LoopNodeSpec):
            return _scope_error(scope, "$loop is available only in the out of a loop")
        return Resolved(self._loop_record(own), ())

    def _loop_record(self, entry: NodeEntry) -> object | None:
        fields = [
            FieldDecl.model_validate({"name": "iterations", "type": INT, "description": "iterations"}),
            FieldDecl.model_validate(
                {
                    "name": "stop_reason",
                    "type": "Text",
                    "description": "stop reason",
                    "enum": [reason.value for reason in LoopStopReason],
                }
            ),
        ]
        return self.record(_key(entry, "loop"), fields)

    def _branch(self, scope: Scope, ref: Ref) -> Resolution:
        own = scope.own
        if own is None or not isinstance(own.spec, ParallelNodeSpec):
            return _scope_error(scope, "$branch is available only in the out of a parallel node")
        branch = own.spec.body.get(ref.key or "")
        inner = self.graph.inner(own, branch) if branch is not None else None
        if inner is None:
            return Unresolved(DiagnosticCode.E_REF_MISSING, f"node {own.node_id} has no branch {ref.key}")
        output = self.node_output(inner)
        complete = own.spec.join.use == JOIN_ALL
        annotation = optional_of(output) if not complete and output is not None else output
        return Resolved(annotation, (inner,))

    def _ok(self, scope: Scope, ref: Ref) -> Resolution:
        own = scope.own
        if own is not None and isinstance(own.spec, ParallelNodeSpec):
            return self._parallel_ok(own, own.spec)
        if own is not None and isinstance(own.spec, MapNodeSpec):
            return self._map_ok(own, own.spec)
        return _scope_error(scope, "$ok is available only in the out of parallel and map nodes")

    def _parallel_ok(self, entry: NodeEntry, spec: ParallelNodeSpec) -> Resolution:
        inner = [node for node in (self.graph.inner(entry, local) for local in spec.body.values()) if node]
        if not inner:
            return UNTYPED
        output = self.node_output(inner[0])
        annotation = list_of(output, len(spec.body)) if output is not None else None
        return Resolved(annotation, tuple(inner))

    def _map_ok(self, entry: NodeEntry, spec: MapNodeSpec) -> Resolution:
        inner = self.graph.inner(entry, spec.body)
        if inner is None:
            return UNTYPED
        output = self.node_output(inner)
        annotation = list_of(output, self._map_limit(entry, spec)) if output is not None else None
        return Resolved(annotation, (inner,))

    def _failed(self, scope: Scope, ref: Ref) -> Resolution:
        own = scope.own
        if own is None or not isinstance(own.spec, MapNodeSpec):
            return _scope_error(scope, "$failed is available only in the out of a map node")
        error = self.type_annotation(MAP_ITEM_ERROR)
        return Resolved(list_of(error, self._map_limit(own, own.spec)) if error is not None else None, ())

    def _map_limit(self, entry: NodeEntry, spec: MapNodeSpec) -> int | None:
        over = self.resolve(self.graph.scope_of(entry), spec.over)
        return max_items(over.annotation) if isinstance(over, Resolved) else None

    def _node(self, scope: Scope, ref: Ref) -> Resolution:
        name = ref.node_id or ""
        visible = self._visible(scope, name)
        if visible is not None:
            return Resolved(self.node_output(visible), (visible,))
        return self._invisible(scope, name)

    def _visible(self, scope: Scope, name: str) -> NodeEntry | None:
        containers = (frame.entry for frame in reversed(scope.frames))
        inner = next((node for node in (self.graph.inner(item, name) for item in containers) if node), None)
        return inner or self.graph.top(scope.owner, name)

    def _invisible(self, scope: Scope, name: str) -> Resolution:
        elsewhere = [entry for entry in self.graph.owner_entries(scope.owner) if entry.local_id == name]
        if elsewhere:
            return Unresolved(
                DiagnosticCode.E_REF_SCOPE,
                f"node {elsewhere[0].node_id} is inside another body and is not visible here",
            )
        if self.graph.broken_node(name):
            return UNTYPED
        return Unresolved(DiagnosticCode.E_REF_MISSING, f"node {name} does not exist in flow {scope.owner}")


@dataclass(frozen=True, slots=True)
class _Nearest:
    entry: NodeEntry
    case_key: str | None


def _nearest(scope: Scope, kind: type) -> _Nearest | None:
    frame = next((frame for frame in reversed(scope.frames) if isinstance(frame.entry.spec, kind)), None)
    return _Nearest(frame.entry, frame.case_key) if frame is not None else None


def _scope_key(scope: Scope, text: str) -> tuple[object, ...]:
    frames = tuple((id(frame.entry), frame.case_key) for frame in scope.frames)
    return (scope.owner, frames, id(scope.own) if scope.own is not None else None, text)


def _key(entry: NodeEntry, suffix: str) -> str:
    return f"flow.{entry.owner}.{entry.node_id}.{suffix}"


def _scope_error(scope: Scope, message: str) -> Unresolved:
    return Unresolved(DiagnosticCode.E_REF_SCOPE, message)


def _step_outcome(outcome: object) -> object | Unresolved:
    match outcome:
        case Missing():
            return Unresolved(DiagnosticCode.E_REF_MISSING, f"the value has no field {outcome.name}")
        case Opaque():
            return Unresolved(
                DiagnosticCode.E_OPAQUE_ACCESS, "a Dynamic value is opaque: steps into it are not allowed"
            )
        case NotList():
            return Unresolved(DiagnosticCode.E_BINDING_TYPE, "steps [*] and [n] apply only to a list")
        case _:
            return outcome


def _nodes_of(resolution: Resolution) -> tuple[NodeEntry, ...]:
    return resolution.nodes if isinstance(resolution, Resolved) else ()


def _distinct(entries: Iterable[NodeEntry]) -> tuple[NodeEntry, ...]:
    return tuple({id(entry): entry for entry in entries}.values())


def _record_output(resolver: RefResolver, entry: NodeEntry) -> object | None:
    spec = entry.spec
    if not isinstance(spec, RECORD_OUTPUT_CLASSES):
        return None
    return resolver.record(_key(entry, "out"), spec.out)


def _llm_output(resolver: RefResolver, entry: NodeEntry) -> object | None:
    spec = entry.spec
    return resolver.inference_record(spec.inference, "out") if isinstance(spec, LlmNodeSpec) else None


def _tool_output(resolver: RefResolver, entry: NodeEntry) -> object | None:
    spec = entry.spec
    return resolver.tool_record(spec.tool, "out") if isinstance(spec, ToolNodeSpec) else None


def _human_output(resolver: RefResolver, entry: NodeEntry) -> object | None:
    spec = entry.spec
    return resolver.type_annotation(spec.form) if isinstance(spec, HumanNodeSpec) else None


def _call_output(resolver: RefResolver, entry: NodeEntry) -> object | None:
    spec = entry.spec
    flow = resolver.graph.flow_spec(spec.flow) if isinstance(spec, CallNodeSpec) else None
    return resolver.type_annotation(flow.output) if flow is not None else None


def _narrow_output(resolver: RefResolver, entry: NodeEntry) -> object | None:
    spec = entry.spec
    return resolver.type_annotation(spec.to) if isinstance(spec, NarrowNodeSpec) else None


RECORD_OUTPUT_CLASSES: Final = (
    CodeNodeSpec,
    ParallelNodeSpec,
    MapNodeSpec,
    SwitchNodeSpec,
    LoopNodeSpec,
)

OUTPUT_READERS: Final[Mapping[type, Callable[[RefResolver, NodeEntry], object | None]]] = {
    LlmNodeSpec: _llm_output,
    CodeNodeSpec: _record_output,
    ToolNodeSpec: _tool_output,
    ParallelNodeSpec: _record_output,
    MapNodeSpec: _record_output,
    SwitchNodeSpec: _record_output,
    LoopNodeSpec: _record_output,
    HumanNodeSpec: _human_output,
    CallNodeSpec: _call_output,
    NarrowNodeSpec: _narrow_output,
}
