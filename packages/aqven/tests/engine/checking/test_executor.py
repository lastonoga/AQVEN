from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from pydantic import BaseModel, JsonValue

from aqven.engine.checking import (
    BINARY_JUDGE_THRESHOLD,
    CheckDefinition,
    CheckExecutor,
    CheckInvalid,
    CheckResult,
    CheckState,
    CheckSubject,
    CodeFunctions,
    JsonRecord,
    JudgeReply,
    JudgeRequest,
    LoaderFunctions,
    judge_result,
)
from aqven.engine.llm import ImportCodeLoader
from aqven.engine.loading import CodeLoader
from aqven.ir import BuiltinEvaluator, CodeEvaluator, CompiledEvaluator, JudgeEvaluator
from aqven.policies import EvalContext, NoParams, Verdict
from aqven.runtime.address import JsonObject, RunId
from aqven.spec import AgentId, CodeRef, InferenceId, MetricKind

JUDGE: Final = JudgeEvaluator(inference=InferenceId("critique"), agent=AgentId("deepseek"))
JUDGE_RUN: Final = RunId("27aeab8a-fc87-58aa-a099-4f6c09cc394e")
JUDGE_COST: Final = Decimal("0.0021")
DOCUMENT: Final[JsonObject] = {"reply": "We will replace the lamp.", "resolution": "replace"}
SCORED: Final = CodeRef("checks.scored:quality")
SCORELESS: Final = CodeRef("checks.scored:scoreless")
NOT_A_VERDICT: Final = CodeRef("checks.scored:not_a_verdict")
ASYNC_CHECK: Final = CodeRef("checks.scored:awaited")
METADATA_CHECK: Final = CodeRef("checks.scored:sees_metadata")


class Reply(BaseModel):
    text: str
    tone: str


class Ask(BaseModel):
    question: str


class ScoreParams(BaseModel):
    floor: float = 0.0


def quality(value: Reply, context: EvalContext[Ask, Reply], params: ScoreParams) -> Verdict:
    return Verdict(passed=True, score=max(params.floor, len(value.text) / 100))


def scoreless(value: Reply, context: EvalContext[Ask, Reply], params: NoParams) -> Verdict:
    return Verdict(passed=True)


def not_a_verdict(value: Reply, context: EvalContext[Ask, Reply], params: NoParams) -> bool:
    return True


async def awaited(value: Reply, context: EvalContext[Ask, Reply], params: NoParams) -> Verdict:
    return Verdict(passed=value.tone == "calm", reason="the tone is not calm")


def sees_metadata(value: Reply, context: EvalContext[Ask, JsonValue], params: NoParams) -> Verdict:
    seen = (context.metadata.get("case"), context.attempt, context.cost_usd, context.latency_ms, context.inputs)
    return Verdict(passed=seen == ("lamp", 2, 0.25, 900, Ask(question="Why?")))


@dataclass(frozen=True, slots=True)
class TableFunctions:
    functions: Mapping[str, object]

    def function(self, ref: str) -> object:
        found = self.functions.get(ref)
        if found is None:
            raise ImportError(f"no function {ref}")
        return found


@dataclass(slots=True)
class ScriptedJudges:
    reply: JudgeReply
    requests: list[JudgeRequest] = field(default_factory=list[JudgeRequest])

    async def judge(self, request: JudgeRequest) -> JudgeReply:
        self.requests.append(request)
        return self.reply


CODE: Final = TableFunctions(
    {
        SCORED: quality,
        SCORELESS: scoreless,
        NOT_A_VERDICT: not_a_verdict,
        ASYNC_CHECK: awaited,
        METADATA_CHECK: sees_metadata,
    }
)


def subject(expected: JsonValue = None, tone: str = "calm") -> CheckSubject:
    return CheckSubject(
        output=Reply(text="We will replace the lamp.", tone=tone),
        inputs=Ask(question="Why?"),
        expected_output=expected,
        metadata={"case": "lamp"},
        attempt=2,
        cost_usd=0.25,
        latency_ms=900,
    )


def definition(
    evaluator: CompiledEvaluator, kind: MetricKind = MetricKind.BINARY, threshold: float | None = None
) -> CheckDefinition:
    return CheckDefinition(check_id="quality", kind=kind, evaluator=evaluator, threshold=threshold)


def judge_reply(output: JsonObject | None, error: str | None = None) -> JudgeReply:
    return JudgeReply(output=output, cost_usd=JUDGE_COST, run_id=JUDGE_RUN, error=error)


async def judged(check: CheckDefinition, reply: JudgeReply) -> tuple[CheckResult, list[JudgeRequest]]:
    judges = ScriptedJudges(reply)
    result = await CheckExecutor(code=CODE, judges=judges).run(check, subject(), DOCUMENT)
    return result, judges.requests


async def evaluated(check: CheckDefinition, target: CheckSubject | None = None) -> CheckResult:
    executor = CheckExecutor(code=CODE, judges=ScriptedJudges(judge_reply(None)))
    return await executor.run(check, target or subject(), DOCUMENT)


def state_value(result: CheckResult) -> tuple[CheckState, float | None]:
    return result.state, result.value


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("score", "state", "value"),
    [(0.3, CheckState.FAILED, 0.0), (0.7, CheckState.PASSED, 1.0), (BINARY_JUDGE_THRESHOLD, CheckState.PASSED, 1.0)],
)
async def test_binary_judge_passes_only_at_or_above_one_half(score: float, state: CheckState, value: float) -> None:
    result, requests = await judged(definition(JUDGE), judge_reply({"score": score, "rationale": "looks fine"}))

    assert state_value(result) == (state, value)
    assert (result.cost_usd, result.judge_run_id, result.kind) == (JUDGE_COST, JUDGE_RUN, MetricKind.BINARY)
    assert requests == [
        JudgeRequest(check_id="quality", inference=JUDGE.inference, agent=JUDGE.agent, document=DOCUMENT)
    ]


@pytest.mark.asyncio
async def test_binary_judge_uses_the_declared_threshold_over_the_default() -> None:
    result, _ = await judged(definition(JUDGE, threshold=0.8), judge_reply({"score": 0.7}))

    assert state_value(result) == (CheckState.FAILED, 0.0)
    assert result.reason == "score 0.7 is below the threshold 0.8"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("threshold", "state"),
    [(None, CheckState.PASSED), (0.4, CheckState.PASSED), (0.5, CheckState.FAILED)],
)
async def test_continuous_judge_keeps_the_score_and_the_rationale(threshold: float | None, state: CheckState) -> None:
    check = definition(JUDGE, MetricKind.CONTINUOUS, threshold)
    result, _ = await judged(check, judge_reply({"score": 0.42, "rationale": "a little vague"}))

    assert (result.state, result.value, result.reason) == (state, 0.42, "a little vague")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reply", "reason"),
    [
        (judge_reply(None, error="provider_error: upstream closed"), "provider_error: upstream closed"),
        (judge_reply({"score": "high"}), "judge returned no numeric score"),
        (judge_reply({"score": True}), "judge returned no numeric score"),
        (judge_reply(None), "judge returned no output"),
    ],
)
async def test_judge_without_a_numeric_score_is_an_error(reply: JudgeReply, reason: str) -> None:
    result, _ = await judged(definition(JUDGE, MetricKind.ORDINAL), reply)

    assert (result.state, result.value, result.reason) == (CheckState.ERROR, None, reason)
    assert (result.cost_usd, result.judge_run_id) == (JUDGE_COST, JUDGE_RUN)


def test_judge_result_is_the_same_rule_without_the_executor() -> None:
    result = judge_result(definition(JUDGE), judge_reply({"score": 0.2}))

    assert state_value(result) == (CheckState.FAILED, 0.0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("expected", "state", "reason"),
    [
        ({"text": "We will replace the lamp.", "tone": "curt"}, CheckState.PASSED, None),
        ({"text": "We will refund the lamp."}, CheckState.FAILED, "fields differ from expected_output: text"),
        (None, CheckState.FAILED, "there is no expected_output to compare with"),
    ],
)
async def test_builtin_expected_sees_the_expected_output(
    expected: JsonValue, state: CheckState, reason: str | None
) -> None:
    check = definition(BuiltinEvaluator(use="expected", params={"fields": ["text"]}))
    result = await evaluated(check, subject(expected))

    assert (result.state, result.value, result.reason) == (state, 1.0 if state is CheckState.PASSED else 0.0, reason)


def test_expected_output_reaches_the_evaluator_context_as_json() -> None:
    target = subject({"text": "x"})

    assert target.context().expected_output == {"text": "x"}
    assert target.context().metadata == {"case": "lamp"}


@pytest.mark.asyncio
async def test_continuous_code_check_without_a_score_is_an_error() -> None:
    result = await evaluated(definition(CodeEvaluator(run=SCORELESS), MetricKind.CONTINUOUS))

    assert (result.state, result.value, result.reason) == (
        CheckState.ERROR,
        None,
        "evaluator returned no score for a continuous check",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("threshold", "state"), [(None, CheckState.PASSED), (0.3, CheckState.FAILED)])
async def test_continuous_code_check_compares_the_score_with_the_threshold(
    threshold: float | None, state: CheckState
) -> None:
    check = definition(CodeEvaluator(run=SCORED, params={"floor": 0.2}), MetricKind.CONTINUOUS, threshold)
    result = await evaluated(check)

    assert (result.state, result.value) == (state, 0.25)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tone", "state", "value"), [("calm", CheckState.PASSED, 1.0), ("curt", CheckState.FAILED, 0.0)]
)
async def test_binary_code_check_awaits_an_async_evaluator(tone: str, state: CheckState, value: float) -> None:
    result = await evaluated(definition(CodeEvaluator(run=ASYNC_CHECK)), subject(tone=tone))

    assert state_value(result) == (state, value)


@pytest.mark.asyncio
async def test_code_check_reads_metadata_attempt_cost_and_latency() -> None:
    result = await evaluated(definition(CodeEvaluator(run=METADATA_CHECK)))

    assert result.state is CheckState.PASSED


@pytest.mark.asyncio
async def test_builtin_cost_check_scores_the_subject_cost() -> None:
    result = await evaluated(definition(BuiltinEvaluator(use="cost_usd"), MetricKind.CONTINUOUS))

    assert (result.state, result.value) == (CheckState.PASSED, 0.25)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("evaluator", "reason"),
    [
        (CodeEvaluator(run=NOT_A_VERDICT), "evaluator checks.scored:not_a_verdict did not return a Verdict"),
        (BuiltinEvaluator(use="no_such_check"), "evaluator use: no_such_check is not found or is not a function"),
        (
            CodeEvaluator(run=CodeRef("checks.scored:missing")),
            "evaluator checks.scored:missing cannot be loaded: no function checks.scored:missing",
        ),
    ],
)
async def test_invalid_evaluators_raise_check_invalid(evaluator: CompiledEvaluator, reason: str) -> None:
    with pytest.raises(CheckInvalid) as invalid:
        await evaluated(definition(evaluator))

    assert (invalid.value.check_id, invalid.value.reason) == ("quality", reason)


@pytest.mark.asyncio
async def test_invalid_parameters_raise_check_invalid() -> None:
    with pytest.raises(CheckInvalid) as invalid:
        await evaluated(definition(CodeEvaluator(run=SCORED, params={"floor": "high"})))

    assert invalid.value.reason.startswith("evaluator checks.scored:quality: with parameters are invalid")


@pytest.mark.asyncio
async def test_both_code_loaders_serve_as_code_functions(tmp_path: Path) -> None:
    imported: CodeFunctions = LoaderFunctions(ImportCodeLoader())
    project: CodeFunctions = CodeLoader(tmp_path)
    check = definition(CodeEvaluator(run=CodeRef("aqven.policies.evaluators:cost_usd")), MetricKind.CONTINUOUS)
    judges = ScriptedJudges(judge_reply(None))

    loaded = await CheckExecutor(code=imported, judges=judges).run(check, subject(), DOCUMENT)
    with pytest.raises(CheckInvalid):
        await CheckExecutor(code=project, judges=judges).run(check, subject(), DOCUMENT)

    assert (loaded.state, loaded.value) == (CheckState.PASSED, 0.25)


def test_json_record_keeps_unknown_fields() -> None:
    record = JsonRecord.model_validate({"customer": {"locale": "en-GB"}, "message": "hi"})

    assert record.model_dump() == {"customer": {"locale": "en-GB"}, "message": "hi"}
