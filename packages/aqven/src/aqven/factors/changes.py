from collections.abc import Sequence

from aqven.factors.model import FactorChange
from aqven.spec import ExperimentSpec, NodeId, VariantSpec


def variant_changes(spec: ExperimentSpec, variant: VariantSpec) -> tuple[FactorChange, ...]:
    factor = spec.varies
    values = variant.nodes or {}
    if factor is None:
        return ()
    ordered = sorted(values, key=lambda node: _rank(factor.nodes, tuple(values), node))
    return tuple(FactorChange(node, factor.what, values[node]) for node in ordered)


def outside_factor(spec: ExperimentSpec, variant: VariantSpec) -> tuple[NodeId, ...]:
    declared = frozenset(spec.varies.nodes if spec.varies is not None else ())
    return tuple(node for node in variant.nodes or {} if node not in declared)


def variant_index(spec: ExperimentSpec, variant: VariantSpec) -> int | None:
    return next((index for index, item in enumerate(spec.variants) if item.id == variant.id), None)


def _rank(declared: Sequence[NodeId], written: Sequence[NodeId], node: NodeId) -> tuple[int, int]:
    if node in declared:
        return 0, declared.index(node)
    return 1, written.index(node)
