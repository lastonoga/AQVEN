import asyncio
import base64
import json
from collections.abc import AsyncIterable, Mapping, Sequence
from pathlib import Path
from typing import Final

import httpx2
from models_support import FailingModel, MemorySettings
from pydantic import BaseModel, JsonValue
from pydantic_ai import Agent, AgentStreamEvent, RunContext, ToolOutput
from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, PartDeltaEvent, SpeechPart, UserPromptPart
from pydantic_ai.models import Model, override_allow_model_requests
from pydantic_ai.settings import ModelSettings

from aqven.models import (
    CallPolicy,
    CassettePolicy,
    DirectoryCassetteStore,
    GuardedModelFactory,
    ProviderKeyResolver,
    UsageLog,
    call_site,
    guard_model,
)
from aqven.models.backoff import BackoffPolicy
from aqven.models.cassette import CASSETTE_BEHAVIORS
from aqven.runtime import CassetteMode, node_address
from aqven_llm import PRIVATE_ROUTING, AudioOutput, MediaOutput, ModelOverride, ProviderModelFactory, ProviderOptions

MODEL: Final = "openrouter:openai/gpt-oss-20b"
KEY: Final = "sk-or-v1-offline-test-key-0001"


class Capital(BaseModel):
    city: str
    confidence: int


def chunk(delta: Mapping[str, JsonValue], finish: str | None = None) -> dict[str, JsonValue]:
    return {
        "id": "gen-offline",
        "object": "chat.completion.chunk",
        "created": 1_790_000_000,
        "model": "openai/gpt-oss-20b",
        "provider": "Mock",
        "choices": [{"index": 0, "delta": dict(delta), "finish_reason": finish, "native_finish_reason": finish}],
    }


def stream_body() -> bytes:
    start: JsonValue = {
        "index": 0,
        "id": "call_1",
        "type": "function",
        "function": {"name": "final_result", "arguments": '{"city": "Pa'},
    }
    rest: JsonValue = {"index": 0, "function": {"arguments": 'ris", "confidence": 9}'}}
    usage: JsonValue = {"prompt_tokens": 50, "completion_tokens": 14, "total_tokens": 64, "cost": 0.00002}
    chunks: Sequence[JsonValue] = [
        chunk({"role": "assistant", "reasoning": "thinking about France"}),
        chunk({"tool_calls": [start]}),
        chunk({"tool_calls": [rest]}),
        chunk({}, "tool_calls"),
        {**chunk({"content": "", "role": "assistant"}, "tool_calls"), "usage": usage},
    ]
    return ("".join(f"data: {json.dumps(item)}\n\n" for item in chunks) + "data: [DONE]\n\n").encode()


class Wire:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.calls += 1
        return httpx2.Response(200, content=stream_body(), headers={"content-type": "text/event-stream"})

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self))


async def run_agent(agent: Agent[None, Capital]) -> tuple[Capital, int]:
    deltas = 0

    async def handler(_: RunContext[None], stream: AsyncIterable[AgentStreamEvent]) -> None:
        nonlocal deltas
        async for event in stream:
            deltas += isinstance(event, PartDeltaEvent)

    result = await agent.run("Capital of France?", event_stream_handler=handler)
    return result.output, deltas


def test_openrouter_record_then_replay_without_network(tmp_path: Path) -> None:
    wire = Wire()
    providers = ProviderModelFactory(
        providers={"openrouter": ProviderOptions(routing=PRIVATE_ROUTING)}, http_client=wire.client
    )
    factory = GuardedModelFactory(providers, ProviderKeyResolver(MemorySettings(), {"OPENROUTER_API_KEY": KEY}))
    store = DirectoryCassetteStore(tmp_path)
    log = UsageLog()
    record_policy = CallPolicy(
        cassettes=CassettePolicy(store=store, behavior=CASSETTE_BEHAVIORS[CassetteMode.RECORD]),
        backoff=BackoffPolicy(attempts=1),
        usage_sink=log,
    )
    address = node_address("capital")

    async def record() -> tuple[Capital, int]:
        model = await factory.build(MODEL, settings=ModelSettings(max_tokens=128), policy=record_policy)
        return await run_agent(Agent(model, output_type=ToolOutput(Capital, strict=True)))

    with call_site(address, 1):
        recorded, recorded_deltas = asyncio.run(record())
    replay_policy = CallPolicy(
        cassettes=CassettePolicy(store=store, behavior=CASSETTE_BEHAVIORS[CassetteMode.REPLAY_STRICT])
    )
    replay_model = guard_model(FailingModel(), model_ref=MODEL, policy=replay_policy)
    with override_allow_model_requests(False), call_site(address, 1):
        replayed, replayed_deltas = asyncio.run(
            run_agent(
                Agent(
                    replay_model,
                    output_type=ToolOutput(Capital, strict=True),
                    model_settings=ModelSettings(max_tokens=128),
                )
            )
        )
    written = "".join(path.read_text() for path in tmp_path.rglob("*.json"))

    assert recorded == Capital(city="Paris", confidence=9)
    assert replayed == recorded
    assert wire.calls == 1
    assert replayed_deltas == recorded_deltas
    assert recorded_deltas >= 1
    assert KEY not in written
    assert "thinking about France" in written
    assert (str(log.entries[0].cost), log.entries[0].cost_source) == ("0.00002", "provider")
    assert log.entries[0].usage.input_tokens == 50


def speech_body() -> bytes:
    first = base64.b64encode(b"\x10\x20\x30").decode()
    second = base64.b64encode(b"\x40\x50").decode()
    chunks: Sequence[JsonValue] = [
        chunk({"role": "assistant", "audio": {"id": "a1", "data": first, "transcript": "hel"}}),
        chunk({"audio": {"data": second, "transcript": "lo"}}),
        chunk({}, "stop"),
    ]
    return ("".join(f"data: {json.dumps(item)}\n\n" for item in chunks) + "data: [DONE]\n\n").encode()


def test_speech_recording_replays_the_same_audio(tmp_path: Path) -> None:
    wire_calls = [0]

    def speech_wire(request: httpx2.Request) -> httpx2.Response:
        wire_calls[0] += 1
        return httpx2.Response(200, content=speech_body(), headers={"content-type": "text/event-stream"})

    speech_model = "openrouter:openai/gpt-audio-mini"
    providers = ProviderModelFactory(
        overrides={speech_model: ModelOverride(media=MediaOutput(audio=AudioOutput()))},
        http_client=lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(speech_wire)),
    )
    factory = GuardedModelFactory(providers, ProviderKeyResolver(MemorySettings(), {"OPENROUTER_API_KEY": KEY}))
    store = DirectoryCassetteStore(tmp_path)
    request: list[ModelMessage] = [ModelRequest(parts=[UserPromptPart("say hello")])]

    async def run(model: Model) -> ModelResponse:
        async with model_request_stream(model, request) as stream:
            async for _ in stream:
                continue
            return stream.get()

    async def record() -> ModelResponse:
        policy = CallPolicy(cassettes=CassettePolicy(store=store, behavior=CASSETTE_BEHAVIORS[CassetteMode.RECORD]))
        return await run(await factory.build(speech_model, settings=None, policy=policy))

    live = asyncio.run(record())

    async def replay() -> ModelResponse:
        policy = CallPolicy(
            cassettes=CassettePolicy(store=store, behavior=CASSETTE_BEHAVIORS[CassetteMode.REPLAY_STRICT])
        )
        return await run(await factory.build(speech_model, settings=None, policy=policy))

    calls_after_record = wire_calls[0]
    with override_allow_model_requests(False):
        replayed = asyncio.run(replay())
    live_speech = [part for part in live.parts if isinstance(part, SpeechPart)]
    replayed_speech = [part for part in replayed.parts if isinstance(part, SpeechPart)]

    assert live_speech[0].audio is not None
    assert live_speech[0].audio.data == b"\x10\x20\x30\x40\x50"
    assert replayed_speech == live_speech
    assert wire_calls[0] == calls_after_record == 1
