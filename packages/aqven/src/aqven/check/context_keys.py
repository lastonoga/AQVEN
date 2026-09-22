from collections.abc import Iterable, Mapping

from aqven.check.graph import ProjectGraph
from aqven.check.types import reachable
from aqven.spec import CallNodeSpec, FlowId, RefRoot, RefSyntaxError, RunContextKey, parse_ref


def context_key(text: str) -> RunContextKey | None:
    try:
        ref = parse_ref(text)
    except RefSyntaxError:
        return None
    if ref.root is not RefRoot.RUN_CONTEXT or ref.key is None:
        return None
    return RunContextKey(ref.key)


def ordered_keys(keys: Iterable[RunContextKey]) -> tuple[RunContextKey, ...]:
    found = frozenset(keys)
    return tuple(key for key in RunContextKey if key in found)


def declared_keys(graph: ProjectGraph, flow_id: FlowId) -> frozenset[RunContextKey]:
    spec = graph.flow_spec(flow_id)
    return frozenset(spec.context or ()) if spec is not None else frozenset()


def bound_keys(graph: ProjectGraph) -> Mapping[FlowId, frozenset[RunContextKey]]:
    found: dict[FlowId, set[RunContextKey]] = {flow_id: set() for flow_id in graph.project.flows}
    for site in graph.binding_sites():
        key = context_key(site.text)
        if key is None:
            continue
        found.setdefault(site.scope.owner, set()).add(key)
    return {flow_id: frozenset(keys) for flow_id, keys in found.items()}


def called_flows(graph: ProjectGraph, flow_id: FlowId) -> tuple[FlowId, ...]:
    entries = graph.owner_entries(flow_id)
    return tuple(entry.spec.flow for entry in entries if isinstance(entry.spec, CallNodeSpec))


def flow_context_keys(graph: ProjectGraph) -> Mapping[FlowId, tuple[RunContextKey, ...]]:
    bound = bound_keys(graph)
    flows = tuple(graph.project.flows)
    direct = {flow_id: declared_keys(graph, flow_id) | bound.get(flow_id, frozenset()) for flow_id in flows}
    edges = {flow_id: called_flows(graph, flow_id) for flow_id in flows}
    return {flow_id: _closure(flow_id, direct, edges) for flow_id in flows}


def _closure(
    flow_id: FlowId,
    direct: Mapping[FlowId, frozenset[RunContextKey]],
    edges: Mapping[FlowId, tuple[FlowId, ...]],
) -> tuple[RunContextKey, ...]:
    family = (flow_id, *sorted(reachable(edges, flow_id)))
    return ordered_keys(key for called in family for key in direct.get(called, frozenset()))
