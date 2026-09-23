from collections.abc import Callable, Mapping
from decimal import Decimal
from typing import Final

from aqven.engine.checking.model import (
    BINARY_JUDGE_THRESHOLD,
    RATIONALE_FIELD,
    SCORE_FIELD,
    CheckDefinition,
    CheckResult,
    CheckState,
    JudgeReply,
)
from aqven.policies import Verdict
from aqven.policies.paths import number, text
from aqven.runtime.address import RunId
from aqven.spec import MetricKind

PASSED_VALUE: Final = 1.0
FAILED_VALUE: Final = 0.0
NO_JUDGE_SCORE: Final = f"judge returned no numeric {SCORE_FIELD}"
NO_JUDGE_OUTPUT: Final = "judge returned no output"

type VerdictGrader = Callable[[CheckDefinition, Verdict], CheckResult]
type ScoreGrader = Callable[[CheckDefinition, float, str | None, Decimal, RunId | None], CheckResult]


def state_of(passed: bool) -> CheckState:
    return CheckState.PASSED if passed else CheckState.FAILED


def binary_value(passed: bool) -> float:
    return PASSED_VALUE if passed else FAILED_VALUE


def clears(score: float, threshold: float | None) -> bool:
    return threshold is None or score >= threshold


def below_threshold(score: float, threshold: float | None) -> str:
    return f"{SCORE_FIELD} {score} is below the threshold {threshold}"


def failure_reason(passed: bool, reason: str | None, score: float, threshold: float | None) -> str | None:
    if passed or reason is not None:
        return reason
    return below_threshold(score, threshold)


def error_result(
    check: CheckDefinition, reason: str, cost_usd: Decimal = Decimal(0), run_id: RunId | None = None
) -> CheckResult:
    return CheckResult(
        check_id=check.check_id,
        kind=check.kind,
        state=CheckState.ERROR,
        value=None,
        reason=reason,
        cost_usd=cost_usd,
        judge_run_id=run_id,
    )


def binary_verdict(check: CheckDefinition, verdict: Verdict) -> CheckResult:
    return CheckResult(
        check_id=check.check_id,
        kind=check.kind,
        state=state_of(verdict.passed),
        value=binary_value(verdict.passed),
        reason=verdict.reason,
    )


def scored_verdict(check: CheckDefinition, verdict: Verdict) -> CheckResult:
    score = verdict.score
    if score is None:
        return error_result(check, f"evaluator returned no score for a {check.kind.value} check")
    passed = clears(score, check.threshold)
    return CheckResult(
        check_id=check.check_id,
        kind=check.kind,
        state=state_of(passed),
        value=score,
        reason=verdict.reason,
    )


VERDICT_GRADERS: Final[Mapping[MetricKind, VerdictGrader]] = {
    MetricKind.BINARY: binary_verdict,
    MetricKind.CONTINUOUS: scored_verdict,
    MetricKind.ORDINAL: scored_verdict,
}


def verdict_result(check: CheckDefinition, verdict: Verdict) -> CheckResult:
    return VERDICT_GRADERS[check.kind](check, verdict)


def binary_judgement(
    check: CheckDefinition, score: float, rationale: str | None, cost_usd: Decimal, run_id: RunId | None
) -> CheckResult:
    bound = BINARY_JUDGE_THRESHOLD if check.threshold is None else check.threshold
    passed = score >= bound
    return CheckResult(
        check_id=check.check_id,
        kind=check.kind,
        state=state_of(passed),
        value=binary_value(passed),
        reason=failure_reason(passed, rationale, score, bound),
        cost_usd=cost_usd,
        judge_run_id=run_id,
    )


def scored_judgement(
    check: CheckDefinition, score: float, rationale: str | None, cost_usd: Decimal, run_id: RunId | None
) -> CheckResult:
    passed = clears(score, check.threshold)
    return CheckResult(
        check_id=check.check_id,
        kind=check.kind,
        state=state_of(passed),
        value=score,
        reason=failure_reason(passed, rationale, score, check.threshold),
        cost_usd=cost_usd,
        judge_run_id=run_id,
    )


JUDGE_GRADERS: Final[Mapping[MetricKind, ScoreGrader]] = {
    MetricKind.BINARY: binary_judgement,
    MetricKind.CONTINUOUS: scored_judgement,
    MetricKind.ORDINAL: scored_judgement,
}


def judge_result(check: CheckDefinition, reply: JudgeReply) -> CheckResult:
    if reply.error is not None:
        return error_result(check, reply.error, reply.cost_usd, reply.run_id)
    if reply.output is None:
        return error_result(check, NO_JUDGE_OUTPUT, reply.cost_usd, reply.run_id)
    score = number(reply.output.get(SCORE_FIELD))
    if score is None:
        return error_result(check, NO_JUDGE_SCORE, reply.cost_usd, reply.run_id)
    rationale = text(reply.output.get(RATIONALE_FIELD)) or None
    return JUDGE_GRADERS[check.kind](check, score, rationale, reply.cost_usd, reply.run_id)
