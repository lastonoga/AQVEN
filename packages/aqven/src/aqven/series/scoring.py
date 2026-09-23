from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final

from pydantic import BaseModel, JsonValue, TypeAdapter, ValidationError

from aqven.engine.checking import (
    CheckDefinition,
    CheckExecutor,
    CheckResult,
    CheckState,
    CheckSubject,
    CodeFunctions,
    JsonRecord,
    JudgeReply,
    JudgeRequest,
)
from aqven.engine.errors import CodeLoadError
from aqven.ir import CompiledEvaluator
from aqven.runtime.address import JsonObject, RunId
from aqven.series.model import (
    COUNTED_OUTCOMES,
    CaseSnapshot,
    CheckPlan,
    CheckValue,
    JudgePlan,
    OutcomeClass,
    RecordModel,
    VariantPlanRecord,
)
from aqven.series.subjects import TypeSource
from aqven.spec import MetricKind, NodeId, TypeId

EXPECTED_FIELD: Final = "expected_output"
WRAPPED_VALUE: Final = "value"
JUDGE_MISSING: Final = "the judge did not run for this attempt"
NO_OUTPUT: Final = "the run produced no output: {code}"
EVALUATOR: Final[TypeAdapter[CompiledEvaluator]] = TypeAdapter(CompiledEvaluator)
ZERO: Final = Decimal(0)

type SkipRule = Callable[[CheckPlan, str], CheckValue | None]


class JudgeReplyRecord(RecordModel):
    output: JsonObject | None = None
    cost_usd: Decimal = ZERO
    run_id: RunId | None = None
    error: str | None = None

    def reply(self) -> JudgeReply:
        return JudgeReply(output=self.output, cost_usd=self.cost_usd, run_id=self.run_id, error=self.error)


@dataclass(frozen=True, slots=True)
class PrecomputedJudges:
    replies: Mapping[str, JudgeReply]

    async def judge(self, request: JudgeRequest) -> JudgeReply:
        return self.replies.get(request.check_id, JudgeReply(output=None, error=JUDGE_MISSING))


def merged_scope(documents: Sequence[JsonObject]) -> JsonObject:
    merged: JsonObject = {}
    for document in documents:
        merged.update(document)
    return merged


def judge_input(judge: JudgePlan, documents: Sequence[JsonObject], case: CaseSnapshot) -> JsonObject:
    expected: JsonObject = {EXPECTED_FIELD: case.expected_output} if EXPECTED_FIELD in judge.input_fields else {}
    scope = {**merged_scope(documents), **expected}
    return {name: scope.get(name) for name in judge.input_fields}


def judge_inputs(
    checks: Sequence[CheckPlan], documents: Sequence[JsonObject], case: CaseSnapshot
) -> dict[str, JsonObject]:
    return {
        check.check_id: judge_input(check.judge, documents, case)
        for check in checks
        if check.judge is not None and not skipped_for_expectation(check, case)
    }


def json_record(value: JsonValue) -> JsonRecord:
    document: JsonObject = value if isinstance(value, dict) else {WRAPPED_VALUE: value}
    return JsonRecord.model_validate(document)


def record_model(types: TypeSource, package: str, type_ref: TypeId) -> type[BaseModel] | None:
    try:
        annotation = types.type_annotation(package, type_ref)
    except CodeLoadError:
        return None
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation
    return None


def typed_record(types: TypeSource, package: str, type_ref: TypeId | None, value: JsonValue) -> BaseModel:
    model = None if type_ref is None else record_model(types, package, type_ref)
    if model is None:
        return json_record(value)
    try:
        return model.model_validate(value)
    except ValidationError:
        return json_record(value)


def check_value(result: CheckResult) -> CheckValue:
    return CheckValue(
        check_id=result.check_id,
        kind=result.kind,
        state=result.state,
        value=result.value,
        reason=result.reason,
        cost_usd=result.cost_usd,
        judge_run_id=result.judge_run_id,
    )


def skipped(check: CheckPlan, reason: str | None = None) -> CheckValue:
    return CheckValue(check_id=check.check_id, kind=check.kind, state=CheckState.SKIPPED, value=None, reason=reason)


def failed_without_output(check: CheckPlan, code: str) -> CheckValue:
    if check.kind is not MetricKind.BINARY:
        return skipped(check)
    reason = NO_OUTPUT.format(code=code)
    return CheckValue(check_id=check.check_id, kind=check.kind, state=CheckState.FAILED, value=0.0, reason=reason)


def run_it(check: CheckPlan, code: str) -> CheckValue | None:
    return None


def skip_all(check: CheckPlan, code: str) -> CheckValue | None:
    return skipped(check)


SKIP_RULES: Final[Mapping[OutcomeClass, SkipRule]] = {
    OutcomeClass.OK: run_it,
    OutcomeClass.MODEL_FAIL: failed_without_output,
    OutcomeClass.SCHEMA_INVALID: failed_without_output,
    OutcomeClass.REFUSAL: failed_without_output,
    OutcomeClass.INFRA_ERROR: skip_all,
    OutcomeClass.BUDGET_CUT: skip_all,
    OutcomeClass.CANCELLED: skip_all,
}


def skipped_for_expectation(check: CheckPlan, case: CaseSnapshot) -> bool:
    return check.only_with_expected and case.expected_output is None


def definition_of(check: CheckPlan) -> CheckDefinition:
    return CheckDefinition(
        check_id=check.check_id,
        kind=check.kind,
        evaluator=EVALUATOR.validate_python(check.evaluator),
        threshold=check.threshold,
    )


@dataclass(frozen=True, slots=True)
class AttemptScoring:
    checks: tuple[CheckPlan, ...]
    case: CaseSnapshot
    variant: VariantPlanRecord
    repeat: int
    outcome: OutcomeClass
    error_code: str
    subject_input: JsonValue
    subject_output: JsonValue
    documents: tuple[JsonObject, ...]
    top_outputs: Mapping[NodeId, JsonValue]
    cost_usd: Decimal
    latency_ms: int | None
    package: str
    input_type: TypeId | None

    def metadata(self) -> dict[str, JsonValue]:
        node_outputs: JsonObject = {**self.case.node_outputs, **self.top_outputs}
        tags: JsonObject = dict(self.case.tags)
        return {
            "case": self.case.name,
            "tags": tags,
            "split": self.case.split.value,
            "variant": self.variant.variant_id,
            "repeat": self.repeat,
            "node_outputs": node_outputs,
        }

    def subject(self, types: TypeSource) -> CheckSubject:
        return CheckSubject(
            output=typed_record(types, self.package, self.variant.output_type, self.subject_output),
            inputs=typed_record(types, self.package, self.input_type, self.subject_input),
            expected_output=self.case.expected_output,
            metadata=self.metadata(),
            cost_usd=float(self.cost_usd),
            latency_ms=self.latency_ms or 0,
        )


@dataclass(frozen=True, slots=True)
class AttemptScorer:
    types: TypeSource
    code: CodeFunctions

    async def score(self, scoring: AttemptScoring, replies: Mapping[str, JudgeReply]) -> tuple[CheckValue, ...]:
        executor = CheckExecutor(code=self.code, judges=PrecomputedJudges(replies))
        subject = scoring.subject(self.types)
        document = merged_scope(scoring.documents)
        return tuple([await self._one(executor, check, scoring, subject, document) for check in scoring.checks])

    async def _one(
        self,
        executor: CheckExecutor,
        check: CheckPlan,
        scoring: AttemptScoring,
        subject: CheckSubject,
        document: JsonObject,
    ) -> CheckValue:
        ruled = SKIP_RULES[scoring.outcome](check, scoring.error_code)
        if ruled is not None:
            return ruled
        if skipped_for_expectation(check, scoring.case):
            return skipped(check, EXPECTED_FIELD)
        return check_value(await executor.run(definition_of(check), subject, document))


def attempt_passed(outcome: OutcomeClass, checks: Sequence[CheckValue]) -> bool | None:
    if outcome not in COUNTED_OUTCOMES:
        return None
    if outcome is not OutcomeClass.OK:
        return False
    binary = (check for check in checks if check.kind is MetricKind.BINARY and check.state is not CheckState.SKIPPED)
    return all(check.state is CheckState.PASSED for check in binary)


def check_cost(checks: Sequence[CheckValue]) -> Decimal:
    return sum((check.cost_usd for check in checks), ZERO)
