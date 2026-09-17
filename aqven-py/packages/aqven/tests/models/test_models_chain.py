import asyncio
from collections.abc import AsyncIterable
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from models_support import (
    Chunk,
    FailingModel,
    MemorySettings,
    Script,
    ScriptedModel,
    text_script,
    tool_script,
)
from pydantic import BaseModel, SecretStr
from pydantic_ai import Agent, AgentStreamEvent, RunContext, ToolOutput
from pydantic_ai.concurrency import ConcurrencyLimiter
from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError, UsageLimitExceeded
from pydantic_ai.messages import (
    FinalResultEvent,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    RetryPromptPart,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models import Model, ModelRequestParameters, override_allow_model_requests
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import RequestUsage, UsageLimits

from aqven.models import (
    CHAIN_ORDER,
    LIVE_BEHAVIOR,
    NO_REDACTION,
    AmbiguousReplay,
    BackoffPolicy,
    CallPolicy,
    CassetteMiss,
    CassettePolicy,
    CassetteStore,
    DirectoryCassetteStore,
    GuardedModelFactory,
    MemoryCassetteStore,
    MissingProviderKey,
    PatternRedactor,
    ProviderKeyResolver,
    RedactionPolicy,
    RefusedOutput,
    TruncatedOutput,
    UsageBudget,
    UsageLog,
    call_site,
    canonical_request,
    cassette_policy,
    chain_links,
    guard_model,
    request_key,
)
from aqven.models.cassette import CASSETTE_BEHAVIORS
from aqven.ports.settings import provider_key_setting
from aqven.runtime import CassetteConfig, CassetteMode, node_address
from aqven.spec import ProviderName

MODEL_REF: Final = "openrouter:openai/gpt-oss-20b"
NO_WAIT: Final = BackoffPolicy(attempts=3, initial_seconds=0.0, max_seconds=5.0, jitter_seconds=0.0)
type StreamEvent = PartStartEvent | PartDeltaEvent | PartEndEvent | FinalResultEvent
MODEL_EVENTS: Final = (PartStartEvent, PartDeltaEvent, PartEndEvent, FinalResultEvent)


class Verdict(BaseModel):
    answer: str
    score: int


def cassettes(store: CassetteStore, mode: CassetteMode | None) -> CassettePolicy:
    behavior = LIVE_BEHAVIOR if mode is None else CASSETTE_BEHAVIORS[mode]
    return CassettePolicy(store=store, behavior=behavior)


def policy(
    store: CassetteStore | None = None,
    mode: CassetteMode | None = None,
    *,
    usage_sink: UsageLog | None = None,
    budget: UsageBudget | None = None,
    redaction: RedactionPolicy = NO_REDACTION,
    concurrency: ConcurrencyLimiter | None = None,
) -> CallPolicy:
    return CallPolicy(
        cassettes=cassettes(MemoryCassetteStore() if store is None else store, mode),
        redaction=redaction,
        concurrency=concurrency,
        budget=budget,
        backoff=NO_WAIT,
        usage_sink=UsageLog() if usage_sink is None else usage_sink,
    )


def guarded(inner: Model, call_policy: CallPolicy) -> Model:
    return guard_model(inner, model_ref=MODEL_REF, policy=call_policy)


def prompt(text: str) -> list[ModelMessage]:
    return [ModelRequest(parts=[UserPromptPart(text)])]


def verdict_agent(model: Model) -> Agent[None, Verdict]:
    return Agent(model, output_type=ToolOutput(Verdict, strict=True))


VERDICT_SCRIPT: Final = tool_script("final_result", '{"answer": "hel', 'lo", "score": 7}')


async def run_streamed(agent: Agent[None, Verdict], text: str) -> tuple[Verdict, list[StreamEvent]]:
    events: list[StreamEvent] = []

    async def handler(_: RunContext[None], stream: AsyncIterable[AgentStreamEvent]) -> None:
        async for event in stream:
            if isinstance(event, MODEL_EVENTS):
                events.append(event)

    result = await agent.run(text, event_stream_handler=handler)
    return result.output, events


def test_chain_order_is_fixed() -> None:
    model = guarded(ScriptedModel([text_script("hi")]), policy())

    assert chain_links(model) == CHAIN_ORDER


def test_plain_request_goes_through_request_stream() -> None:
    inner = ScriptedModel([VERDICT_SCRIPT])
    result = asyncio.run(verdict_agent(guarded(inner, policy())).run("judge"))

    assert result.output == Verdict(answer="hello", score=7)
    assert inner.streams == 1


def test_deltas_reach_the_consumer_before_the_model_finishes() -> None:
    first_delta_seen = asyncio.Event()
    script = Script(chunks=(Chunk(text="Hel"), Chunk(text="lo", gate=first_delta_seen)))
    inner = ScriptedModel([script])
    model = guarded(inner, policy())

    async def consume() -> list[str]:
        async with model.request_stream(prompt("hi"), None, ModelRequestParameters()) as stream:
            texts: list[str] = []
            async for event in stream:
                texts.append(delta_text(event))
                first_delta_seen.set()
            return texts

    texts = asyncio.run(consume())

    assert "Hel" in texts
    assert "lo" in texts


def delta_text(event: object) -> str:
    if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
        return event.part.content
    if isinstance(event, PartDeltaEvent):
        return str(getattr(event.delta, "content_delta", ""))
    return ""


def test_truncated_stream_raises_after_the_deltas() -> None:
    inner = ScriptedModel([tool_script("final_result", '{"answer": "cut', finish_reason="length")])
    agent = verdict_agent(guarded(inner, policy()))

    with pytest.raises(TruncatedOutput) as raised:
        asyncio.run(agent.run("judge", model_settings=ModelSettings(max_tokens=16)))

    assert raised.value.max_tokens == 16
    assert inner.streams == 1


def test_refusal_is_not_retried() -> None:
    inner = ScriptedModel([text_script("I cannot help", finish_reason="content_filter")])
    agent = verdict_agent(guarded(inner, policy()))

    with pytest.raises(RefusedOutput):
        asyncio.run(agent.run("judge"))

    assert inner.streams == 1


def test_record_then_replay_strict_streams_the_same_events(tmp_path: Path) -> None:
    store = DirectoryCassetteStore(tmp_path)
    address = node_address("judge")
    recorded_log = UsageLog()
    with call_site(address, 1):
        live_output, live_events = asyncio.run(
            run_streamed(
                verdict_agent(
                    guarded(
                        ScriptedModel([VERDICT_SCRIPT]), policy(store, CassetteMode.RECORD, usage_sink=recorded_log)
                    )
                ),
                "judge",
            )
        )
    replay_log = UsageLog()
    with override_allow_model_requests(False), call_site(address, 1):
        replay_agent = verdict_agent(
            guarded(FailingModel(), policy(store, CassetteMode.REPLAY_STRICT, usage_sink=replay_log))
        )
        replay_output, replay_events = asyncio.run(run_streamed(replay_agent, "judge"))

    assert replay_output == live_output
    assert [type(event) for event in replay_events] == [type(event) for event in live_events]
    assert sum(isinstance(event, PartDeltaEvent) for event in replay_events) == 1
    assert list((tmp_path / "judge").glob("*.json"))
    assert [entry.source for entry in recorded_log.entries] == ["live"]
    assert [entry.source for entry in replay_log.entries] == ["replay"]
    assert replay_log.total_cost() == Decimal(0)


def test_replay_is_free_and_marks_the_hit() -> None:
    store = MemoryCassetteStore()
    model = guarded(ScriptedModel([text_script("hello")]), policy(store, CassetteMode.RECORD))
    asyncio.run(model.request(prompt("hi"), None, ModelRequestParameters()))
    replayed = guarded(FailingModel(), policy(store, CassetteMode.REPLAY_STRICT))

    response = asyncio.run(replayed.request(prompt("hi"), None, ModelRequestParameters()))

    assert response.usage == RequestUsage()
    assert (response.metadata or {})["aqven.cassette"]["usage"]["input_tokens"] == 10
    assert response.parts == [TextPart("hello")]


def test_replay_of_a_truncated_recording_is_truncated_again() -> None:
    store = MemoryCassetteStore()
    recorder = guarded(ScriptedModel([text_script("cut", finish_reason="length")]), policy(store, CassetteMode.RECORD))
    with pytest.raises(TruncatedOutput):
        asyncio.run(recorder.request(prompt("hi"), None, ModelRequestParameters()))
    replayer = guarded(FailingModel(), policy(store, CassetteMode.REPLAY_STRICT))

    with pytest.raises(TruncatedOutput):
        asyncio.run(replayer.request(prompt("hi"), None, ModelRequestParameters()))


def test_replay_strict_misses_on_another_prompt_or_attempt() -> None:
    store = MemoryCassetteStore()
    with call_site(node_address("judge"), 1):
        asyncio.run(
            guarded(ScriptedModel([text_script("hello")]), policy(store, CassetteMode.RECORD)).request(
                prompt("hi"), None, ModelRequestParameters()
            )
        )
    replayer = guarded(FailingModel(), policy(store, CassetteMode.REPLAY_STRICT))

    with call_site(node_address("judge"), 1), pytest.raises(CassetteMiss):
        asyncio.run(replayer.request(prompt("other"), None, ModelRequestParameters()))
    with call_site(node_address("judge"), 2), pytest.raises(CassetteMiss):
        asyncio.run(replayer.request(prompt("hi"), None, ModelRequestParameters()))


def test_two_different_answers_for_one_key_are_ambiguous() -> None:
    call_policy = policy(MemoryCassetteStore(), CassetteMode.RECORD)
    model = guarded(ScriptedModel([text_script("one"), text_script("two")]), call_policy)

    asyncio.run(model.request(prompt("hi"), None, ModelRequestParameters()))
    with pytest.raises(AmbiguousReplay):
        asyncio.run(model.request(prompt("hi"), None, ModelRequestParameters()))


def test_cassette_key_ignores_the_provider_model(tmp_path: Path) -> None:
    store = DirectoryCassetteStore(tmp_path)
    asyncio.run(
        verdict_agent(guarded(ScriptedModel([VERDICT_SCRIPT]), policy(store, CassetteMode.RECORD))).run("judge")
    )
    replay = verdict_agent(guarded(FailingModel(), policy(store, CassetteMode.REPLAY_STRICT)))

    assert asyncio.run(replay.run("judge")).output == Verdict(answer="hello", score=7)


def test_field_order_changes_the_cassette_key() -> None:
    class Reordered(BaseModel):
        score: int
        answer: str

    store = MemoryCassetteStore()
    asyncio.run(
        verdict_agent(guarded(ScriptedModel([VERDICT_SCRIPT]), policy(store, CassetteMode.RECORD))).run("judge")
    )
    reordered = Agent(
        guarded(FailingModel(), policy(store, CassetteMode.REPLAY_STRICT)), output_type=ToolOutput(Reordered)
    )

    with pytest.raises(CassetteMiss):
        asyncio.run(reordered.run("judge"))


def test_secrets_are_scrubbed_from_cassette_files(tmp_path: Path) -> None:
    secret = SecretStr("sk-or-v1-supersecretvalue")
    base = policy(DirectoryCassetteStore(tmp_path), CassetteMode.RECORD)
    call_policy = CallPolicy(
        cassettes=CassettePolicy(store=base.cassettes.store, behavior=base.cassettes.behavior, secrets=(secret,)),
        backoff=NO_WAIT,
    )
    model = guarded(ScriptedModel([text_script("key is sk-or-v1-supersecretvalue")]), call_policy)

    asyncio.run(model.request(prompt("hi"), None, ModelRequestParameters()))
    written = "".join(path.read_text() for path in tmp_path.rglob("*.json"))

    assert "supersecretvalue" not in written
    assert "<secret>" in written


def test_redaction_rewrites_the_wire_and_the_recorded_answer(tmp_path: Path) -> None:
    redaction = RedactionPolicy(redactor=PatternRedactor(["email"]), redact_responses=True)
    inner = ScriptedModel([text_script("write to ", "bob@example.com", " today")])
    store = DirectoryCassetteStore(tmp_path)
    base = policy(store, CassetteMode.RECORD, redaction=redaction)
    call_policy = CallPolicy(
        cassettes=CassettePolicy(store=store, behavior=base.cassettes.behavior, redaction=redaction),
        redaction=redaction,
        backoff=NO_WAIT,
    )

    response = asyncio.run(
        guarded(inner, call_policy).request(prompt("mail alice@example.com"), None, ModelRequestParameters())
    )
    wire = str(inner.seen[0])
    written = "".join(path.read_text() for path in tmp_path.rglob("*.json"))

    assert "alice@example.com" not in wire
    assert "<EMAIL>" in wire
    assert response.parts == [TextPart("write to <EMAIL> today")]
    assert "bob@example.com" not in written


def test_budget_stops_before_the_request_over_limit() -> None:
    budget = UsageBudget(limits=UsageLimits(request_limit=1))
    model = guarded(ScriptedModel([text_script("one")]), policy(budget=budget))
    asyncio.run(model.request(prompt("a"), None, ModelRequestParameters()))

    with pytest.raises(UsageLimitExceeded):
        asyncio.run(model.request(prompt("b"), None, ModelRequestParameters()))

    assert budget.ledger.requests == 1


def test_cost_limit_uses_provider_cost_after_the_response() -> None:
    budget = UsageBudget(limits=UsageLimits(request_limit=None, cost_limit=Decimal("0.001")))
    log = UsageLog()
    expensive = Script(chunks=(Chunk(text="x"),), provider_details={"cost": 0.002})
    model = guarded(ScriptedModel([expensive]), policy(budget=budget, usage_sink=log))

    with pytest.raises(UsageLimitExceeded):
        asyncio.run(model.request(prompt("a"), None, ModelRequestParameters()))

    assert log.entries[0].cost == Decimal("0.002")
    assert log.entries[0].usage.input_tokens == 10


def test_concurrency_limiter_serializes_requests() -> None:
    limiter = ConcurrencyLimiter(max_running=1)
    gate = asyncio.Event()
    inner = ScriptedModel([Script(chunks=(Chunk(text="a"), Chunk(text="b", gate=gate)))])
    model = guarded(inner, policy(concurrency=limiter))

    async def scenario() -> tuple[int, int]:
        first = asyncio.create_task(model.request(prompt("a"), None, ModelRequestParameters()))
        await asyncio.sleep(0.05)
        second = asyncio.create_task(model.request(prompt("b"), None, ModelRequestParameters()))
        await asyncio.sleep(0.05)
        opened_while_blocked = inner.opens
        gate.set()
        await asyncio.gather(first, second)
        return opened_while_blocked, inner.opens

    assert asyncio.run(scenario()) == (1, 2)


def test_backoff_retries_transient_errors_with_retry_after() -> None:
    sleeps: list[float] = []

    async def sleep(seconds: float) -> None:
        sleeps.append(seconds)

    errors: list[Exception] = [
        ModelHTTPError(429, "m", headers={"Retry-After": "2"}),
        ModelAPIError("m", "connection reset"),
    ]
    inner = ScriptedModel([text_script("ok")], open_errors=errors)
    call_policy = CallPolicy(cassettes=cassettes(MemoryCassetteStore(), None), backoff=NO_WAIT, backoff_sleep=sleep)

    response = asyncio.run(guarded(inner, call_policy).request(prompt("a"), None, ModelRequestParameters()))

    assert response.parts == [TextPart("ok")]
    assert inner.opens == 3
    assert sleeps == [2.0, 0.0]


def test_backoff_does_not_retry_client_errors() -> None:
    inner = ScriptedModel([text_script("ok")], open_errors=[ModelHTTPError(400, "m")])

    with pytest.raises(ModelHTTPError):
        asyncio.run(guarded(inner, policy()).request(prompt("a"), None, ModelRequestParameters()))

    assert inner.opens == 1


def test_backoff_gives_up_after_the_policy_attempts() -> None:
    errors: list[Exception] = [ModelHTTPError(503, "m") for _ in range(5)]
    inner = ScriptedModel([text_script("ok")], open_errors=errors)

    with pytest.raises(ModelHTTPError):
        asyncio.run(guarded(inner, policy()).request(prompt("a"), None, ModelRequestParameters()))

    assert inner.opens == NO_WAIT.attempts


def test_cassette_policy_from_run_options(tmp_path: Path) -> None:
    replay = cassette_policy(CassetteConfig(directory=tmp_path, mode=CassetteMode.REPLAY_STRICT))
    live = cassette_policy(None)

    assert replay.behavior.strict
    assert isinstance(replay.store, DirectoryCassetteStore)
    assert live.behavior == LIVE_BEHAVIOR


class RecordingFactory:
    def __init__(self) -> None:
        self.keys: list[SecretStr] = []

    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr) -> Model:
        self.keys.append(api_key)
        return ScriptedModel([text_script(f"answer with {api_key.get_secret_value()}")])


def test_guarded_factory_resolves_keys_project_first_and_scrubs_them(tmp_path: Path) -> None:
    settings = MemorySettings()
    key = provider_key_setting(ProviderName.OPENROUTER)
    settings.secrets[("studio", key)] = SecretStr("studio-key-0000000000")
    settings.secrets[("project", key)] = SecretStr("project-key-000000000")
    factory = RecordingFactory()
    resolver = ProviderKeyResolver(settings, {})
    guarded_factory = GuardedModelFactory(factory, resolver)
    call_policy = CallPolicy(
        cassettes=cassettes(DirectoryCassetteStore(tmp_path), CassetteMode.RECORD), backoff=NO_WAIT
    )

    model = asyncio.run(guarded_factory.build(MODEL_REF, settings=None, policy=call_policy))
    asyncio.run(model.request(prompt("hi"), None, ModelRequestParameters()))
    written = "".join(path.read_text() for path in tmp_path.rglob("*.json"))

    assert [secret.get_secret_value() for secret in factory.keys] == ["project-key-000000000"]
    assert "project-key-000000000" not in written
    assert chain_links(model) == CHAIN_ORDER


def test_guarded_factory_falls_back_to_environment_and_reports_missing_keys() -> None:
    factory = RecordingFactory()
    with_env = GuardedModelFactory(factory, ProviderKeyResolver(MemorySettings(), {"OPENROUTER_API_KEY": "env-key"}))
    without_env = GuardedModelFactory(factory, ProviderKeyResolver(MemorySettings(), {}))
    call_policy = policy()

    asyncio.run(with_env.build(MODEL_REF, settings=None, policy=call_policy))
    with pytest.raises(MissingProviderKey):
        asyncio.run(without_env.build(MODEL_REF, settings=None, policy=call_policy))

    assert factory.keys[0].get_secret_value() == "env-key"


def test_response_is_a_model_response() -> None:
    response = asyncio.run(
        guarded(ScriptedModel([text_script("x")]), policy()).request(prompt("a"), None, ModelRequestParameters())
    )

    assert isinstance(response, ModelResponse)


def test_cassette_key_ignores_generated_tool_call_ids() -> None:
    def history(call_id: str) -> list[ModelMessage]:
        return [
            ModelRequest(parts=[UserPromptPart(content="question")]),
            ModelResponse(parts=[TextPart(content="{}")]),
            ModelRequest(parts=[RetryPromptPart(content="repeat", tool_call_id=call_id)]),
        ]

    parameters = ModelRequestParameters()
    first = request_key(canonical_request("openrouter:mistralai/mistral-nemo", history("pyd_ai_1"), None, parameters))
    second = request_key(canonical_request("openrouter:mistralai/mistral-nemo", history("pyd_ai_2"), None, parameters))

    assert first == second
