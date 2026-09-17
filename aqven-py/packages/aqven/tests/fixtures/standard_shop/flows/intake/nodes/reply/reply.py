from standard_shop.types import ReplyIn, ReplyOut

from aqven.policies import EvalContext, NoParams, Verdict


def reply_is_short(value: ReplyOut, context: EvalContext[ReplyIn, ReplyOut], params: NoParams) -> Verdict:
    return Verdict(passed=len(value.text) <= len(context.inputs.text) + 100)
