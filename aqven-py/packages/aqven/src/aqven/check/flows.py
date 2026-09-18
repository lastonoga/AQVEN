from collections.abc import Iterable, Iterator

from aqven.check.bindings import flow_input_slots
from aqven.check.context import CheckContext
from aqven.check.context_keys import bound_keys
from aqven.check.graph import NodeEntry
from aqven.check.nodes import typed_entries
from aqven.check.provenance import ProvenanceTracer, entry_families, llm_entries, primary_family
from aqven.check.types import reachable
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import YamlPath
from aqven.spec import (
    CallNodeSpec,
    ContractPredicate,
    FamiliesDistinct,
    FamilyDisjointFromInput,
    FieldBefore,
    FlowId,
    FlowSpec,
    LlmNodeSpec,
    ModelFamily,
    RunContextKey,
)


def check_flows(context: CheckContext) -> Iterable[Diagnostic]:
    return (*_calls(context), *_recursion(context), *_contracts(context), *_context_keys(context))


def _context_keys(context: CheckContext) -> Iterator[Diagnostic]:
    bound = bound_keys(context.graph)
    for flow_id, flow in context.project.flows.items():
        source = flow.source
        if source is None:
            continue
        yield from _unused_keys(flow_id, source.path, source.spec, bound.get(flow_id, frozenset()))


def _unused_keys(flow_id: FlowId, file: str, spec: FlowSpec, bound: frozenset[RunContextKey]) -> Iterator[Diagnostic]:
    declared = tuple(spec.context or ())
    for index, key in enumerate(declared):
        if key in bound:
            continue
        message = (
            f"flow {flow_id} declares run context key {key}, which no binding of its nodes reads; "
            f"the compiler infers the keys from bindings, so remove it or bind it with $run.context.{key}"
        )
        yield diagnostic(DiagnosticCode.W_CONTEXT_KEY_UNUSED, file, ("context", index), message)


def _calls(context: CheckContext) -> Iterator[Diagnostic]:
    for entry, spec in typed_entries(context.graph, CallNodeSpec):
        flow = context.project.flows.get(spec.flow)
        if flow is None:
            message = f"flow {spec.flow} does not exist in the project"
            yield diagnostic(DiagnosticCode.E_FLOW_UNKNOWN, entry.file, ("flow",), message)
            continue
        if flow.source is None:
            continue
        if flow_input_slots(context, spec.flow) is None:
            message = (
                f"call binds input fields of flow {spec.flow}, but its input {flow.source.spec.input} is not a record"
            )
            yield diagnostic(DiagnosticCode.E_BINDING_TYPE, entry.file, ("flow",), message)
        yield from _call_site_contracts(context, entry, spec, flow.source.spec)


def _recursion(context: CheckContext) -> Iterator[Diagnostic]:
    edges = {flow_id: _called(context, flow_id) for flow_id in context.project.flows}
    for flow_id, flow in context.project.flows.items():
        if flow_id not in reachable(edges, flow_id) or flow.source is None:
            continue
        message = f"flow {flow_id} calls itself through a chain of call nodes"
        yield diagnostic(DiagnosticCode.E_FLOW_RECURSION, flow.source.path, (), message)


def _called(context: CheckContext, flow_id: FlowId) -> tuple[FlowId, ...]:
    return tuple(
        entry.spec.flow for entry in context.graph.owner_entries(flow_id) if isinstance(entry.spec, CallNodeSpec)
    )


def _contracts(context: CheckContext) -> Iterator[Diagnostic]:
    for flow_id, flow in context.project.flows.items():
        source = flow.source
        if source is None:
            continue
        for index, predicate in enumerate(source.spec.requires or ()):
            yield from _static_contract(context, flow_id, source.path, ("requires", index), predicate)


def _static_contract(
    context: CheckContext,
    flow_id: FlowId,
    file: str,
    path: YamlPath,
    predicate: ContractPredicate,
) -> Iterator[Diagnostic]:
    match predicate:
        case FamiliesDistinct():
            yield from _families_distinct(context, flow_id, file, path, predicate)
        case FieldBefore():
            yield from _field_before(context, flow_id, file, path, predicate)
        case FamilyDisjointFromInput():
            pass


def _families_distinct(
    context: CheckContext,
    flow_id: FlowId,
    file: str,
    path: YamlPath,
    predicate: FamiliesDistinct,
) -> Iterator[Diagnostic]:
    entries = (context.graph.entry(flow_id, node_id) for node_id in predicate.nodes)
    families = {family for entry in entries if entry is not None and (family := primary_family(context, entry))}
    if len(families) >= predicate.min:
        return
    message = (
        f"families_distinct: nodes {', '.join(predicate.nodes)} cover families "
        f"{', '.join(sorted(families)) or '—'}, but at least {predicate.min} are required"
    )
    yield diagnostic(DiagnosticCode.E_CONTRACT_VIOLATION, file, path, message)


def _field_before(
    context: CheckContext,
    flow_id: FlowId,
    file: str,
    path: YamlPath,
    predicate: FieldBefore,
) -> Iterator[Diagnostic]:
    for node_id in predicate.nodes:
        entry = context.graph.entry(flow_id, node_id)
        spec = entry.spec if entry is not None else None
        inference = context.inference(spec.inference) if isinstance(spec, LlmNodeSpec) else None
        if inference is None or _ordered([decl.name for decl in inference.out], predicate.first, predicate.second):
            continue
        message = (
            f"field_before: in the inference out of node {node_id}, field {predicate.first} must come before "
            f"{predicate.second}"
        )
        yield diagnostic(DiagnosticCode.E_CONTRACT_VIOLATION, file, path, message)


def _ordered(fields: list[str], first: str, second: str) -> bool:
    return first in fields and second in fields and fields.index(first) < fields.index(second)


def _call_site_contracts(
    context: CheckContext,
    entry: NodeEntry,
    spec: CallNodeSpec,
    flow: FlowSpec,
) -> Iterator[Diagnostic]:
    disjoint = (item for item in flow.requires or () if isinstance(item, FamilyDisjointFromInput))
    for predicate in disjoint:
        yield from _family_disjoint(context, entry, spec, predicate)


def _family_disjoint(
    context: CheckContext,
    entry: NodeEntry,
    spec: CallNodeSpec,
    predicate: FamilyDisjointFromInput,
) -> Iterator[Diagnostic]:
    judges = (context.graph.entry(spec.flow, node_id) for node_id in predicate.nodes)
    judged = {family for judge in judges if judge is not None for family in entry_families(context, judge)}
    produced = {family for producer in _input_producers(context, entry, spec, predicate.input) for family in producer}
    shared = judged & produced
    if not shared:
        return
    message = (
        f"family_disjoint_from_input: families {', '.join(sorted(shared))} belong both to nodes of flow "
        f"{spec.flow} and to llm nodes that produced input {predicate.input}"
    )
    yield diagnostic(DiagnosticCode.E_CONTRACT_VIOLATION, entry.file, ("in",), message)


def _input_producers(
    context: CheckContext, entry: NodeEntry, spec: CallNodeSpec, name: str
) -> Iterator[frozenset[ModelFamily]]:
    tracer = ProvenanceTracer(context, through_code=True)
    bindings = (binding for binding in spec.in_ if binding.name == name)
    origins = (origin for binding in bindings for origin in tracer.binding_origins(entry, binding))
    return (entry_families(context, producer) for producer in llm_entries(origins))
