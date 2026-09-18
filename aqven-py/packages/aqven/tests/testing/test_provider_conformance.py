import asyncio
import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Final

import httpx2
from echo_provider import FailingEcho, build_model
from pydantic import JsonValue, SecretStr
from pydantic_ai.models import Model

from aqven.testing import AdapterCase, AdapterNotConformant, FailingTransport, check_adapter
from aqven_llm import OPENAI_COMPATIBLE, ProviderContext, ProviderModelFactory, ProviderOptions

ECHO_MODEL: Final = "echo:tiny-1"
LOCAL_MODEL: Final = "local:qwen-tiny"
LOCAL_URL: Final = "http://127.0.0.1:8000/v1"
LOCAL_KEY: Final = SecretStr("sk-local-000000000000")
USAGE: Final[dict[str, JsonValue]] = {"prompt_tokens": 18, "completion_tokens": 7, "total_tokens": 25}
TEXT_PARTS: Final = ("The sea ", "is calm ", "today.")
TOOL_ARGUMENTS: Final = ('{"label": "broken lamp", ', '"rating": 4}')
FAULT_STATUS: Final = 500
SCHEMA_MARKER: Final = "rating"


def chunk(delta: dict[str, JsonValue], finish: str | None = None, **extra: JsonValue) -> dict[str, JsonValue]:
    return {
        "id": "gen-1",
        "object": "chat.completion.chunk",
        "created": 1_790_000_000,
        "model": "qwen-tiny",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
        **extra,
    }


def sse(chunks: Sequence[dict[str, JsonValue]]) -> bytes:
    return ("".join(f"data: {json.dumps(item)}\n\n" for item in chunks) + "data: [DONE]\n\n").encode()


def text_stream() -> bytes:
    deltas = [chunk({"role": "assistant", "content": part}) for part in TEXT_PARTS]
    return sse([*deltas, chunk({}, "stop", usage=USAGE)])


def json_stream() -> bytes:
    deltas = [chunk({"role": "assistant", "content": part}) for part in TOOL_ARGUMENTS]
    return sse([*deltas, chunk({}, "stop", usage=USAGE)])


def tool_stream() -> bytes:
    head: dict[str, JsonValue] = {
        "index": 0,
        "id": "call_1",
        "type": "function",
        "function": {"name": "final_result", "arguments": TOOL_ARGUMENTS[0]},
    }
    tail: dict[str, JsonValue] = {"index": 0, "function": {"arguments": TOOL_ARGUMENTS[1]}}
    return sse(
        [
            chunk({"role": "assistant", "tool_calls": [head]}),
            chunk({"tool_calls": [tail]}),
            chunk({}, "tool_calls", usage=USAGE),
        ]
    )


@dataclass(slots=True)
class LocalServer:
    status: int = 200
    requests: list[httpx2.Request] = field(default_factory=list[httpx2.Request])

    def attempts(self) -> int:
        return len(self.requests)

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx2.Response(self.status, json={"error": "broken"})
        body: dict[str, JsonValue] = json.loads(request.content)
        return httpx2.Response(200, content=_reply(body), headers={"content-type": "text/event-stream"})

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self))

    def model(self) -> Model:
        options = ProviderOptions(factory=OPENAI_COMPATIBLE, base_url=LOCAL_URL)
        factory = ProviderModelFactory(providers={"local": options}, http_client=self.client, environ={})
        return factory.build(LOCAL_MODEL, settings=None, api_key=LOCAL_KEY)


def _reply(body: dict[str, JsonValue]) -> bytes:
    if body.get("tools"):
        return tool_stream()
    if SCHEMA_MARKER in json.dumps(body):
        return json_stream()
    return text_stream()


def echo_model() -> Model:
    return build_model("tiny-1", ProviderContext(provider="echo", http_client=httpx2.AsyncClient()))


def echo_case() -> AdapterCase:
    failing = FailingEcho()
    return AdapterCase(
        build=echo_model,
        model=ECHO_MODEL,
        failing=FailingTransport(build=failing.build, attempts=failing.attempts),
    )


def test_the_example_adapter_meets_the_contract() -> None:
    report = asyncio.run(check_adapter(echo_case()))

    assert report.ok, report.failures
    assert report.names() == (
        "text_stream",
        "structured_output:tool",
        "usage_reported",
        "cancellation",
        "no_internal_retries",
    )
    report.raise_for_failures()


def test_the_example_adapter_streams_text_and_reports_tokens() -> None:
    report = asyncio.run(check_adapter(echo_case()))
    checks = {check.name: check for check in report.checks}

    assert "deltas" in checks["text_stream"].detail
    assert "tokens" in checks["usage_reported"].detail


def test_an_openai_compatible_server_meets_the_contract_in_every_declared_mode() -> None:
    server = LocalServer()
    failing = LocalServer(status=FAULT_STATUS)
    case = AdapterCase(
        build=server.model,
        model=LOCAL_MODEL,
        modes=("tool", "prompted"),
        failing=FailingTransport(build=failing.model, attempts=failing.attempts),
    )

    report = asyncio.run(check_adapter(case))

    assert report.ok, report.failures
    assert "structured_output:prompted" in report.names()
    assert failing.attempts() == 1


def test_a_failing_report_names_the_broken_check() -> None:
    server = LocalServer()
    retried = LocalServer(status=FAULT_STATUS)
    case = AdapterCase(
        build=server.model,
        model=LOCAL_MODEL,
        failing=FailingTransport(build=retried.model, attempts=lambda: 3),
    )

    report = asyncio.run(check_adapter(case))

    assert not report.ok
    assert [check.name for check in report.failures] == ["no_internal_retries"]
    try:
        report.raise_for_failures()
    except AdapterNotConformant as error:
        assert "reached the transport 3 times" in str(error)
