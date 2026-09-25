from collections import Counter
from typing import Annotated

from pydantic import Field
from skill_snippets.types import Decision, TallyRuleAnyRejectOut


def any_reject(votes: Annotated[list[Decision], Field(max_length=3)]) -> TallyRuleAnyRejectOut:
    if "reject" in votes:
        return TallyRuleAnyRejectOut(decision="reject")
    if not votes:
        return TallyRuleAnyRejectOut(decision="fix")
    decision, count = Counter(votes).most_common(1)[0]
    if count * 2 <= len(votes):
        return TallyRuleAnyRejectOut(decision="fix")
    return TallyRuleAnyRejectOut(decision=decision)
