from aqven.policies import EvalContext, NoParams, Verdict
from lumen.types import PanelOutcome, PanelRequest


def settled_by_panel(
    value: PanelOutcome, context: EvalContext[PanelRequest, PanelOutcome], params: NoParams
) -> Verdict:
    settled = not value.verdict.tie_broken
    reason = "the panel judges did not settle the winner, the tie-break judge did"
    return Verdict(passed=settled, reason=None if settled else reason)
