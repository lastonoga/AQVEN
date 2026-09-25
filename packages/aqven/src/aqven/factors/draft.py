from collections.abc import Collection, Iterable
from dataclasses import dataclass, field, replace
from typing import Final

from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.factors.alternatives import brought_alternatives
from aqven.factors.derived import derived_inference
from aqven.factors.model import FactorChange
from aqven.factors.site import VariantSite
from aqven.factors.slots import slot_kind
from aqven.factors.subjects import local_nodes, resolve_flow
from aqven.factors.walk import walk
from aqven.loader import (
    ExperimentPrompt,
    LoadedExperiment,
    LoadedFlow,
    LoadedInference,
    LoadedProject,
    SourceSpec,
    expand_node_table,
    local_node_id,
)
from aqven.spec import FlowId, InferenceId, InferenceSpec, NodeId, NodeSpec, inner_nodes

NONE: Final = "none"


@dataclass(slots=True)
class VariantDraft:
    project: LoadedProject
    experiment: LoadedExperiment
    site: VariantSite
    subject: LoadedFlow
    nodes: dict[NodeId, SourceSpec[NodeSpec]]
    inferences: dict[InferenceId, LoadedInference] = field(default_factory=dict[InferenceId, LoadedInference])
    replaced: bool = False

    @classmethod
    def start(
        cls, project: LoadedProject, experiment: LoadedExperiment, site: VariantSite, subject: LoadedFlow
    ) -> VariantDraft:
        nodes = {local_node_id(node_id): source for node_id, source in subject.nodes.items()}
        return cls(project, experiment, site, subject, nodes)

    def known(self, table: Collection[str], name: str) -> bool:
        return name in table or name in self.project.broken_ids

    def flow(self, flow_id: FlowId) -> LoadedFlow | None:
        return resolve_flow(self.project, self.experiment, flow_id)

    def put(self, node: NodeId, source: SourceSpec[NodeSpec]) -> None:
        self.nodes[node] = source

    def swap(self, node: NodeId, alternative: SourceSpec[NodeSpec]) -> None:
        self.nodes[node] = alternative
        self.replaced = True
        for child in brought_alternatives(self.experiment, inner_nodes(alternative.spec)):
            self.nodes[child] = self.experiment.alternatives[child]

    def derive(
        self, origin: LoadedInference, source: SourceSpec[InferenceSpec], prompt: ExperimentPrompt
    ) -> LoadedInference:
        derived = derived_inference(origin, source, prompt, self._taken)
        self.inferences[derived.inference_id] = derived
        return derived

    def subject_flow(self) -> LoadedFlow:
        nodes = self._reachable() if self.replaced else self.nodes
        return replace(self.subject, nodes=expand_node_table(nodes))

    def wrong_kind(self, change: FactorChange, spec: NodeSpec) -> Diagnostic:
        wanted = slot_kind(change.what)
        candidates = (node for node, item in local_nodes(self.subject).items() if wanted.accepts(item))
        message = (
            f"varies.what {change.what} changes {wanted.label} nodes, but {change.node_id} is a {spec.node} node; "
            f"{wanted.label} nodes of flow {self.subject.flow_id}: {', '.join(candidates) or NONE}"
        )
        return self.site.problem(DiagnosticCode.E_FACTOR_KIND, change.node_id, message)

    def unknown_node(self, change: FactorChange) -> Diagnostic:
        message = f"{change.node_id} is not a node of flow {self.subject.flow_id}"
        return self.site.problem(DiagnosticCode.E_FACTOR_NODE_UNKNOWN, change.node_id, message)

    def _reachable(self) -> dict[NodeId, SourceSpec[NodeSpec]]:
        source = self.subject.source
        if source is None:
            return self.nodes
        kept = frozenset(walk(source.spec.order, self._children))
        return {node: item for node, item in self.nodes.items() if node in kept}

    def _children(self, node: NodeId) -> Iterable[NodeId] | None:
        source = self.nodes.get(node)
        return None if source is None else inner_nodes(source.spec)

    def _taken(self, inference_id: InferenceId) -> bool:
        return inference_id in self.project.inferences
