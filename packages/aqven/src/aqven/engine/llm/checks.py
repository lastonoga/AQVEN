from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final, Protocol, assert_never

from pydantic import BaseModel
from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.usage import RunUsage

from aqven.engine.checking import (
    CheckDefinition,
    CheckExecutor,
    CheckInvalid,
    CheckResult,
    CheckSubject,
    JudgeReply,
    JudgeRequest,
    LoaderFunctions,
)
from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.failures import CHECK_FAILED, MODEL_SCHEMA_MISMATCH, GuardFailure
from aqven.engine.llm.ports import CodeLoader
from aqven.ir import BuiltinEvaluator, CodeEvaluator, CompiledCheck, CompiledEvaluator, JudgeEvaluator
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import JsonObject, Problem
from aqven.runtime.executions import CheckOutcome
from aqven.spec import AgentId, InferenceId, MetricKind, OnFail

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


def runtime_definition(check: CompiledCheck) -> CheckDefinition:
    evaluator = check.evaluator
    match evaluator:
        case BuiltinEvaluator() | CodeEvaluator():
            return CheckDefinition(check_id=check.name, kind=MetricKind.BINARY, evaluator=evaluator)
        case JudgeEvaluator():
            return CheckDefinition(
                check_id=check.name, kind=MetricKind.CONTINUOUS, evaluator=evaluator, threshold=check.threshold
            )
        case _:
            assert_never(evaluator)


def runtime_feedback(evaluator: CompiledEvaluator, result: CheckResult) -> str | None:
    if result.passed and isinstance(evaluator, JudgeEvaluator):
        return None
    return result.reason


@dataclass(frozen=True, slots=True)
class NestedJudges:
    nested: NestedInferences
    scope: ExecutionScope
    usage: RunUsage

    async def judge(self, request: JudgeRequest) -> JudgeReply:
        judge = self.scope.project.inference(request.inference)
        inputs = {field.name: request.document.get(field.name) for field in judge.input_fields}
        verdict = await self.nested.run(self.scope, request.agent, request.inference, inputs, self.usage)
        return JudgeReply(output=verdict)


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
        executor = CheckExecutor(
            code=LoaderFunctions(self.code), judges=NestedJudges(self.nested, deps.scope, ctx.usage)
        )
        subject = CheckSubject(output=output, inputs=deps.inputs, attempt=attempt)
        judge_document = {**deps.document, **document}
        for check in deps.inference.checks:
            result = await _checked(executor, runtime_definition(check), subject, judge_document)
            outcome = CheckOutcome(
                check=check.name,
                on_fail=check.on_fail,
                passed=result.passed,
                feedback=runtime_feedback(check.evaluator, result),
                attempt=attempt,
            )
            deps.checks.append(outcome)
            if not outcome.passed:
                deps.guard_failures[attempt] = check_failure(outcome)
            ON_FAIL[check.on_fail](outcome)
        return output


async def _checked(
    executor: CheckExecutor, check: CheckDefinition, subject: CheckSubject, judge_document: JsonObject
) -> CheckResult:
    try:
        return await executor.run(check, subject, judge_document)
    except CheckInvalid as error:
        raise LlmNodeError(LlmFailureCode.CODE_INVALID, error.reason) from error
