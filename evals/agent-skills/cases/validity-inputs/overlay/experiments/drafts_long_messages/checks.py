from collections.abc import Mapping
from typing import Final

from pydantic import BaseModel

from aqven.policies import EvalContext, NoParams, Verdict
from lumen.types import CaseRequest, ReplyDraft

TAGS: Final = "tags"

REQUEST_WORDS: Final[Mapping[str, tuple[str, ...]]] = {
    "defect": ("warranty", "replace", "repair", "reset"),
    "delivery": ("parcel", "courier", "reship", "delivery"),
    "question": ("compatible", "works with", "steps", "you can"),
}


class CaseTags(BaseModel):
    intent: str | None = None


def answers_the_request(value: ReplyDraft, context: EvalContext[CaseRequest, ReplyDraft], params: NoParams) -> Verdict:
    intent = CaseTags.model_validate(context.metadata.get(TAGS, {})).intent or ""
    text = value.text.lower()
    answered = any(word in text for word in REQUEST_WORDS.get(intent, ()))
    return Verdict(passed=answered, reason=None if answered else f"the draft does not answer the {intent} request")
