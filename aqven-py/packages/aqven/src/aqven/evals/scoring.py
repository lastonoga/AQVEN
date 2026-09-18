import inspect
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Protocol, assert_never, get_type_hints

from pydantic import BaseModel, JsonValue, ValidationError

from aqven.engine.loading import CodeLoader
from aqven.evals.plan import CompiledScorer
from aqven.evals.records import ScoreRecord
from aqven.ir import BuiltinEvaluator, CodeEvaluator, JudgeEvaluator
from aqven.ir.common import JsonParams
from aqven.policies import EvalContext, Slot, Verdict, builtin
from aqven.policies.paths import number, text
from aqven.runtime.address import JsonObject
from aqven.spec import MetricKind

SCORE_FIELD: Final = "score"
RATIONALE_FIELD: Final = "rationale"
PASSED: Final = 1.0
FAILED: Final = 0.0


class ScorerFailed(Exception):
    def __init__(self, scorer_id: str, reason: str) -> None:
        super().__init__(f"scorer {scorer_id}: {reason}")
        self.scorer_id = scorer_id
        self.reason = reason


@dataclass(frozen=True, slots=True)
class JudgeVerdict:
    output: JsonObject
    cost_usd: Decimal
    error: str | None = None


class JudgeGateway(Protocol):
    async def judge(self, scorer_id: str, document: JsonObject) -> JudgeVerdict: ...


@dataclass(frozen=True, slots=True)
class ScoredCase:
    inputs: BaseModel
    output: BaseModel
    inputs_document: JsonObject
    output_document: JsonObject
    expected_output: JsonValue = None
    metadata: Mapping[str, JsonValue] | None = None
    cost_usd: float = 0.0
    latency_ms: int = 0

    def context(self) -> EvalContext[BaseModel, BaseModel]:
        return EvalContext[BaseModel, BaseModel](
            inputs=self.inputs,
            metadata=dict(self.metadata or {}),
            cost_usd=self.cost_usd,
            latency_ms=self.latency_ms,
        )


def value_of(kind: MetricKind, verdict: Verdict) -> float:
    if kind is MetricKind.BINARY or verdict.score is None:
        return PASSED if verdict.passed else FAILED
    return verdict.score


def parameters(scorer_id: str, function: Callable[..., object], params: JsonParams) -> BaseModel:
    names = list(inspect.signature(function).parameters)
    hints = get_type_hints(function)
    model = hints.get(names[-1]) if names else None
    if not isinstance(model, type) or not issubclass(model, BaseModel):
        raise ScorerFailed(scorer_id, "the last parameter of the evaluator is not a parameters model")
    try:
        return model.model_validate(params)
    except ValidationError as error:
        raise ScorerFailed(scorer_id, f"with parameters are invalid: {error}") from error


async def call_evaluator(scorer_id: str, function: object, case: ScoredCase, params: JsonParams) -> Verdict:
    if function is None or not callable(function):
        raise ScorerFailed(scorer_id, "evaluator is not found or is not a function")
    typed: Callable[..., object] = function
    arguments = parameters(scorer_id, typed, params)
    produced = typed(case.output, case.context(), arguments)
    verdict = await produced if inspect.isawaitable(produced) else produced
    if not isinstance(verdict, Verdict):
        raise ScorerFailed(scorer_id, "evaluator did not return a Verdict")
    return verdict


@dataclass(frozen=True, slots=True)
class ScorerEngine:
    loader: CodeLoader
    judges: JudgeGateway

    async def score(self, scorer: CompiledScorer, case: ScoredCase) -> ScoreRecord:
        evaluator = scorer.evaluator
        match evaluator:
            case BuiltinEvaluator():
                function = builtin(Slot.EVALUATOR, evaluator.use)
                verdict = await call_evaluator(scorer.scorer_id, function, case, evaluator.params)
                return self._record(scorer, verdict)
            case CodeEvaluator():
                function = self.loader.function(evaluator.run)
                verdict = await call_evaluator(scorer.scorer_id, function, case, evaluator.params)
                return self._record(scorer, verdict)
            case JudgeEvaluator():
                return await self._judged(scorer, case)
            case _:
                assert_never(evaluator)

    def _record(self, scorer: CompiledScorer, verdict: Verdict, cost: Decimal = Decimal(0)) -> ScoreRecord:
        return ScoreRecord(
            scorer_id=scorer.scorer_id,
            kind=scorer.kind,
            value=value_of(scorer.kind, verdict),
            passed=verdict.passed,
            reason=verdict.reason,
            cost_usd=cost,
        )

    async def _judged(self, scorer: CompiledScorer, case: ScoredCase) -> ScoreRecord:
        verdict = await self.judges.judge(scorer.scorer_id, {**case.inputs_document, **case.output_document})
        if verdict.error is not None:
            raise ScorerFailed(scorer.scorer_id, verdict.error)
        score = number(verdict.output.get(SCORE_FIELD))
        if score is None:
            raise ScorerFailed(scorer.scorer_id, f"judge returned no numeric {SCORE_FIELD}")
        rationale = text(verdict.output.get(RATIONALE_FIELD)) or None
        return self._record(scorer, Verdict(passed=True, score=score, reason=rationale), verdict.cost_usd)
