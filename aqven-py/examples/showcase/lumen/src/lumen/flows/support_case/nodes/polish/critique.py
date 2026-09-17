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
    return "Высокая оценка при блокирующих замечаниях: снизь оценку или убери замечания, которые не блокируют отправку."


def _rejected_without_blockers(critique: CritiqueOut) -> str | None:
    if critique.score >= REJECTION_SCORE or critique.blocking:
        return None
    return "Низкая оценка без блокирующих замечаний: назови, что мешает отправке, или повысь оценку."


CRITIQUE_RULES: Final[tuple[CritiqueRule, ...]] = (_approved_with_blockers, _rejected_without_blockers)
