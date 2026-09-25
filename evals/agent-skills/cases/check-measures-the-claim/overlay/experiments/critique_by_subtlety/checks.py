from typing import Final

from aqven.policies import EvalContext, NoParams, Verdict
from lumen.types import Critique, ReplyReview

APPROVAL_SCORE: Final = 0.85


def caught(value: Critique, context: EvalContext[ReplyReview, Critique], params: NoParams) -> Verdict:
    flagged = value.score < APPROVAL_SCORE or bool(value.blocking)
    return Verdict(passed=flagged, reason=None if flagged else "the critic raised nothing")
