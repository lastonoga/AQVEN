import inspect
from typing import Annotated, Final, Literal

import pytest
from pydantic import BaseModel, ConfigDict, JsonValue, StringConstraints, ValidationError

from aqven.evals.scoring import value_of
from aqven.policies import (
    BUILTINS,
    BranchResult,
    Continue,
    Default,
    Done,
    EvalContext,
    Fail,
    JoinState,
    LoopState,
    NoParams,
    Skip,
    Slot,
    Stop,
    Verdict,
    Wait,
    builtin,
    control,
    evaluators,
)
from aqven.spec import MapItemError, MetricKind, PiiDetector

MIRROR: Final = ConfigDict(extra="forbid", frozen=True)
NO_PARAMS: Final = NoParams()


class Chunk(BaseModel):
    model_config = MIRROR
    chunk_id: str
    text: Annotated[str, StringConstraints(max_length=200)]


class Citation(BaseModel):
    model_config = MIRROR
    chunk_id: str
    quote: str


class Reply(BaseModel):
    model_config = MIRROR
    text: str
    citations: list[Citation]


class ReplyIn(BaseModel):
    model_config = MIRROR
    locale: str
    chunks: list[Chunk]


class ReplyOut(BaseModel):
    model_config = MIRROR
    reply: Reply


class Observation(BaseModel):
    model_config = MIRROR
    key: str


class Triage(BaseModel):
    model_config = MIRROR
    summary: str
    tone: Literal["calm", "urgent"]
    observations: list[Observation]


CHUNKS: Final = [Chunk(chunk_id="kb_0000000001", text="Контроллер ленты перезагружается кнопкой питания.")]
INPUTS: Final = ReplyIn(locale="ru-RU", chunks=CHUNKS)


def reply(text: str, quote: str = "перезагружается кнопкой", chunk_id: str = "kb_0000000001") -> ReplyOut:
    return ReplyOut(reply=Reply(text=text, citations=[Citation(chunk_id=chunk_id, quote=quote)]))


def state(*completed: BranchResult[str], pending: tuple[str, ...] = ()) -> JoinState[str]:
    return JoinState(completed=completed, pending=pending)


OK_A: Final = BranchResult[str]("a", value="A")
OK_B: Final = BranchResult[str]("b", value="B")
ERROR_C: Final = BranchResult[str]("c", error="timeout")


def test_every_builtin_takes_its_params_model_last() -> None:
    for slot, table in BUILTINS.items():
        for policy_id, function in table.items():
            params = list(inspect.signature(function).parameters.values())[-1]
            assert params.name == "params", (slot, policy_id)
            assert builtin(slot, policy_id) is function
    assert builtin(Slot.JOIN, "majority") is None


@pytest.mark.parametrize(
    ("policy_id", "params", "join", "expected"),
    [
        ("all", NO_PARAMS, state(OK_A, pending=("b",)), Wait()),
        ("all", NO_PARAMS, state(OK_A, OK_B), Done(("A", "B"))),
        ("all", NO_PARAMS, state(OK_A, ERROR_C, pending=("b",)), Fail("timeout")),
        ("any", NO_PARAMS, state(OK_B, pending=("a",)), Done(("B",))),
        ("first_success", NO_PARAMS, state(ERROR_C, pending=("a",)), Wait()),
        ("first_success", NO_PARAMS, state(ERROR_C), Fail("all branches failed")),
        ("quorum", control.QuorumParams(min_ok=2, on_error="skip"), state(ERROR_C, OK_A, pending=("b",)), Wait()),
        ("quorum", control.QuorumParams(min_ok=2, on_error="skip"), state(ERROR_C, OK_A, OK_B), Done(("A", "B"))),
        ("quorum", control.QuorumParams(min_ok=2), state(ERROR_C, pending=("a", "b")), Fail("timeout")),
        (
            "quorum",
            control.QuorumParams(min_ok=2, on_error="skip"),
            state(ERROR_C, OK_A),
            Fail("quorum 2 is unreachable"),
        ),
    ],
)
def test_join_builtins_decide_after_each_branch(
    policy_id: str, params: BaseModel, join: JoinState[str], expected: object
) -> None:
    function = BUILTINS[Slot.JOIN][policy_id]

    assert function(join, params) == expected


def iterations(*scores: float) -> LoopState:
    documents: list[JsonValue] = [{"critique": {"out": {"critique": {"score": score}}}} for score in scores]
    return LoopState(iterations=tuple(documents))


SCORE: Final = "$iter.critique.out.critique.score"


def test_loop_builtins_read_iteration_paths() -> None:
    assert control.threshold(iterations(0.6, 0.9), control.ThresholdParams(path=SCORE, gte=0.85)) == Stop(
        f"threshold reached: {SCORE} = 0.9"
    )
    assert control.threshold(iterations(0.6), control.ThresholdParams(path=SCORE, gte=0.85)) == Continue()
    assert isinstance(control.threshold(iterations(0.2), control.ThresholdParams(path=SCORE, lte=0.3)), Stop)
    stagnation = control.StagnationParams(path=SCORE, window=1, min_delta=0.02)
    assert isinstance(control.stagnation(iterations(0.7, 0.71), stagnation), Stop)
    assert control.stagnation(iterations(0.7, 0.8), stagnation) == Continue()
    assert control.stagnation(iterations(0.7), stagnation) == Continue()
    assert control.best(iterations(0.7, 0.9, 0.8), control.BestParams(path=SCORE)) == 1
    assert control.last(iterations(0.7, 0.9, 0.8), NO_PARAMS) == 2
    with pytest.raises(ValidationError):
        control.ThresholdParams(path=SCORE)
    with pytest.raises(ValidationError):
        control.BestParams(path="critique.score")


def test_item_error_builtins() -> None:
    error = MapItemError(index=2, code="timeout", message="model timeout")

    assert control.skip("perspective", error, NO_PARAMS) == Skip()
    assert control.fail("perspective", error, NO_PARAMS) == Fail("model timeout")
    assert control.default("perspective", error, control.DefaultParams(value={"intent": "question"})) == Default(
        {"intent": "question"}
    )


def context_of(inputs: BaseModel) -> EvalContext[BaseModel, BaseModel]:
    return EvalContext[BaseModel, BaseModel](inputs=inputs, cost_usd=0.004, latency_ms=900)


REPLY_TEXT: Final = "$out.reply.text"


@pytest.mark.parametrize(
    ("function", "value", "params", "passed"),
    [
        (
            evaluators.max_words,
            reply("Нажмите кнопку питания"),
            evaluators.MaxWordsParams(field=REPLY_TEXT, max=3),
            True,
        ),
        (
            evaluators.max_words,
            reply("Нажмите и удерживайте кнопку"),
            evaluators.MaxWordsParams(field=REPLY_TEXT, max=3),
            False,
        ),
        (evaluators.not_empty, reply("  "), evaluators.FieldParams(field=REPLY_TEXT), False),
        (
            evaluators.language,
            reply("Перезагрузите контроллер ленты"),
            evaluators.LanguageParams(field=REPLY_TEXT, locale="$in.locale"),
            True,
        ),
        (
            evaluators.language,
            reply("Please restart the strip controller"),
            evaluators.LanguageParams(field=REPLY_TEXT, locale="$in.locale"),
            False,
        ),
        (evaluators.no_pii, reply("Пишите на anna@example.com"), evaluators.NoPiiParams(fields=[REPLY_TEXT]), False),
        (
            evaluators.no_pii,
            reply("Пишите на anna@example.com"),
            evaluators.NoPiiParams(fields=[REPLY_TEXT], detectors=[PiiDetector.PHONE]),
            True,
        ),
        (
            evaluators.regex,
            reply("Заказ LUM-20260917"),
            evaluators.RegexParams(field=REPLY_TEXT, pattern=r"LUM-\d{8}"),
            True,
        ),
        (
            evaluators.citations_in_sources,
            reply("Нажмите кнопку"),
            evaluators.CitationsInSourcesParams(
                citations="$out.reply.citations", sources="$in.chunks", id="chunk_id", quote="quote", text="text"
            ),
            True,
        ),
        (
            evaluators.citations_in_sources,
            reply("Нажмите кнопку", quote="сбросьте настройки"),
            evaluators.CitationsInSourcesParams(
                citations="$out.reply.citations", sources="$in.chunks", id="chunk_id", quote="quote", text="text"
            ),
            False,
        ),
        (
            evaluators.ids_in_allowed_set,
            reply("Нажмите кнопку", chunk_id="kb_9999999999"),
            evaluators.IdsInAllowedSetParams(
                field="$out.reply.citations[*].chunk_id", allowed="$in.chunks[*].chunk_id"
            ),
            False,
        ),
    ],
)
def test_evaluator_builtins_read_value_and_inputs(
    function: object, value: ReplyOut, params: BaseModel, passed: bool
) -> None:
    assert callable(function)
    result = function(value, context_of(INPUTS), params)

    assert isinstance(result, Verdict)
    assert result.passed is passed
    assert (result.reason is None) is passed


def test_unique_items_and_metrics() -> None:
    triage = Triage(
        summary="Мерцает", tone="calm", observations=[Observation(key="flicker"), Observation(key="flicker")]
    )
    params = evaluators.UniqueItemsParams(field="$out.observations", key="key")

    assert not evaluators.unique_items(triage, context_of(INPUTS), params).passed
    assert evaluators.cost_usd(triage, context_of(INPUTS), NO_PARAMS) == Verdict(passed=True, score=0.004)
    assert evaluators.latency_ms(triage, context_of(INPUTS), NO_PARAMS).score == 900.0


def test_params_models_reject_unknown_keys() -> None:
    with pytest.raises(ValidationError):
        control.QuorumParams.model_validate({"min_ok": 2, "on_error": "retry"})
    with pytest.raises(ValidationError):
        evaluators.MaxWordsParams.model_validate({"field": REPLY_TEXT, "max": 220, "min": 1})


CALM_TRIAGE: Final = Triage(summary="Мерцает", tone="calm", observations=[Observation(key="flicker")])


def expecting(expected: object) -> EvalContext[BaseModel, object]:
    return EvalContext[BaseModel, object](inputs=INPUTS, expected_output=expected)


@pytest.mark.parametrize(
    ("expected", "fields", "passed", "reason"),
    [
        ({"summary": "Мерцает", "tone": "calm"}, None, True, None),
        ({"summary": "Мерцает", "tone": "urgent"}, None, False, "fields differ from expected_output: tone"),
        ({"summary": "Гаснет", "tone": "calm"}, ["tone"], True, None),
        ({"tone": "calm"}, ["tone", "summary"], False, "expected_output lacks the fields summary"),
        ({"tone": "calm", "summary": None}, ["tone", "summary"], False, "fields differ from expected_output: summary"),
        ({"observations": [{"key": "flicker"}]}, None, True, None),
        ({"observations": [{"key": "heat"}]}, None, False, "fields differ from expected_output: observations"),
        ("calm", None, False, "the output differs from expected_output"),
        ("calm", ["tone"], False, "expected_output is not an object with the fields tone"),
        (None, None, False, evaluators.NO_EXPECTED_OUTPUT),
        (None, ["tone"], False, evaluators.NO_EXPECTED_OUTPUT),
    ],
    ids=[
        "every_expected_field",
        "field_differs",
        "chosen_fields_only",
        "chosen_field_missing_in_expected",
        "chosen_field_expected_null",
        "nested_json_equal",
        "nested_json_differs",
        "not_a_record",
        "chosen_fields_of_a_non_object",
        "no_expected_output",
        "no_expected_output_for_chosen_fields",
    ],
)
def test_expected_compares_the_output_with_the_expected_output(
    expected: object, fields: list[str] | None, passed: bool, reason: str | None
) -> None:
    verdict = evaluators.expected(CALM_TRIAGE, expecting(expected), evaluators.ExpectedParams(fields=fields))

    assert (verdict.passed, verdict.reason) == (passed, reason)


def test_missing_expected_output_counts_as_a_failed_attempt() -> None:
    verdict = evaluators.expected(CALM_TRIAGE, expecting(None), evaluators.ExpectedParams(fields=["tone"]))

    assert value_of(MetricKind.BINARY, verdict) == 0.0


def test_expected_reads_a_model_as_the_expected_output() -> None:
    same = Triage(summary="Мерцает", tone="calm", observations=[Observation(key="flicker")])

    verdict = evaluators.expected(CALM_TRIAGE, expecting(same), evaluators.ExpectedParams())

    assert verdict == Verdict(passed=True)


def test_expected_is_a_builtin_evaluator_with_field_names() -> None:
    assert builtin(Slot.EVALUATOR, "expected") is evaluators.expected
    with pytest.raises(ValidationError):
        evaluators.ExpectedParams.model_validate({"fields": []})
    with pytest.raises(ValidationError):
        evaluators.ExpectedParams.model_validate({"fields": ["$out.tone"]})
