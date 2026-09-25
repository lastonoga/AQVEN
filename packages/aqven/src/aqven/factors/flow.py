from collections.abc import Iterator
from dataclasses import dataclass, replace
from typing import Final

from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.factors.draft import VariantDraft
from aqven.factors.model import FactorChange
from aqven.loader import LoadedFlow, SourceSpec
from aqven.spec import CallNodeSpec, FlowId, NodeSpec

SIDES: Final = ("input", "output")


@dataclass(frozen=True, slots=True)
class FlowFactor:
    def apply(self, draft: VariantDraft, change: FactorChange, slot: SourceSpec[NodeSpec]) -> tuple[Diagnostic, ...]:
        spec = slot.spec
        if not isinstance(spec, CallNodeSpec):
            return (draft.wrong_kind(change, spec),)
        target = draft.flow(FlowId(change.value))
        if target is None:
            return _unknown(draft, change)
        problems = tuple(_contract(draft, change, draft.flow(spec.flow), target))
        if problems:
            return problems
        draft.put(change.node_id, replace(slot, spec=spec.model_copy(update={"flow": target.flow_id})))
        return ()


def _unknown(draft: VariantDraft, change: FactorChange) -> tuple[Diagnostic, ...]:
    if change.value in draft.project.broken_ids:
        return ()
    message = (
        f"flow {change.value} for {change.node_id} is neither a flow of {draft.experiment.folder}/flows "
        "nor a flow of the project"
    )
    return (draft.site.problem(DiagnosticCode.E_FLOW_UNKNOWN, change.node_id, message),)


def _contract(
    draft: VariantDraft, change: FactorChange, original: LoadedFlow | None, target: LoadedFlow
) -> Iterator[Diagnostic]:
    written = original.source if original is not None else None
    swapped = target.source
    if original is None or written is None or swapped is None:
        return
    sides = zip(
        SIDES, (swapped.spec.input, swapped.spec.output), (written.spec.input, written.spec.output), strict=True
    )
    for side, own, expected in sides:
        if own == expected:
            continue
        values = {"flow": target.flow_id, "side": side, "own": own, "expected": expected, "original": original.flow_id}
        yield draft.site.templated(DiagnosticCode.E_FACTOR_FLOW_CONTRACT, change.node_id, **values)
