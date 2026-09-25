from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.loader import LoadedExperiment, YamlPath
from aqven.spec import NodeId, VariantId

VARIANTS_KEY: Final = "variants"
NODES_KEY: Final = "nodes"


@dataclass(frozen=True, slots=True)
class VariantSite:
    experiment: LoadedExperiment
    variant_id: VariantId
    index: int | None

    @property
    def file(self) -> str:
        return self.experiment.source.path

    def path(self, node: NodeId | None = None) -> YamlPath:
        if self.index is None:
            return (VARIANTS_KEY,)
        if node is None:
            return (VARIANTS_KEY, self.index, NODES_KEY)
        return (VARIANTS_KEY, self.index, NODES_KEY, node)

    def values(self, **values: str) -> Mapping[str, str]:
        return {"experiment": self.experiment.experiment_id, "variant": self.variant_id, **values}

    def problem(self, code: DiagnosticCode, node: NodeId, message: str) -> Diagnostic:
        return diagnostic(code, self.file, self.path(node), f"variant {self.variant_id}: {message}")

    def templated(self, code: DiagnosticCode, node: NodeId, **values: str) -> Diagnostic:
        return templated_diagnostic(code, self.file, self.path(node), self.values(node=node, **values))
