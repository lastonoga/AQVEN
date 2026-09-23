from aqven.policies import EvalContext, NoParams, Verdict
from lumen.flows.support_case.nodes.polish.critique import APPROVAL_SCORE
from lumen.types import Critique, ReplyReview


def blocked(value: Critique, context: EvalContext[ReplyReview, Critique], params: NoParams) -> Verdict:
    stopped = value.score < APPROVAL_SCORE or bool(value.blocking)
    reason = f"the critic lets the reply through: score {value.score:.2f} and no blocking remark"
    return Verdict(passed=stopped, reason=None if stopped else reason)
