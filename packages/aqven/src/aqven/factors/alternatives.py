from collections.abc import Iterable

from aqven.factors.walk import walk
from aqven.loader import LoadedExperiment
from aqven.spec import NodeId, inner_nodes


def brought_alternatives(experiment: LoadedExperiment, roots: Iterable[NodeId]) -> tuple[NodeId, ...]:
    def children(node: NodeId) -> tuple[NodeId, ...] | None:
        source = experiment.alternatives.get(node)
        return None if source is None else inner_nodes(source.spec)

    return walk(roots, children)
