from collections.abc import Mapping
from typing import Final

from pydantic import BaseModel

from aqven.spec import GENERATED_CONFIG
from lumen.flows.support_case.nodes.polish.critique import APPROVAL_SCORE
from lumen.types import Critique, ReplyVerdict

VERDICTS: Final[Mapping[bool, ReplyVerdict]] = {True: "send", False: "block"}


class CritiqueOnlyVerdictOut(BaseModel):
    model_config = GENERATED_CONFIG
    verdict: ReplyVerdict


def verdict(critique: Critique) -> CritiqueOnlyVerdictOut:
    sendable = critique.score >= APPROVAL_SCORE and not critique.blocking
    return CritiqueOnlyVerdictOut(verdict=VERDICTS[sendable])
