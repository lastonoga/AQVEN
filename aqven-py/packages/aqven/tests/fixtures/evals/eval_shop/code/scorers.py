from eval_shop.types import ReplyIn, ReplyOut
from pydantic import BaseModel

from aqven.policies import EvalContext, Verdict

WORD_LIMIT = 12


class Params(BaseModel):
    limit: int = WORD_LIMIT


def answer_is_short(value: ReplyOut, context: EvalContext[ReplyIn, ReplyOut], params: Params) -> Verdict:
    words = len(value.answer.split())
    return Verdict(passed=words <= params.limit, reason=f"answer has {words} words")
