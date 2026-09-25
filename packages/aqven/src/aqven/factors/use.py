from dataclasses import dataclass

from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.factors.draft import NONE, VariantDraft
from aqven.factors.model import FactorChange
from aqven.loader import SourceSpec, alternatives_folder
from aqven.spec import NodeId, NodeSpec


@dataclass(frozen=True, slots=True)
class UseFactor:
    def apply(self, draft: VariantDraft, change: FactorChange, slot: SourceSpec[NodeSpec]) -> tuple[Diagnostic, ...]:
        alternative = draft.experiment.alternatives.get(NodeId(change.value))
        if alternative is not None:
            draft.swap(change.node_id, alternative)
            return ()
        if change.value in draft.project.broken_ids:
            return ()
        alternatives = ", ".join(sorted(draft.experiment.alternatives)) or NONE
        folder = alternatives_folder(draft.experiment.folder)
        return (
            draft.site.templated(
                DiagnosticCode.E_ALTERNATIVE_UNKNOWN,
                change.node_id,
                alternative=change.value,
                folder=folder,
                alternatives=alternatives,
            ),
        )
