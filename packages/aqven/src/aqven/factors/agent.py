from dataclasses import dataclass, replace

from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.factors.draft import VariantDraft
from aqven.factors.model import FactorChange
from aqven.loader import SourceSpec
from aqven.spec import AgentId, LlmNodeSpec, NodeSpec


@dataclass(frozen=True, slots=True)
class AgentFactor:
    def apply(self, draft: VariantDraft, change: FactorChange, slot: SourceSpec[NodeSpec]) -> tuple[Diagnostic, ...]:
        spec = slot.spec
        if not isinstance(spec, LlmNodeSpec):
            return (draft.wrong_kind(change, spec),)
        if not draft.known(draft.project.agents, change.value):
            message = f"agent {change.value} for {change.node_id} does not exist in the project"
            return (draft.site.problem(DiagnosticCode.E_AGENT_UNKNOWN, change.node_id, message),)
        draft.put(change.node_id, replace(slot, spec=spec.model_copy(update={"agent": AgentId(change.value)})))
        return ()
