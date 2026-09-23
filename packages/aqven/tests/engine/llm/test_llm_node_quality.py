import asyncio
from dataclasses import dataclass, field
from decimal import Decimal

from llm_harness import (
    MODEL,
    SCHEMA,
    Chunk,
    ScriptedModel,
    agent,
    answer_inference,
    answer_node,
    field_ir,
    llm_bed,
    no_bad_words,
    pick_node,
    request_texts,
    retry_texts,
    tool_call,
)
from pydantic import BaseModel, JsonValue
from pydantic_ai.models import Model
from pydantic_ai.models.function import FunctionModel

from aqven.engine.allowed_set_view import allowed_set_views
from aqven.engine.llm import OUTPUT_TOOL_NAME
from aqven.ir import (
    BuiltinEvaluator,
    CodeEvaluator,
    CompiledAllowedSet,
    CompiledCheck,
    CompiledInference,
    JudgeEvaluator,
    TemplatePrompt,
)
from aqven.models import CallPolicy, ContextUsageSink, RequestCost, cassette_policy, guard_model
from aqven.policies import NoParams
from aqven.ports.execution import NodeFailed, NodeSucceeded
from aqven.runtime.events import RUN_EVENT_ADAPTER, InferenceChecksCaptured
from aqven.runtime.values import InlineValue
from aqven.spec import AgentId, CodeRef, InferenceId, Limits, OnFail, TypeId

RUN_INPUT: dict[str, JsonValue] = {"question": "where is my order?", "product": None}
PRICED_NAME = "gpt-4o-mini"
CHECK_REF = CodeRef("shop.checks:no_bad_words")
POLICIES: list[JsonValue] = [
    {"policy_id": "pol_refund", "title": "Money refund"},
    {"policy_id": "pol_repair", "title": "Warranty repair"},
]


def _answer(reply: str, call_id: str) -> list[Chunk]:
    return [tool_call(OUTPUT_TOOL_NAME, f'{{"reply": "{reply}", "confidence": 0.7}}', call_id)]


def _code_check(on_fail: OnFail) -> CompiledCheck:
    return CompiledCheck(name="clean", evaluator=CodeEvaluator(run=CHECK_REF), on_fail=on_fail)


def _pick_inference() -> CompiledInference:
    allowed = CompiledAllowedSet(
        type_id=TypeId("PolicyId"),
        source="$in.policies[*].policy_id",
        labels_from="$in.policies[*].title",
    )
    return CompiledInference(
        inference_id=InferenceId("pick"),
        description="policy choice",
        input_fields=(field_ir("question", "Text"), field_ir("policies", "PolicyRef[]")),
        output_fields=(field_ir("choices", "Choice[]"),),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        prompt=TemplatePrompt(level=2, template="{{ question }}\n{{ output_format }}"),
        allowed_sets=(allowed,),
    )


def _choice(policy: str, call_id: str) -> list[Chunk]:
    return [tool_call(OUTPUT_TOOL_NAME, f'{{"choices": [{{"policy": "{policy}", "reason": "fits"}}]}}', call_id)]


def _enums(schema: JsonValue) -> list[JsonValue]:
    if isinstance(schema, dict):
        own = [schema["enum"]] if "enum" in schema else []
        return own + [found for value in schema.values() for found in _enums(value)]
    if isinstance(schema, list):
        return [found for value in schema for found in _enums(value)]
    return []


def test_allowed_set_view_uses_recorded_input_values_and_labels() -> None:
    input_ref = InlineValue(value={"policies": POLICIES})

    views = allowed_set_views(_pick_inference(), input_ref)

    assert len(views) == 1
    assert views[0].type_id == "PolicyId"
    assert views[0].source == "$in.policies[*].policy_id"
    assert views[0].labels_from == "$in.policies[*].title"
    assert [(member.value, member.label) for member in views[0].members] == [
        ("pol_refund", "Money refund"),
        ("pol_repair", "Warranty repair"),
    ]


def test_retry_check_discards_attempt_and_retries_with_feedback() -> None:
    inference = answer_inference(checks=(_code_check(OnFail.RETRY),))
    turns = [_answer("bad news", "out-1"), _answer("good news", "out-2")]
    bed = llm_bed(turns, answer_node(), [agent()], [inference], RUN_INPUT, code={CHECK_REF: no_bad_words})

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "good news", "confidence": 0.7}
    assert outcome.usage.requests == 2
    assert bed.scope.output.discards() == [(1, "schema_invalid")]
    assert bed.scope.output.text("output_json", attempt=2) == '{"reply": "good news", "confidence": 0.7}'
    feedback = retry_texts(bed.scripted.seen[1][0])
    assert any("forbidden word bad" in text for text in feedback)


def test_fail_check_fails_the_node() -> None:
    inference = answer_inference(checks=(_code_check(OnFail.FAIL),))
    bed = llm_bed(
        [_answer("bad news", "out-1")], answer_node(), [agent()], [inference], RUN_INPUT, code={CHECK_REF: no_bad_words}
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "check_failed"
    assert outcome.usage.requests == 1


def test_flag_check_passes_value_and_counts_failure() -> None:
    inference = answer_inference(checks=(_code_check(OnFail.FLAG),))
    bed = llm_bed(
        [_answer("bad news", "out-1")], answer_node(), [agent()], [inference], RUN_INPUT, code={CHECK_REF: no_bad_words}
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.checks_failed == 1
    assert bed.scope.output.discards() == []
    captured = [event for event in bed.scope.events.emitted if isinstance(event, InferenceChecksCaptured)]
    assert len(captured) == 1
    assert [(check.check, check.passed, check.feedback) for check in captured[0].checks] == [
        ("clean", False, "reply contains the forbidden word bad")
    ]
    assert RUN_EVENT_ADAPTER.validate_json(captured[0].model_dump_json()) == captured[0]


def not_a_verdict(value: BaseModel, context: object, params: NoParams) -> bool:
    return True


def test_a_check_that_returns_no_verdict_fails_the_node_as_invalid_code() -> None:
    inference = answer_inference(checks=(_code_check(OnFail.RETRY),))
    code: dict[str, object] = {CHECK_REF: not_a_verdict}
    bed = llm_bed([_answer("good news", "out-1")], answer_node(), [agent()], [inference], RUN_INPUT, code=code)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "code_invalid"
    assert outcome.error.message == f"evaluator {CHECK_REF} did not return a Verdict"


def test_a_passed_judge_check_carries_no_feedback() -> None:
    check = CompiledCheck(
        name="grounded",
        evaluator=JudgeEvaluator(inference=InferenceId("grade"), agent=AgentId("critic")),
        on_fail=OnFail.FLAG,
        threshold=0.5,
    )
    turns = [
        _answer("first", "out-1"),
        [tool_call(OUTPUT_TOOL_NAME, '{"rationale": "well grounded", "score": 0.9}', "judge-1")],
    ]
    inference = answer_inference(checks=(check,))
    bed = llm_bed(turns, answer_node(), [agent(), agent("critic")], [inference, _grade_inference()], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    captured = [event for event in bed.scope.events.emitted if isinstance(event, InferenceChecksCaptured)]
    assert isinstance(outcome, NodeSucceeded)
    assert [(item.check, item.passed, item.feedback) for item in captured[0].checks] == [("grounded", True, None)]


def test_builtin_evaluator_retries_until_value_fits() -> None:
    check = CompiledCheck(
        name="short",
        evaluator=BuiltinEvaluator(use="max_words", params={"field": "$out.reply", "max": 2}),
        on_fail=OnFail.RETRY,
    )
    turns = [_answer("far too long reply", "out-1"), _answer("short clear", "out-2")]
    bed = llm_bed(turns, answer_node(), [agent()], [answer_inference(checks=(check,))], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "short clear", "confidence": 0.7}
    assert bed.scope.output.discards() == [(1, "schema_invalid")]


def test_judge_check_runs_nested_inference_and_retries_below_threshold() -> None:
    check = CompiledCheck(
        name="grounded",
        evaluator=JudgeEvaluator(inference=InferenceId("grade"), agent=AgentId("critic")),
        on_fail=OnFail.RETRY,
        threshold=0.5,
    )
    grade = CompiledInference(
        inference_id=InferenceId("grade"),
        description="grading",
        input_fields=(field_ir("question", "Text"), field_ir("reply", "Text")),
        output_fields=(field_ir("rationale", "Text"), field_ir("score", "Float")),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        prompt=TemplatePrompt(level=2, template="{{ question }} => {{ reply }}\n{{ output_format }}"),
    )
    turns = [
        _answer("first", "out-1"),
        [tool_call(OUTPUT_TOOL_NAME, '{"rationale": "ungrounded", "score": 0.2}', "judge-1")],
        _answer("second", "out-2"),
        [tool_call(OUTPUT_TOOL_NAME, '{"rationale": "good", "score": 0.9}', "judge-2")],
    ]
    inference = answer_inference(checks=(check,))
    bed = llm_bed(turns, answer_node(), [agent(), agent("critic")], [inference, grade], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "second", "confidence": 0.7}
    assert outcome.usage.requests == 4
    assert request_texts(bed.scripted.seen[1][0])[-1].startswith("where is my order? => first")
    assert any("ungrounded" in text for text in retry_texts(bed.scripted.seen[2][0]))
    assert bed.scope.output.discards() == [(1, "schema_invalid")]


@dataclass(slots=True)
class SettledCosts:
    seen: list[RequestCost] = field(default_factory=list[RequestCost])

    def record(self, cost: RequestCost) -> None:
        self.seen.append(cost)
        ContextUsageSink().record(cost)

    def total(self) -> Decimal:
        return sum((entry.cost or Decimal(0) for entry in self.seen), Decimal(0))

    def priced(self, scripted: ScriptedModel) -> Model:
        model = FunctionModel(stream_function=scripted.stream, model_name=PRICED_NAME)
        policy = CallPolicy(cassettes=cassette_policy(None), usage_sink=self)
        return guard_model(model, model_ref=MODEL, policy=policy)


def _grade_inference() -> CompiledInference:
    return CompiledInference(
        inference_id=InferenceId("grade"),
        description="grading",
        input_fields=(field_ir("question", "Text"), field_ir("reply", "Text")),
        output_fields=(field_ir("rationale", "Text"), field_ir("score", "Float")),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        prompt=TemplatePrompt(level=2, template="{{ question }} => {{ reply }}\n{{ output_format }}"),
    )


def test_the_nested_judge_of_a_check_is_paid_by_the_node() -> None:
    check = CompiledCheck(
        name="grounded",
        evaluator=JudgeEvaluator(inference=InferenceId("grade"), agent=AgentId("critic")),
        on_fail=OnFail.RETRY,
        threshold=0.5,
    )
    turns = [
        _answer("first", "out-1"),
        [tool_call(OUTPUT_TOOL_NAME, '{"rationale": "ungrounded", "score": 0.2}', "judge-1")],
        _answer("second", "out-2"),
        [tool_call(OUTPUT_TOOL_NAME, '{"rationale": "good", "score": 0.9}', "judge-2")],
    ]
    costs = SettledCosts()
    inference = answer_inference(checks=(check,))
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(), agent("critic")],
        [inference, _grade_inference()],
        RUN_INPUT,
        models=costs.priced,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert len(costs.seen) == 4
    assert outcome.usage.cost_usd == costs.total()
    assert outcome.usage.cost_usd > Decimal(0)


def test_a_node_failed_by_invalid_json_keeps_its_cost_and_the_model_that_answered() -> None:
    broken = [tool_call(OUTPUT_TOOL_NAME, '{"reply": ', "out-1")]
    costs = SettledCosts()
    bed = llm_bed([broken, broken], answer_node(), [agent()], [answer_inference()], RUN_INPUT, models=costs.priced)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert len(costs.seen) == 2
    assert outcome.usage.cost_usd == costs.total()
    assert outcome.usage.cost_usd > Decimal(0)
    assert outcome.model == PRICED_NAME


def test_allowed_set_narrows_schema_to_enum_and_retries_violation() -> None:
    run_input: dict[str, JsonValue] = {"question": "lamp is broken", "policies": POLICIES}
    turns = [_choice("pol_unknown", "out-1"), _choice("POL_REPAIR", "out-2")]
    bed = llm_bed(turns, pick_node(), [agent()], [_pick_inference()], run_input)

    outcome = asyncio.run(bed.executor.execute(pick_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"choices": [{"policy": "pol_repair", "reason": "fits"}]}
    schema = bed.scripted.seen[0][1].output_tools[0].parameters_json_schema
    assert ["pol_refund", "pol_repair"] in _enums(schema)
    prompt = request_texts(bed.scripted.seen[0][0])[-1]
    assert "- pol_refund: Money refund" in prompt
    assert bed.scope.output.discards() == [(1, "schema_invalid")]


def test_allowed_set_above_enum_limit_is_checked_by_output_guard_with_nearest_candidates() -> None:
    run_input: dict[str, JsonValue] = {"question": "lamp is broken", "policies": POLICIES}
    turns = [_choice("pol_repairs", "out-1"), _choice("pol_refund", "out-2")]
    bed = llm_bed(turns, pick_node(), [agent()], [_pick_inference()], run_input, max_enum=1)

    outcome = asyncio.run(bed.executor.execute(pick_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"choices": [{"policy": "pol_refund", "reason": "fits"}]}
    assert _enums(bed.scripted.seen[0][1].output_tools[0].parameters_json_schema) == []
    feedback = retry_texts(bed.scripted.seen[1][0])
    assert any("choices.*.policy: 'pol_repairs'" in text and "closest: pol_repair" in text for text in feedback)


def test_allowed_set_violation_fails_after_retries_are_exhausted() -> None:
    run_input: dict[str, JsonValue] = {"question": "lamp is broken", "policies": POLICIES}
    turns = [_choice("pol_other", "out-1"), _choice("pol_other", "out-2")]
    bed = llm_bed(turns, pick_node(), [agent()], [_pick_inference()], run_input, max_enum=1)

    outcome = asyncio.run(bed.executor.execute(pick_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "MODEL_RETRIES_EXHAUSTED"
    assert outcome.error.hint == "tighten the prompt or widen the allowed set in inference pick"
    assert outcome.error.details is not None
    assert (outcome.error.details.attempt, outcome.error.details.output_mode) == (2, "tool")
    assert bed.scope.output.discards() == [(1, "schema_invalid"), (2, "schema_invalid")]


def test_request_budget_stops_the_retry_and_discards_the_attempt() -> None:
    inference = answer_inference(checks=(_code_check(OnFail.RETRY),))
    budget = Limits(requests=1)
    turns = [_answer("bad news", "out-1"), _answer("good news", "out-2")]
    bed = llm_bed(turns, answer_node(), [agent(limits=budget)], [inference], RUN_INPUT, code={CHECK_REF: no_bad_words})

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "budget_exceeded"
    assert outcome.usage.requests == 1
    assert bed.scope.output.discards() == [(1, "schema_invalid")]
