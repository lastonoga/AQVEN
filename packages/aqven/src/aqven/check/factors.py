from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

from aqven.check.experiment_site import ExperimentRule, ExperimentSite
from aqven.check.local_flows import flow_file
from aqven.check.subjects import flow_spec, range_order
from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.factors import experiment_usage, local_nodes, outside_factor, slot_kind
from aqven.loader import NODE_ID_SEPARATOR, LoadedExperiment, LoadedFlow, YamlPath, local_node_id
from aqven.spec import ExperimentFactor, NodeId, NodeSpec

NONE: Final = "none"
VARIES_NODES: Final = ("varies", "nodes")


@dataclass(frozen=True, slots=True)
class FactorScope:
    site: ExperimentSite
    factor: ExperimentFactor
    flow: LoadedFlow
    nodes: dict[NodeId, NodeSpec]
    tops: dict[NodeId, NodeId]
    ranged: tuple[NodeId, ...] | None

    @classmethod
    def of(cls, site: ExperimentSite) -> FactorScope | None:
        factor = site.spec.varies
        flow = site.subject
        if factor is None or flow is None:
            return None
        tops = {local_node_id(node): NodeId(node.split(NODE_ID_SEPARATOR)[0]) for node in flow.nodes}
        ranged = range_order(site.spec.subject, flow_spec(flow))
        return cls(site, factor, flow, local_nodes(flow), tops, ranged)

    def unknown(self, path: YamlPath, node: NodeId, problem: str, fix: str) -> Diagnostic:
        values = {"node": node, "problem": problem, "fix": fix}
        return self.site.templated(DiagnosticCode.E_FACTOR_NODE_UNKNOWN, path, **values)


def factor_ready(site: ExperimentSite) -> bool:
    return FactorScope.of(site) is not None and next(factor_node_problems(site), None) is None


def factor_node_problems(site: ExperimentSite) -> Iterator[Diagnostic]:
    scope = FactorScope.of(site)
    if scope is None:
        return
    for index, node in enumerate(scope.factor.nodes):
        yield from _factor_node(scope, (*VARIES_NODES, index), node)


def _factor_missing(site: ExperimentSite) -> Iterator[Diagnostic]:
    variants = site.spec.variants
    setting = tuple(variant.id for variant in variants if variant.nodes)
    if site.spec.varies is not None or not setting:
        return
    problem = f"{len(variants)} variants must differ" if len(variants) > 1 else f"variant {setting[0]} sets nodes"
    yield site.templated(DiagnosticCode.E_FACTOR_MISSING, ("variants",), problem=problem)


def _factor_node(scope: FactorScope, path: YamlPath, node: NodeId) -> Iterator[Diagnostic]:
    spec = scope.nodes.get(node)
    if spec is None:
        yield from _unknown_node(scope, path, node)
        return
    wanted = slot_kind(scope.factor.what)
    if not wanted.accepts(spec):
        yield _wrong_kind(scope, path, node, spec)
        return
    if scope.ranged is None or scope.tops[node] in scope.ranged:
        return
    problem = f"which lies outside the range {', '.join(scope.ranged)} of {scope.site.label}"
    fix = "name a node inside the range: nodes before it replay the case node_outputs, nodes after it do not run"
    yield scope.unknown(path, node, problem, fix)


def _unknown_node(scope: FactorScope, path: YamlPath, node: NodeId) -> Iterator[Diagnostic]:
    if node in scope.site.context.project.broken_ids:
        return
    problem = f"which is not a node of {scope.site.label}"
    fix = f"name a node of {scope.site.label} by its own id: {', '.join(scope.nodes) or NONE}"
    yield scope.unknown(path, node, problem, fix)


def _wrong_kind(scope: FactorScope, path: YamlPath, node: NodeId, spec: NodeSpec) -> Diagnostic:
    wanted = slot_kind(scope.factor.what)
    candidates = ", ".join(item for item, candidate in scope.nodes.items() if wanted.accepts(candidate)) or NONE
    values = {
        "what": scope.factor.what.value,
        "wanted": wanted.label,
        "node": node,
        "kind": spec.node,
        "subject": scope.site.label,
        "candidates": candidates,
    }
    return scope.site.templated(DiagnosticCode.E_FACTOR_KIND, path, **values)


def _outside_factor(site: ExperimentSite) -> Iterator[Diagnostic]:
    factor = site.spec.varies
    if factor is None:
        return
    declared = ", ".join(factor.nodes)
    outside = (
        (index, variant.id, node)
        for index, variant in enumerate(site.spec.variants)
        for node in outside_factor(site.spec, variant)
    )
    for index, variant_id, node in outside:
        path: YamlPath = ("variants", index, "nodes", node)
        values = {"variant": variant_id, "node": node, "nodes": declared}
        yield site.templated(DiagnosticCode.E_VARIANT_OUTSIDE_FACTOR, path, **values)


def _alternative_ids(site: ExperimentSite) -> Iterator[Diagnostic]:
    flow = site.subject
    if flow is None:
        return
    taken = local_nodes(flow)
    clashes = ((node, source.path) for node, source in site.loaded.alternatives.items() if node in taken)
    for node, file in clashes:
        yield site.templated_at(DiagnosticCode.E_ALTERNATIVE_ID_TAKEN, file, alternative=node, subject=site.label)


def _duplicate_variants(site: ExperimentSite) -> Iterator[Diagnostic]:
    variants = site.spec.variants
    values = [frozenset((variant.nodes or {}).items()) for variant in variants]
    if len(set(values)) == 1:
        return
    repeated = ((index, values.index(value)) for index, value in enumerate(values) if values.index(value) != index)
    for index, first in repeated:
        path: YamlPath = ("variants", index, "nodes") if variants[index].nodes else ("variants", index, "id")
        values_of = {"variant": variants[index].id, "first": variants[first].id}
        yield site.templated(DiagnosticCode.W_VARIANT_DUPLICATE, path, **values_of)


def _unused(site: ExperimentSite) -> Iterator[Diagnostic]:
    for entity, file in _unused_entities(site.loaded):
        yield site.templated_at(DiagnosticCode.W_ALTERNATIVE_UNUSED, file, entity=entity, file=file)


def _unused_entities(loaded: LoadedExperiment) -> Iterator[tuple[str, str]]:
    usage = experiment_usage(loaded)
    alternatives = loaded.alternatives.items()
    flows = loaded.flows.items()
    yield from ((f"alternative {node}", item.path) for node, item in alternatives if node not in usage.alternatives)
    yield from ((f"prompt {name}", item.path) for name, item in loaded.prompts.items() if name not in usage.prompts)
    yield from ((f"local flow {flow_id}", flow_file(item)) for flow_id, item in flows if flow_id not in usage.flows)


FACTOR_RULES: Final[tuple[ExperimentRule, ...]] = (
    _factor_missing,
    factor_node_problems,
    _outside_factor,
    _alternative_ids,
    _duplicate_variants,
    _unused,
)
