from collections.abc import Mapping
from typing import Final

from pydantic import BaseModel

from aqven.policies import EvalContext, NoParams, Verdict
from lumen.types import ReplyDraft

TAGS: Final = "tags"

STEP_MARKERS: Final[Mapping[str, tuple[str, ...]]] = {
    "smart_wifi": ("lumen app", "wi-fi"),
    "smart_zigbee": ("hub",),
    "rechargeable": ("charge",),
    "mains": ("switch", "socket"),
}


class PolishedReply(BaseModel):
    reply: ReplyDraft


class CaseTags(BaseModel):
    lamp_kind: str | None = None


def steps_match_lamp(value: BaseModel, context: EvalContext[BaseModel, BaseModel], params: NoParams) -> Verdict:
    text = PolishedReply.model_validate(value.model_dump(mode="json")).reply.text.lower()
    lamp_kind = CaseTags.model_validate(context.metadata.get(TAGS, {})).lamp_kind or ""
    matched = any(marker in text for marker in STEP_MARKERS.get(lamp_kind, ()))
    return Verdict(passed=matched, reason=None if matched else f"no steps for a {lamp_kind} lamp in the reply")
