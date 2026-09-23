import inspect
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final, assert_never, get_type_hints

from pydantic import BaseModel, ValidationError

from aqven.engine.checking.judging import judge_result, verdict_result
from aqven.engine.checking.model import (
    CheckDefinition,
    CheckInvalid,
    CheckResult,
    CheckSubject,
    CodeFunctions,
    JudgeGateway,
    JudgeRequest,
)
from aqven.engine.llm.ports import CodeLoader
from aqven.ir import BuiltinEvaluator, CodeEvaluator, JudgeEvaluator
from aqven.ir.common import JsonParams
from aqven.policies import Slot, Verdict, builtin
from aqven.runtime.address import JsonObject

BUILTIN_LABEL: Final = "use: {use}"
LOAD_ERRORS: Final = (ImportError, AttributeError, ValueError)
SIGNATURE_ERRORS: Final = (NameError, TypeError, ValueError)


@dataclass(frozen=True, slots=True)
class LoaderFunctions:
    loader: CodeLoader

    def function(self, ref: str) -> object:
        return self.loader.load(ref)


def parameters(check_id: str, label: str, function: Callable[..., object], params: JsonParams) -> BaseModel:
    try:
        names = list(inspect.signature(function).parameters)
        hints = get_type_hints(function)
    except SIGNATURE_ERRORS as error:
        raise CheckInvalid(check_id, f"evaluator {label}: cannot read its signature: {error}") from error
    model = hints.get(names[-1]) if names else None
    if not isinstance(model, type) or not issubclass(model, BaseModel):
        raise CheckInvalid(check_id, f"evaluator {label}: the last parameter is not a parameters model")
    try:
        return model.model_validate(params)
    except ValidationError as error:
        raise CheckInvalid(check_id, f"evaluator {label}: with parameters are invalid: {error}") from error


async def evaluate(check_id: str, label: str, function: object, subject: CheckSubject, params: JsonParams) -> Verdict:
    if function is None or not callable(function):
        raise CheckInvalid(check_id, f"evaluator {label} is not found or is not a function")
    arguments = parameters(check_id, label, function, params)
    produced = function(subject.output, subject.context(), arguments)
    verdict = await produced if inspect.isawaitable(produced) else produced
    if not isinstance(verdict, Verdict):
        raise CheckInvalid(check_id, f"evaluator {label} did not return a Verdict")
    return verdict


@dataclass(frozen=True, slots=True)
class CheckExecutor:
    code: CodeFunctions
    judges: JudgeGateway

    async def run(self, check: CheckDefinition, subject: CheckSubject, judge_document: JsonObject) -> CheckResult:
        evaluator = check.evaluator
        match evaluator:
            case BuiltinEvaluator():
                label = BUILTIN_LABEL.format(use=evaluator.use)
                function = builtin(Slot.EVALUATOR, evaluator.use)
                return verdict_result(check, await evaluate(check.check_id, label, function, subject, evaluator.params))
            case CodeEvaluator():
                function = self._function(check.check_id, evaluator.run)
                return verdict_result(
                    check, await evaluate(check.check_id, evaluator.run, function, subject, evaluator.params)
                )
            case JudgeEvaluator():
                request = JudgeRequest(
                    check_id=check.check_id,
                    inference=evaluator.inference,
                    agent=evaluator.agent,
                    document=judge_document,
                )
                return judge_result(check, await self.judges.judge(request))
            case _:
                assert_never(evaluator)

    def _function(self, check_id: str, ref: str) -> object:
        try:
            return self.code.function(ref)
        except LOAD_ERRORS as error:
            raise CheckInvalid(check_id, f"evaluator {ref} cannot be loaded: {error}") from error
