from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import TypeAdapter, ValidationError

from aqven.check.context import CheckContext
from aqven.check.graph import BindingSite, NodeEntry, Scope, SitePurpose, ValueSite
from aqven.check.nodes import typed_entries
from aqven.check.schemas import Rejection, accepts, rejection
from aqven.check.scopes import Resolved
from aqven.check.shapes import is_dynamic, record_fields
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import YamlPath
from aqven.spec import (
    CallNodeSpec,
    CodeNodeSpec,
    FieldBinding,
    FieldDecl,
    FlowId,
    FlowSpec,
    HumanNodeSpec,
    LlmNodeSpec,
    LoopNodeSpec,
    RecordType,
    SwitchNodeSpec,
    ToolNodeSpec,
    TypeId,
    TypeRefSyntaxError,
    parse_type_ref,
)

SLOT_PURPOSES: Final = frozenset({SitePurpose.INPUT, SitePurpose.OUTPUT})


@dataclass(frozen=True, slots=True)
class InputSlots:
    label: str
    slots: Sequence[FieldDecl]


@dataclass(frozen=True, slots=True)
class BindingTarget:
    path: YamlPath
    inputs: InputSlots
    bindings: Sequence[FieldBinding]
    requires_all: bool


def check_bindings(context: CheckContext) -> Iterable[Diagnostic]:
    return (
        *_slot_bindings(context),
        *_node_bindings(context),
        *_returns(context),
        *_case_bindings(context),
        *_values(context),
    )


def compatible(context: CheckContext, slot: object, source: object) -> bool | None:
    slot_schema = context.refs.schema(slot)
    source_schema = context.refs.schema(source)
    if slot_schema is None or source_schema is None:
        return None
    return accepts(slot_schema, source_schema)


def mismatch(context: CheckContext, slot: object, source: object) -> Rejection | None:
    slot_schema = context.refs.schema(slot)
    source_schema = context.refs.schema(source)
    if slot_schema is None or source_schema is None:
        return None
    return rejection(slot_schema, source_schema)


def binding_problem(
    context: CheckContext,
    file: str,
    path: YamlPath,
    slot: object,
    source: object,
    label: str,
) -> Iterator[Diagnostic]:
    if is_dynamic(source) and not is_dynamic(slot):
        message = f"{label}: an opaque Dynamic value is accepted only by narrow, code and a whole template slot"
        yield diagnostic(DiagnosticCode.E_OPAQUE_ACCESS, file, path, message)
        return
    found = mismatch(context, slot, source)
    if found is None:
        return
    message = f"{label}: the source type is not compatible with the slot; first schema difference {found.describe()}"
    yield diagnostic(DiagnosticCode.E_BINDING_TYPE, file, path, message)


def optional_slot(decl: FieldDecl) -> bool:
    try:
        return parse_type_ref(decl.type).is_optional
    except TypeRefSyntaxError:
        return True


def _slot_bindings(context: CheckContext) -> Iterator[Diagnostic]:
    for site in context.graph.binding_sites():
        if site.purpose not in SLOT_PURPOSES or site.slot is None:
            continue
        yield from _slot_binding(context, site)


def _slot_binding(context: CheckContext, site: BindingSite) -> Iterator[Diagnostic]:
    resolution = context.refs.resolve(site.scope, site.text)
    slot = context.refs.field_annotation(site.slot) if site.slot is not None else None
    if not isinstance(resolution, Resolved) or resolution.annotation is None or slot is None:
        return
    label = f"field {site.slot.name if site.slot else ''} from {site.text}"
    yield from binding_problem(context, site.file, site.path, slot, resolution.annotation, label)


def input_slots(context: CheckContext, entry: NodeEntry) -> InputSlots | None:
    match entry.spec:
        case LlmNodeSpec(inference=name):
            inference = context.inference(name)
            return InputSlots(f"inference {name}", inference.in_) if inference is not None else None
        case ToolNodeSpec(tool=name):
            tool = context.tool(name)
            return InputSlots(f"tool {name}", tool.in_) if tool is not None else None
        case CallNodeSpec(flow=name):
            return flow_input_slots(context, name)
        case CodeNodeSpec() | HumanNodeSpec() as step:
            return InputSlots(f"node {entry.local_id}", step.in_)
        case _:
            return None


def flow_input_slots(context: CheckContext, flow_id: str) -> InputSlots | None:
    flow = context.graph.flow_spec(flow_id)
    declared = context.project.types.get(TypeId(flow.input)) if flow is not None else None
    record = declared.spec if declared is not None else None
    return InputSlots(f"flow {flow_id}", record.fields) if isinstance(record, RecordType) else None


def _node_bindings(context: CheckContext) -> Iterator[Diagnostic]:
    for entry in context.graph.all_entries():
        yield from (item for target in _targets(context, entry) for item in _target(context, entry, target))
        yield from _init_nodes(entry)


def _targets(context: CheckContext, entry: NodeEntry) -> Iterator[BindingTarget]:
    spec = entry.spec
    inputs = input_slots(context, entry)
    if isinstance(spec, LlmNodeSpec | ToolNodeSpec | CallNodeSpec) and inputs is not None:
        yield BindingTarget(("in",), inputs, spec.in_, requires_all=True)
    if isinstance(spec, LoopNodeSpec):
        yield from _init_targets(context, entry, spec)


def _init_targets(context: CheckContext, entry: NodeEntry, spec: LoopNodeSpec) -> Iterator[BindingTarget]:
    for local, bindings in (spec.init or {}).items():
        inner = context.graph.inner(entry, local)
        body = input_slots(context, inner) if inner is not None else None
        if body is None:
            continue
        yield BindingTarget(("init", local), body, bindings, requires_all=False)


def _init_nodes(entry: NodeEntry) -> Iterator[Diagnostic]:
    spec = entry.spec
    if not isinstance(spec, LoopNodeSpec):
        return
    for local in spec.init or {}:
        if local in spec.body:
            continue
        message = f"init binds inputs of node {local}, which is not in body: {', '.join(spec.body)}"
        yield diagnostic(DiagnosticCode.E_REF_MISSING, entry.file, ("init", local), message)


def _target(context: CheckContext, entry: NodeEntry, target: BindingTarget) -> Iterator[Diagnostic]:
    label = target.inputs.label
    slots = {decl.name: decl for decl in target.inputs.slots}
    bound = {binding.name for binding in target.bindings}
    unbound = [decl.name for decl in target.inputs.slots if decl.name not in bound and not optional_slot(decl)]
    if target.requires_all and unbound:
        message = f"required inputs of {label} are not bound: {', '.join(unbound)}"
        yield diagnostic(DiagnosticCode.E_INPUT_UNBOUND, entry.file, target.path, message)
    scope = context.graph.scope_of(entry)
    for index, binding in enumerate(target.bindings):
        path: YamlPath = (*target.path, index)
        decl = slots.get(binding.name)
        if decl is None:
            message = f"{label} has no input {binding.name}: {', '.join(slots) or '—'}"
            yield diagnostic(DiagnosticCode.E_INPUT_UNKNOWN, entry.file, (*path, "name"), message)
            continue
        yield from _bound_value(context, entry, scope, path, binding, decl)


def _bound_value(
    context: CheckContext,
    entry: NodeEntry,
    scope: Scope,
    path: YamlPath,
    binding: FieldBinding,
    decl: FieldDecl,
) -> Iterator[Diagnostic]:
    slot = context.refs.field_annotation(decl)
    if slot is None:
        return
    if binding.from_ is None:
        yield from _literal(entry.file, (*path, "value"), slot, decl, binding.value)
        return
    resolution = context.refs.resolve(scope, binding.from_)
    if not isinstance(resolution, Resolved) or resolution.annotation is None:
        return
    label = f"input {binding.name} from {binding.from_}"
    yield from binding_problem(context, entry.file, (*path, "from"), slot, resolution.annotation, label)


def _returns(context: CheckContext) -> Iterator[Diagnostic]:
    for flow in context.project.flows.values():
        source = flow.source
        if source is None:
            continue
        yield from _flow_returns(context, flow.flow_id, source.path, source.spec)


def _flow_returns(context: CheckContext, flow_id: FlowId, file: str, spec: FlowSpec) -> Iterator[Diagnostic]:
    output = context.refs.type_annotation(spec.output)
    fields = record_fields(output) if output is not None and not is_dynamic(output) else None
    if fields is None:
        return
    names = [binding.name for binding in spec.returns]
    if names != list(fields):
        yield diagnostic(
            DiagnosticCode.E_BINDING_TYPE,
            file,
            ("returns",),
            f"returns lists {', '.join(names)}, but the fields of {spec.output} in order are {', '.join(fields)}",
        )
    scope = Scope(owner=flow_id, frames=(), own=None)
    for index, binding in enumerate(spec.returns):
        slot = fields.get(binding.name)
        if binding.from_ is None or slot is None:
            continue
        resolution = context.refs.resolve(scope, binding.from_)
        if not isinstance(resolution, Resolved) or resolution.annotation is None:
            continue
        label = f"returns.{binding.name} from {binding.from_}"
        yield from binding_problem(context, file, ("returns", index, "from"), slot, resolution.annotation, label)


def _case_bindings(context: CheckContext) -> Iterator[Diagnostic]:
    for entry, spec in typed_entries(context.graph, SwitchNodeSpec):
        yield from _switch_cases(context, entry, spec)


def _switch_cases(context: CheckContext, entry: NodeEntry, spec: SwitchNodeSpec) -> Iterator[Diagnostic]:
    slots = {decl.name: decl for decl in spec.out}
    for key, case in spec.cases.items():
        if case.bind is not None:
            yield from _bound_case(context, entry, spec, key)
            continue
        inner = context.graph.inner(entry, case.node) if case.node is not None else None
        if inner is None:
            continue
        yield from _node_case(context, entry, key, inner, slots)


def _bound_case(context: CheckContext, entry: NodeEntry, spec: SwitchNodeSpec, key: str) -> Iterator[Diagnostic]:
    case = spec.cases[key]
    bound = [binding.name for binding in case.bind or ()]
    expected = [decl.name for decl in spec.out]
    if sorted(bound) != sorted(expected):
        yield diagnostic(
            DiagnosticCode.E_BINDING_TYPE,
            entry.file,
            ("cases", key, "bind"),
            f"case {key} binds {', '.join(bound) or '—'}, but the switch out is {', '.join(expected)}",
        )
    scope = context.graph.inner_scope(entry, key)
    slots = {decl.name: decl for decl in spec.out}
    for index, binding in enumerate(case.bind or ()):
        decl = slots.get(binding.name)
        slot = context.refs.field_annotation(decl) if decl is not None else None
        if binding.from_ is None or slot is None:
            continue
        resolution = context.refs.resolve(scope, binding.from_)
        if not isinstance(resolution, Resolved) or resolution.annotation is None:
            continue
        label = f"case {key}, field {binding.name} from {binding.from_}"
        path = ("cases", key, "bind", index, "from")
        yield from binding_problem(context, entry.file, path, slot, resolution.annotation, label)


def _node_case(
    context: CheckContext,
    entry: NodeEntry,
    key: str,
    inner: NodeEntry,
    slots: Mapping[str, FieldDecl],
) -> Iterator[Diagnostic]:
    output = context.refs.node_output(inner)
    switch_output = context.refs.node_output(entry)
    if output is None or switch_output is None or compatible(context, switch_output, output) is not False:
        return
    yield diagnostic(
        DiagnosticCode.E_BINDING_TYPE,
        entry.file,
        ("cases", key, "node"),
        f"case {key} without bind: out of node {inner.local_id} ({', '.join(record_fields(output) or {})}) "
        f"does not match the switch out ({', '.join(slots)})",
    )


def _values(context: CheckContext) -> Iterator[Diagnostic]:
    for site in context.graph.value_sites():
        yield from _value(context, site)


def _value(context: CheckContext, site: ValueSite) -> Iterator[Diagnostic]:
    slot = context.refs.field_annotation(site.slot)
    if slot is None:
        return
    yield from _literal(site.file, site.path, slot, site.slot, site.value)


def _literal(file: str, path: YamlPath, slot: object, decl: FieldDecl, value: object) -> Iterator[Diagnostic]:
    try:
        TypeAdapter[object](slot).validate_python(value)
    except ValidationError as error:
        message = f"literal of field {decl.name} does not pass type {decl.type}: {error.errors()[0]['msg']}"
        yield diagnostic(DiagnosticCode.E_BINDING_TYPE, file, path, message)
