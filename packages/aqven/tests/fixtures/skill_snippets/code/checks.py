from skill_snippets.types import Listing, Review

from aqven.policies import EvalContext, NoParams, Verdict


def every_aspect_read(value: Review, context: EvalContext[Listing, Review], params: NoParams) -> Verdict:
    unread = [item.message for item in value.unread]
    reason = f"{len(unread)} aspects were not read: {'; '.join(unread)}"
    return Verdict(passed=not unread, reason=None if not unread else reason)
