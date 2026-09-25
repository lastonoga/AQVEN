from collections import Counter
from typing import Annotated

from pydantic import Field
from skill_snippets.types import Decision, ListingReviewTallyOut


def tally(votes: Annotated[list[Decision], Field(max_length=3)]) -> ListingReviewTallyOut:
    if not votes:
        return ListingReviewTallyOut(decision="fix")
    decision, count = Counter(votes).most_common(1)[0]
    if count * 2 <= len(votes):
        return ListingReviewTallyOut(decision="fix")
    return ListingReviewTallyOut(decision=decision)
