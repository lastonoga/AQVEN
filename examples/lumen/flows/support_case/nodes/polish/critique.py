from collections.abc import Callable, Iterable
from typing import Final

from aqven.policies import EvalContext, NoParams, Verdict
from lumen.types import CritiqueIn, CritiqueOut

type CritiqueRule = Callable[[CritiqueOut], str | None]

APPROVAL_SCORE: Final = 0.85
REJECTION_SCORE: Final = 0.5


def critique_consistent(value: CritiqueOut, context: EvalContext[CritiqueIn, CritiqueOut], params: NoParams) -> Verdict:
    return _verdict(rule(value) for rule in CRITIQUE_RULES)


def _verdict(reasons: Iterable[str | None]) -> Verdict:
    reason = next((item for item in reasons if item is not None), None)
    return Verdict(passed=reason is None, reason=reason)


def _approved_with_blockers(critique: CritiqueOut) -> str | None:
    if critique.score < APPROVAL_SCORE or not critique.blocking:
        return None
    return "A high score with blocking remarks: lower the score, or drop the remarks that do not block sending."


def _rejected_without_blockers(critique: CritiqueOut) -> str | None:
    if critique.score >= REJECTION_SCORE or critique.blocking:
        return None
    return "A low score with no blocking remarks: name what stops it being sent, or raise the score."


CRITIQUE_RULES: Final[tuple[CritiqueRule, ...]] = (_approved_with_blockers, _rejected_without_blockers)
