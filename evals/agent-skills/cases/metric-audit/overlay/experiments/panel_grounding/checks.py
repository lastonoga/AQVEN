from aqven.policies import EvalContext, NoParams, Verdict
from lumen.types import PanelOutcome, PanelRequest


def winner_grounded(value: PanelOutcome, context: EvalContext[PanelRequest, PanelOutcome], params: NoParams) -> Verdict:
    sources = " ".join(chunk.text for chunk in context.inputs.chunks)
    grounded = all(citation.quote in sources for citation in value.winner.citations)
    reason = "the winner quotes text that none of the case chunks contains"
    return Verdict(passed=grounded, reason=None if grounded else reason)
