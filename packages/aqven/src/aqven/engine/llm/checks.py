import inspect
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final, Protocol, assert_never, get_type_hints

from pydantic import BaseModel, ValidationError
from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.usage import RunUsage

from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.failures import CHECK_FAILED, MODEL_SCHEMA_MISMATCH, GuardFailure
from aqven.engine.llm.ports import CodeLoader
from aqven.ir import BuiltinEvaluator, CodeEvaluator, CompiledCheck, JudgeEvaluator
from aqven.ir.common import JsonParams
from aqven.policies import EvalContext, Slot, Verdict, builtin
from aqven.policies.paths import number, text
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import JsonObject, Problem
from aqven.runtime.executions import CheckOutcome
from aqven.spec import AgentId, InferenceId, OnFail

SCORE_FIELD: Final = "score"
RATIONALE_FIELD: Final = "rationale"
RETURN_HINT: Final = "return"
RETRY_SEPARATOR: Final = "\n"
ALLOWED_SET_VIOLATION: Final = "value_not_allowed"
ALLOWED_SET_ACTION: Final = "tighten the prompt or widen the allowed set"
CHECK_ACTION: Final = "tighten the prompt or relax check {check}"


class NestedInferences(Protocol):
    async def run(
        self,
        scope: ExecutionScope,
        agent_id: AgentId,
        inference_id: InferenceId,
        document: JsonObject,
        usage: RunUsage,
    ) -> JsonObject: ...


def _retry(outcome: CheckOutcome) -> None:
    if outcome.passed:
        return
    raise ModelRetry(f"check {outcome.check}: {outcome.feedback or 'not passed'}")


def _fail(outcome: CheckOutcome) -> None:
    if outcome.passed:
        return
    message = f"check {outcome.check} failed: {outcome.feedback or 'no reason given'}"
    raise LlmNodeError(LlmFailureCode.CHECK_FAILED, message)


def _flag(outcome: CheckOutcome) -> None:
    return


ON_FAIL: Final[Mapping[OnFail, Callable[[CheckOutcome], None]]] = {
    OnFail.RETRY: _retry,
    OnFail.FAIL: _fail,
    OnFail.FLAG: _flag,
}


def allowed_set_failure(violations: tuple[str, ...]) -> GuardFailure:
    problems = tuple(Problem(path=(), code=ALLOWED_SET_VIOLATION, message=violation) for violation in violations)
    return GuardFailure(
        code=MODEL_SCHEMA_MISMATCH,
        message=f"output has values outside the allowed sets: {'; '.join(violations)}",
        hint_action=ALLOWED_SET_ACTION,
        violations=problems,
    )


def check_failure(outcome: CheckOutcome) -> GuardFailure:
    return GuardFailure(
        code=CHECK_FAILED,
        message=f"check {outcome.check} rejected the output: {outcome.feedback or 'no reason given'}",
        hint_action=CHECK_ACTION.format(check=outcome.check),
    )


@dataclass(frozen=True, slots=True)
class OutputGuard:
    code: CodeLoader
    nested: NestedInferences

    async def __call__(self, ctx: RunContext[RunDeps], output: object) -> object:
        if not isinstance(output, BaseModel):
            return output
        deps = ctx.deps
        document = output.model_dump(mode="json", by_alias=True)
        attempt = deps.attempt(ctx.run_step)
        violations = deps.shaped.violations(document)
        if violations:
            deps.guard_failures[attempt] = allowed_set_failure(violations)
            raise ModelRetry(RETRY_SEPARATOR.join(violations))
        for check in deps.inference.checks:
            verdict = await self._verdict(check, output, document, ctx)
            outcome = CheckOutcome(
                check=check.name, on_fail=check.on_fail, passed=verdict.passed, feedback=verdict.reason, attempt=attempt
            )
            deps.checks.append(outcome)
            if not outcome.passed:
                deps.guard_failures[attempt] = check_failure(outcome)
            ON_FAIL[check.on_fail](outcome)
        return output

    async def _verdict(
        self, check: CompiledCheck, output: BaseModel, document: JsonObject, ctx: RunContext[RunDeps]
    ) -> Verdict:
        evaluator = check.evaluator
        context = EvalContext[BaseModel, BaseModel](inputs=ctx.deps.inputs, attempt=ctx.deps.attempt(ctx.run_step))
        match evaluator:
            case BuiltinEvaluator():
                function = builtin(Slot.EVALUATOR, evaluator.use)
                return await _evaluate(f"use: {evaluator.use}", function, output, context, evaluator.params)
            case CodeEvaluator():
                function = self.code.load(evaluator.run)
                return await _evaluate(evaluator.run, function, output, context, evaluator.params)
            case JudgeEvaluator():
                return await self._judge(check, evaluator, document, ctx)
            case _:
                assert_never(evaluator)

    async def _judge(
        self, check: CompiledCheck, evaluator: JudgeEvaluator, document: JsonObject, ctx: RunContext[RunDeps]
    ) -> Verdict:
        deps = ctx.deps
        judge = deps.scope.project.inference(evaluator.inference)
        known = {**deps.document, **document}
        inputs = {field.name: known.get(field.name) for field in judge.input_fields}
        verdict = await self.nested.run(deps.scope, evaluator.agent, evaluator.inference, inputs, ctx.usage)
        score = number(verdict.get(SCORE_FIELD))
        if score is None:
            return Verdict(passed=False, reason=f"judge {evaluator.inference} returned no numeric {SCORE_FIELD}")
        passed = check.threshold is None or score >= check.threshold
        reason = text(verdict.get(RATIONALE_FIELD)) or f"{SCORE_FIELD} {score} is below the threshold {check.threshold}"
        return Verdict(passed=passed, score=score, reason=None if passed else reason)


async def _evaluate(
    label: str,
    function: object,
    output: BaseModel,
    context: EvalContext[BaseModel, BaseModel],
    params: JsonParams,
) -> Verdict:
    if function is None or not callable(function):
        raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"evaluator {label} is not found or is not a function")
    arguments = _params(label, function, params)
    result = function(output, context, arguments)
    verdict = await result if inspect.isawaitable(result) else result
    if not isinstance(verdict, Verdict):
        raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"evaluator {label} did not return a Verdict")
    return verdict


def _params(label: str, function: Callable[..., object], params: JsonParams) -> BaseModel:
    names = list(inspect.signature(function).parameters)
    hints = get_type_hints(function)
    model = hints.get(names[-1]) if names else None
    if not isinstance(model, type) or not issubclass(model, BaseModel):
        raise LlmNodeError(
            LlmFailureCode.CODE_INVALID, f"evaluator {label}: the last parameter is not a parameters model"
        )
    try:
        return model.model_validate(params)
    except ValidationError as error:
        raise LlmNodeError(
            LlmFailureCode.CODE_INVALID, f"evaluator {label}: with parameters are invalid: {error}"
        ) from error
