import asyncio
import json
from collections.abc import Callable, Mapping, Sequence
from typing import Final

import httpx2
import pytest
from models_support import LaneClock, MemorySettings
from pydantic import JsonValue
from pydantic_ai.direct import model_request_stream
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model

from aqven.models import (
    LIVE_BEHAVIOR,
    CallPolicy,
    CassettePolicy,
    GuardedModelFactory,
    MemoryCassetteStore,
    ProviderKeyResolver,
    is_transient,
)
from aqven.models.backoff import BackoffPolicy
from aqven.models.lanes import ModelLane
from aqven_llm import ProviderModelFactory

MODEL: Final = "openrouter:openai/gpt-oss-20b"
KEY: Final = "sk-or-v1-offline-backoff-key"
RETRY_AFTER: Final = {"retry-after": "2"}
SSE_HEADERS: Final = {"content-type": "text/event-stream"}

type Handler = Callable[[httpx2.Request], httpx2.Response]


def chunk(delta: Mapping[str, JsonValue], finish: str | None = None) -> dict[str, JsonValue]:
    return {
        "id": "gen-backoff",
        "object": "chat.completion.chunk",
        "created": 1_790_000_000,
        "model": "openai/gpt-oss-20b",
        "provider": "Mock",
        "choices": [{"index": 0, "delta": dict(delta), "finish_reason": finish, "native_finish_reason": finish}],
    }


def sse(items: Sequence[JsonValue]) -> bytes:
    return ("".join(f"data: {json.dumps(item)}\n\n" for item in items) + "data: [DONE]\n\n").encode()


def good_body() -> bytes:
    return sse(
        [
            chunk({"role": "assistant", "content": "he"}),
            chunk({"content": "llo"}),
            chunk({}, "stop"),
        ]
    )


def error_envelope(code: int) -> JsonValue:
    return {"error": {"code": code, "message": f"provider returned {code}"}}


def opening_error_body(code: int) -> bytes:
    return sse([error_envelope(code)])


def mid_stream_error_body(code: int) -> bytes:
    return sse([chunk({"role": "assistant", "content": "partial"}), error_envelope(code)])


class Wire:
    def __init__(self, responses: Sequence[Handler]) -> None:
        self.responses = list(responses)
        self.calls = 0

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        handler = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        return handler(request)

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self))


def status(code: int, headers: Mapping[str, str] | None = None) -> Handler:
    return lambda request: httpx2.Response(code, json=error_envelope(code), headers=dict(headers or {}))


def stream(body: bytes) -> Handler:
    return lambda request: httpx2.Response(200, content=body, headers=SSE_HEADERS)


def reset() -> Handler:
    def raise_reset(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadError("connection reset by peer")

    return raise_reset


class Sleeper:
    def __init__(self) -> None:
        self.seconds: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.seconds.append(seconds)


def policy(
    sleeper: Sleeper, *, attempts: int = 4, budget_seconds: float = 20.0, lane: ModelLane | None = None
) -> CallPolicy:
    return CallPolicy(
        cassettes=CassettePolicy(store=MemoryCassetteStore(), behavior=LIVE_BEHAVIOR),
        backoff=BackoffPolicy(
            attempts=attempts, initial_seconds=0.0, jitter_seconds=0.0, budget_seconds=budget_seconds
        ),
        backoff_sleep=sleeper,
        lane=lane,
    )


async def build(wire: Wire, call_policy: CallPolicy) -> Model:
    providers = ProviderModelFactory(http_client=wire.client)
    factory = GuardedModelFactory(providers, ProviderKeyResolver(MemorySettings(), {"OPENROUTER_API_KEY": KEY}))
    return await factory.build(MODEL, settings=None, policy=call_policy)


def prompt() -> list[ModelMessage]:
    return [ModelRequest(parts=[UserPromptPart("say hello")])]


async def drain(model: Model) -> tuple[ModelResponse, int]:
    events = 0
    async with model_request_stream(model, prompt()) as opened:
        async for _ in opened:
            events += 1
        return opened.get(), events


def run(wire: Wire, call_policy: CallPolicy) -> tuple[ModelResponse, int]:
    async def scenario() -> tuple[ModelResponse, int]:
        return await drain(await build(wire, call_policy))

    return asyncio.run(scenario())


def text_of(response: ModelResponse) -> str:
    return "".join(part.content for part in response.parts if isinstance(part, TextPart))


def test_status_429_pauses_the_lane_for_the_retry_after_and_is_retried_until_the_stream_opens() -> None:
    wire = Wire([status(429, RETRY_AFTER), status(429, RETRY_AFTER), stream(good_body())])
    sleeper = Sleeper()
    clock = LaneClock()
    lane = ModelLane(MODEL, clock=clock.time, sleep=clock.sleep)

    response, events = run(wire, policy(sleeper, lane=lane))

    assert text_of(response) == "hello"
    assert wire.calls == 3
    assert clock.waits == [2.0, 2.0]
    assert sleeper.seconds == [0.0, 0.0]
    assert events >= 2


def test_status_502_is_retried() -> None:
    wire = Wire([status(502), stream(good_body())])
    sleeper = Sleeper()

    response, _ = run(wire, policy(sleeper))

    assert text_of(response) == "hello"
    assert wire.calls == 2


def test_connection_reset_is_retried() -> None:
    wire = Wire([reset(), reset(), stream(good_body())])
    sleeper = Sleeper()

    response, _ = run(wire, policy(sleeper))

    assert text_of(response) == "hello"
    assert wire.calls == 3
    assert len(sleeper.seconds) == 2


def test_error_envelope_before_any_event_is_retried() -> None:
    wire = Wire([stream(opening_error_body(503)), stream(good_body())])
    sleeper = Sleeper()

    response, _ = run(wire, policy(sleeper))

    assert text_of(response) == "hello"
    assert wire.calls == 2


def test_error_after_events_were_delivered_discards_the_attempt() -> None:
    wire = Wire([stream(mid_stream_error_body(502)), stream(good_body())])
    sleeper = Sleeper()

    with pytest.raises(ModelHTTPError) as raised:
        run(wire, policy(sleeper))

    assert raised.value.status_code == 502
    assert wire.calls == 1
    assert sleeper.seconds == []


def test_client_error_is_not_retried() -> None:
    wire = Wire([status(400)])
    sleeper = Sleeper()

    with pytest.raises(ModelHTTPError) as raised:
        run(wire, policy(sleeper))

    assert raised.value.status_code == 400
    assert wire.calls == 1


def test_attempts_bound_the_retries() -> None:
    wire = Wire([status(503)])
    sleeper = Sleeper()

    with pytest.raises(ModelHTTPError):
        run(wire, policy(sleeper, attempts=3))

    assert wire.calls == 3


def test_a_spent_budget_stops_the_retries() -> None:
    wire = Wire([status(503)])
    sleeper = Sleeper()

    with pytest.raises(ModelHTTPError):
        run(wire, policy(sleeper, attempts=10, budget_seconds=0.0))

    assert wire.calls == 1


def test_transient_classification() -> None:
    assert is_transient(ModelHTTPError(429, MODEL))
    assert is_transient(ModelHTTPError(503, MODEL))
    assert not is_transient(ModelHTTPError(404, MODEL))
    assert is_transient(httpx2.ConnectError("refused"))
    assert not is_transient(ValueError("unrelated"))


def no_completion_body() -> bytes:
    return sse([{"id": "gen-backoff", "object": "chat.completion.chunk", "created": 1, "model": "m", "choices": None}])


def test_a_first_chunk_without_a_completion_is_retried() -> None:
    wire = Wire([stream(no_completion_body()), stream(good_body())])
    sleeper = Sleeper()

    response, _ = run(wire, policy(sleeper))

    assert text_of(response) == "hello"
    assert wire.calls == 2
