from dataclasses import dataclass, replace

from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.factors.draft import NONE, VariantDraft
from aqven.factors.model import FactorChange
from aqven.loader import SourceSpec, experiment_prompt_file
from aqven.spec import LlmNodeSpec, NodeSpec


@dataclass(frozen=True, slots=True)
class PromptFactor:
    def apply(self, draft: VariantDraft, change: FactorChange, slot: SourceSpec[NodeSpec]) -> tuple[Diagnostic, ...]:
        spec = slot.spec
        if not isinstance(spec, LlmNodeSpec):
            return (draft.wrong_kind(change, spec),)
        prompt = draft.experiment.prompts.get(change.value)
        if prompt is None:
            return (_missing(draft, change),)
        origin = draft.project.inferences.get(spec.inference) if spec.inference is not None else None
        source = origin.source if origin is not None else None
        if origin is None or source is None:
            return ()
        derived = draft.derive(origin, source, prompt)
        draft.put(change.node_id, replace(slot, spec=spec.model_copy(update={"inference": derived.inference_id})))
        return ()


def _missing(draft: VariantDraft, change: FactorChange) -> Diagnostic:
    file = experiment_prompt_file(draft.experiment.folder, change.value)
    prompts = ", ".join(sorted(draft.experiment.prompts)) or NONE
    message = f"prompt {change.value} for {change.node_id} has no file {file}; prompts of the experiment: {prompts}"
    return draft.site.problem(DiagnosticCode.E_PROMPT_MISSING, change.node_id, message)
