import asyncio
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from llm_harness import (
    PRICED_NAME,
    Chunk,
    FakeScope,
    LlmBed,
    ScriptedModel,
    agent,
    answer_inference,
    answer_node,
    capabilities,
    llm_bed,
    request_texts,
    tool_call,
)
from pydantic import BaseModel, JsonValue
from pydantic_ai import ModelHTTPError
from pydantic_ai.messages import (
    FinishReason,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    ModelResponseStreamEvent,
    RetryPromptPart,
)
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.settings import ModelSettings

from aqven.engine.assembly import EngineModelSource, ProviderKeys
from aqven.engine.llm import OUTPUT_TOOL_NAME
from aqven.engine.request import RunSpec
from aqven.ir import AgentModel, CodeEvaluator, CompiledAgent, CompiledAgentOutput, CompiledCheck
from aqven.models import RelayedStream, StreamFirstModel
from aqven.models.streams import StreamContext
from aqven.policies import NoParams, Verdict
from aqven.ports.execution import NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime import CassetteConfig, CassetteMode
from aqven.runtime.address import RunId
from aqven.runtime.events import NodeAttemptFailed
from aqven.runtime.vocabulary import AttemptAction, AttemptCauseKind
from aqven.spec import AgentOutputSpec, CodeRef, FlowId, ModelString, OnFail, OutcomePolicy, ProviderName
from aqven.testing.engines import FixedModels, offline_environment

PRIMARY: Final = "openrouter:google/gemini-2.5-flash-lite"
FALLBACK: Final = "openrouter:qwen/qwen3-32b"
LOOKER_FILE: Final = "agents/looker.yaml"
NATIVE_ERROR: Final = "MALFORMED_FUNCTION_CALL"
CLOSED_STATUS: Final = 400
CHECK_REF: Final = CodeRef("shop.checks:record_reply")
RUN_INPUT: Final[dict[str, JsonValue]] = {"question": "where is my order?", "product": None}

type Turns = Sequence[Sequence[Chunk]]
type AttemptRow = tuple[int, AttemptCauseKind, AttemptAction]


def answer(reply: str, call_id: str) -> list[Chunk]:
    return [tool_call(OUTPUT_TOOL_NAME, f'{{"reply": "{reply}", "confidence": 0.7}}', call_id)]


def shapeless(call_id: str) -> list[Chunk]:
    return [tool_call(OUTPUT_TOOL_NAME, '{"reply": "no confidence"}', call_id)]


@dataclass(slots=True)
class FinishRelay:
    source: StreamedResponse
    finish: FinishReason | None

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            yield event
        if self.finish is None:
            return
        self.source.finish_reason = self.finish
        self.source.provider_details = {"finish_reason": NATIVE_ERROR}

    def response(self, response: ModelResponse) -> ModelResponse:
        return response


class FinishingModel(StreamFirstModel):
    def __init__(self, wrapped: Model, finishes: Mapping[int, FinishReason]) -> None:
        super().__init__(wrapped)
        self.finishes = finishes
        self.opened = 0

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        turn = self.opened
        self.opened += 1
        async with self.wrapped.request_stream(
            messages, model_settings, model_request_parameters, run_context
        ) as stream:
            yield RelayedStream(stream, FinishRelay(stream, self.finishes.get(turn)))


@dataclass(slots=True)
class ScriptedChoice:
    model: str
    turns: Turns
    finishes: Mapping[int, FinishReason] = field(default_factory=dict[int, FinishReason])
    scripted: ScriptedModel = field(init=False)

    def __post_init__(self) -> None:
        self.scripted = ScriptedModel(self.turns)

    def built(self) -> Model:
        function = FunctionModel(stream_function=self.scripted.stream, model_name=PRICED_NAME)
        return FinishingModel(function, self.finishes)

    def requests(self) -> list[list[ModelMessage]]:
        return [messages for messages, _ in self.scripted.seen]


@dataclass(slots=True)
class RunScope(FakeScope):
    run_spec: RunSpec = field(default_factory=lambda: RunSpec(flow_id=FlowId("support")))
    attempt: int = 1

    @property
    def root_run_id(self) -> RunId:
        return self.run_id


def source(models: Mapping[str, Model]) -> EngineModelSource:
    return EngineModelSource(FixedModels(models), ProviderKeys(None, offline_environment()))


def choice(model: str) -> AgentModel:
    return AgentModel(model=ModelString(model), provider=ProviderName("openrouter"), capabilities=capabilities())


def looker(models: Sequence[str], output: CompiledAgentOutput) -> CompiledAgent:
    return agent(models=tuple(choice(model) for model in models), output=output, file=LOOKER_FILE)


def reply_recorder(seen: list[str]) -> Callable[[BaseModel, object, NoParams], Verdict]:
    def record_reply(value: BaseModel, context: object, params: NoParams) -> Verdict:
        seen.append(str(value.model_dump().get("reply")))
        return Verdict(passed=True, reason=None)

    return record_reply


def bed_with(models: Mapping[str, Model], output: CompiledAgentOutput, seen: list[str] | None = None) -> LlmBed:
    check = CompiledCheck(name="recorded", evaluator=CodeEvaluator(run=CHECK_REF), on_fail=OnFail.RETRY)
    return llm_bed(
        [],
        answer_node(),
        [looker(list(models), output)],
        [answer_inference(checks=(check,))],
        RUN_INPUT,
        code={CHECK_REF: reply_recorder([] if seen is None else seen)},
        source=source(models),
    )


def bed_of(choices: Sequence[ScriptedChoice], output: CompiledAgentOutput, seen: list[str] | None = None) -> LlmBed:
    return bed_with({item.model: item.built() for item in choices}, output, seen)


def executed(bed: LlmBed) -> NodeOutcome:
    return asyncio.run(bed.executor.execute(answer_node(), bed.scope))


def attempt_rows(bed: LlmBed) -> list[AttemptRow]:
    return [
        (event.attempt, event.cause.kind, event.action)
        for event in bed.scope.events.emitted
        if isinstance(event, NodeAttemptFailed)
    ]


def responses(messages: Sequence[ModelMessage]) -> list[ModelResponse]:
    return [message for message in messages if isinstance(message, ModelResponse)]


def retried(messages: Sequence[ModelMessage]) -> bool:
    last = messages[-1]
    return isinstance(last, ModelRequest) and any(isinstance(part, RetryPromptPart) for part in last.parts)


def test_error_with_retry_asks_the_same_model_again_without_the_bad_response() -> None:
    primary = ScriptedChoice(PRIMARY, [answer("looped", "out-1"), answer("fine", "out-2")], {0: "error"})
    seen: list[str] = []
    bed = bed_of([primary], CompiledAgentOutput(on_error=OutcomePolicy.RETRY), seen)

    outcome = executed(bed)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "fine", "confidence": 0.7}
    assert outcome.model == PRIMARY
    assert seen == ["fine"]
    first, second = primary.requests()
    assert responses(second) == []
    assert len(second) == len(first) == 1
    assert request_texts(second) == request_texts(first)
    assert attempt_rows(bed) == [(1, "provider_error", "retry")]
    assert bed.scope.output.discards() == [(1, "provider_error")]
    assert [(state.segment, state.attempt_offset, state.start) for state in bed.steps.segments] == [
        (1, 0, "prompt"),
        (2, 1, "reissue"),
    ]


def test_every_abandoned_attempt_is_counted_in_the_node_usage() -> None:
    retried_bed = bed_of(
        [ScriptedChoice(PRIMARY, [answer("looped", "out-1"), answer("fine", "out-2")], {0: "error"})],
        CompiledAgentOutput(),
    )
    single_bed = bed_of([ScriptedChoice(PRIMARY, [answer("fine", "out-2")])], CompiledAgentOutput())

    twice = executed(retried_bed)
    once = executed(single_bed)

    assert isinstance(twice, NodeSucceeded)
    assert isinstance(once, NodeSucceeded)
    assert twice.usage.requests == 2
    assert once.usage.requests == 1
    assert twice.usage.tokens_in == 2 * once.usage.tokens_in
    assert twice.usage.tokens_out > once.usage.tokens_out
    assert twice.usage.cost_usd > once.usage.cost_usd > 0


def test_error_with_fallback_answers_with_the_next_model_and_its_own_retries() -> None:
    primary = ScriptedChoice(PRIMARY, [shapeless("out-1"), answer("looped", "out-2")], {1: "error"})
    fallback = ScriptedChoice(FALLBACK, [shapeless("out-3"), answer("fine", "out-4")])
    bed = bed_of([primary, fallback], CompiledAgentOutput(retries=1, on_error=OutcomePolicy.FALLBACK))

    outcome = executed(bed)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "fine", "confidence": 0.7}
    assert outcome.model == FALLBACK
    assert len(primary.requests()) == 2
    handed_over = fallback.requests()[0]
    assert [response.finish_reason for response in responses(handed_over)] == [None]
    assert retried(handed_over)
    assert attempt_rows(bed) == [
        (1, "schema_invalid", "repair"),
        (2, "provider_error", "fallback"),
        (3, "schema_invalid", "repair"),
    ]


def test_error_with_fail_fails_the_node_with_the_provider_error_and_a_hint() -> None:
    primary = ScriptedChoice(PRIMARY, [answer("looped", "out-1")], {0: "error"})
    fallback = ScriptedChoice(FALLBACK, [answer("fine", "out-2")])
    bed = bed_of([primary, fallback], CompiledAgentOutput(on_error=OutcomePolicy.FAIL))

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "provider_error"
    assert outcome.error.hint == f"set output.on_error: fallback in {LOOKER_FILE}"
    assert NATIVE_ERROR in outcome.error.message
    assert PRIMARY in outcome.error.message
    assert outcome.error.details is not None
    assert outcome.error.details.attempt == 1
    assert outcome.model == PRIMARY
    assert fallback.requests() == []
    assert attempt_rows(bed) == [(1, "provider_error", "none")]


def test_fallback_without_a_model_left_fails_the_node() -> None:
    primary = ScriptedChoice(PRIMARY, [answer("looped", "out-1")], {0: "error"})
    bed = bed_of([primary], CompiledAgentOutput(on_error=OutcomePolicy.FALLBACK))

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "provider_error"
    assert outcome.error.message.endswith("no fallback model is left")
    assert outcome.error.hint == f"add a model to fallback_models or set output.on_error: retry in {LOOKER_FILE}"


def test_fallback_continues_after_the_model_that_actually_answered() -> None:
    fallback = ScriptedChoice(FALLBACK, [answer("looped", "out-1")], {0: "error"})
    closed = FunctionModel(stream_function=closed_on_open, model_name=PRICED_NAME)
    bed = bed_with({PRIMARY: closed, FALLBACK: fallback.built()}, CompiledAgentOutput(on_error=OutcomePolicy.FALLBACK))

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.model == FALLBACK
    assert outcome.error.message.endswith("no fallback model is left")
    assert len(fallback.requests()) == 1
    assert attempt_rows(bed) == [(1, "provider_error", "none")]


def test_repair_and_outcome_retries_share_the_retries_of_the_model() -> None:
    turns = [shapeless("out-1"), answer("looped", "out-2"), shapeless("out-3"), answer("fine", "out-4")]
    primary = ScriptedChoice(PRIMARY, turns, {1: "error"})
    bed = bed_of([primary], CompiledAgentOutput(retries=2, on_error=OutcomePolicy.RETRY))

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "MODEL_RETRIES_EXHAUSTED"
    assert len(primary.requests()) == 3
    assert attempt_rows(bed) == [
        (1, "schema_invalid", "repair"),
        (2, "provider_error", "retry"),
        (3, "schema_invalid", "none"),
    ]


def test_an_outcome_retry_without_budget_left_fails_the_node() -> None:
    primary = ScriptedChoice(PRIMARY, [answer("looped", "out-1"), answer("again", "out-2")], {0: "error", 1: "error"})
    bed = bed_of([primary], CompiledAgentOutput(retries=1, on_error=OutcomePolicy.RETRY))

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "provider_error"
    assert outcome.error.message.endswith("the model used up output.retries (1)")
    assert attempt_rows(bed) == [(1, "provider_error", "retry"), (2, "provider_error", "none")]


@pytest.mark.parametrize(
    ("finish", "cause", "setting"),
    [("content_filter", "refusal", "on_refusal"), ("length", "truncated", "on_truncated")],
)
def test_refusal_and_truncation_retry_the_same_model(
    finish: FinishReason, cause: AttemptCauseKind, setting: str
) -> None:
    primary = ScriptedChoice(PRIMARY, [answer("cut", "out-1"), answer("fine", "out-2")], {0: finish})
    output = CompiledAgentOutput.model_validate({setting: "retry"})
    bed = bed_of([primary], output)

    outcome = executed(bed)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.model == PRIMARY
    assert attempt_rows(bed) == [(1, cause, "retry")]


@pytest.mark.parametrize(
    ("finish", "cause", "setting"),
    [("content_filter", "refusal", "on_refusal"), ("length", "truncated", "on_truncated")],
)
def test_refusal_and_truncation_fall_back_to_the_next_model(
    finish: FinishReason, cause: AttemptCauseKind, setting: str
) -> None:
    primary = ScriptedChoice(PRIMARY, [answer("cut", "out-1")], {0: finish})
    fallback = ScriptedChoice(FALLBACK, [answer("fine", "out-2")])
    output = CompiledAgentOutput.model_validate({setting: "fallback"})
    bed = bed_of([primary, fallback], output)

    outcome = executed(bed)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.model == FALLBACK
    assert attempt_rows(bed) == [(1, cause, "fallback")]


@pytest.mark.parametrize(
    ("finish", "code", "hint"),
    [
        ("content_filter", "refusal", f"set output.on_refusal: retry in {LOOKER_FILE}"),
        ("length", "truncated", f"raise settings.max_tokens or set output.on_truncated: retry in {LOOKER_FILE}"),
    ],
)
def test_refusal_and_truncation_still_fail_the_node_by_default(finish: FinishReason, code: str, hint: str) -> None:
    primary = ScriptedChoice(PRIMARY, [answer("cut", "out-1"), answer("fine", "out-2")], {0: finish})
    bed = bed_of([primary], CompiledAgentOutput())

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == code
    assert outcome.error.hint == hint
    assert len(primary.requests()) == 1


def test_an_error_is_retried_by_default() -> None:
    primary = ScriptedChoice(PRIMARY, [answer("looped", "out-1"), answer("fine", "out-2")], {0: "error"})
    bed = bed_of([primary], CompiledAgentOutput())

    outcome = executed(bed)

    assert isinstance(outcome, NodeSucceeded)
    assert attempt_rows(bed) == [(1, "provider_error", "retry")]


def test_the_agent_spec_defaults_retry_an_error_and_fail_a_refusal_or_truncation() -> None:
    spec = AgentOutputSpec()
    compiled = CompiledAgentOutput()

    assert (spec.on_error, spec.on_refusal, spec.on_truncated) == (
        OutcomePolicy.RETRY,
        OutcomePolicy.FAIL,
        OutcomePolicy.FAIL,
    )
    assert (compiled.on_error, compiled.on_refusal, compiled.on_truncated) == (
        spec.on_error,
        spec.on_refusal,
        spec.on_truncated,
    )


SCHEMA_REJECTION: Final[dict[str, JsonValue]] = {
    "error": {
        "code": CLOSED_STATUS,
        "message": "The specified schema produces a constraint that has too many states for serving.",
        "status": "INVALID_ARGUMENT",
    }
}
POLICIES: Final = (OutcomePolicy.RETRY, OutcomePolicy.FALLBACK, OutcomePolicy.FAIL)


@dataclass(slots=True)
class RejectingChoice:
    model: str
    calls: int = 0

    async def rejected(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
        self.calls += 1
        raise ModelHTTPError(CLOSED_STATUS, self.model, SCHEMA_REJECTION)
        yield ""

    def built(self) -> Model:
        return FunctionModel(stream_function=self.rejected, model_name=PRICED_NAME)


@pytest.mark.parametrize("policy", POLICIES, ids=[policy.value for policy in POLICIES])
def test_a_schema_rejection_goes_to_the_fallback_model_and_never_back_to_the_same_model(
    policy: OutcomePolicy,
) -> None:
    primary = RejectingChoice(PRIMARY)
    fallback = ScriptedChoice(FALLBACK, [answer("fine", "out-1")])
    bed = bed_with({PRIMARY: primary.built(), FALLBACK: fallback.built()}, CompiledAgentOutput(on_error=policy))

    outcome = executed(bed)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.model == FALLBACK
    assert primary.calls == 1
    assert len(fallback.requests()) == 1


@pytest.mark.parametrize("policy", POLICIES, ids=[policy.value for policy in POLICIES])
def test_a_schema_rejection_of_the_only_model_fails_the_node_without_asking_it_again(policy: OutcomePolicy) -> None:
    primary = RejectingChoice(PRIMARY)
    bed = bed_with({PRIMARY: primary.built()}, CompiledAgentOutput(on_error=policy))

    outcome = executed(bed)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "OUTPUT_SCHEMA_REJECTED"
    assert primary.calls == 1
    assert attempt_rows(bed) == []


async def unreachable(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
    raise AssertionError("replay must not call the model")
    yield ""


async def closed_on_open(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
    raise ModelHTTPError(CLOSED_STATUS, PRIMARY, "closed")
    yield ""


def cassette_scope(bed: LlmBed, directory: Path, mode: CassetteMode) -> RunScope:
    spec = RunSpec(flow_id=FlowId("support"), cassettes=CassetteConfig(directory=directory, mode=mode))
    return RunScope(bed.scope.project, bed.scope.flow, RUN_INPUT, run_spec=spec)


def test_a_retried_request_is_recorded_and_replayed_as_its_own_call(tmp_path: Path) -> None:
    primary = ScriptedChoice(PRIMARY, [answer("looped", "out-1"), answer("fine", "out-2")], {0: "error"})
    recording = bed_of([primary], CompiledAgentOutput())
    replaying = bed_with(
        {PRIMARY: FunctionModel(stream_function=unreachable, model_name=PRICED_NAME)}, CompiledAgentOutput()
    )

    recorded = asyncio.run(
        recording.executor.execute(answer_node(), cassette_scope(recording, tmp_path, CassetteMode.RECORD))
    )
    replayed = asyncio.run(
        replaying.executor.execute(answer_node(), cassette_scope(replaying, tmp_path, CassetteMode.REPLAY_STRICT))
    )

    assert isinstance(recorded, NodeSucceeded)
    assert isinstance(replayed, NodeSucceeded)
    assert replayed.output == recorded.output
    assert len(list(tmp_path.rglob("*.json"))) == 2
