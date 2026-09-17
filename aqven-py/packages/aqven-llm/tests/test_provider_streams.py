import asyncio
import importlib.util
import json
from collections.abc import AsyncIterable, Callable, Mapping
from dataclasses import dataclass
from typing import Final

import pytest
from llm_wire import (
    API_KEY,
    Recorder,
    chat_tool_stream,
    data_stream,
    event_stream,
    json_reply,
    local_server,
    plain_data_stream,
    prompt,
    sse_reply,
)
from pydantic import BaseModel, JsonValue
from pydantic_ai import Agent, AgentStreamEvent, RunContext, ToolOutput
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models import ModelRequestParameters

from aqven_llm import ProviderModelFactory, ProviderOptions

ANSWER_START: Final = '{"answer": "Pa'
ANSWER_END: Final = 'ris", "score": 9}'
ANSWER: Final[dict[str, JsonValue]] = {"answer": "Paris", "score": 9}
RATE_LIMITED: Final = json_reply(429, {"error": {"message": "slow down", "type": "rate_limit_error", "code": 429}})


class Verdict(BaseModel):
    answer: str
    score: int


def openai_responses_stream() -> bytes:
    item: dict[str, JsonValue] = {
        "type": "function_call",
        "id": "fc_1",
        "call_id": "call_1",
        "name": "final_result",
        "arguments": "",
        "status": "in_progress",
    }
    done: dict[str, JsonValue] = {**item, "arguments": ANSWER_START + ANSWER_END, "status": "completed"}
    response: dict[str, JsonValue] = {
        "id": "resp_1",
        "object": "response",
        "created_at": 1_790_000_000,
        "model": "gpt-5.4-mini",
        "status": "in_progress",
        "output": [],
        "parallel_tool_calls": True,
        "tool_choice": "required",
        "tools": [],
    }
    completed: dict[str, JsonValue] = {
        **response,
        "status": "completed",
        "output": [done],
        "usage": {
            "input_tokens": 40,
            "output_tokens": 12,
            "total_tokens": 52,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        },
    }
    events: list[tuple[str, JsonValue]] = [
        ("response.created", {"type": "response.created", "sequence_number": 0, "response": response}),
        (
            "response.output_item.added",
            {"type": "response.output_item.added", "sequence_number": 1, "output_index": 0, "item": item},
        ),
        (
            "response.function_call_arguments.delta",
            {
                "type": "response.function_call_arguments.delta",
                "sequence_number": 2,
                "item_id": "fc_1",
                "output_index": 0,
                "delta": ANSWER_START,
            },
        ),
        (
            "response.function_call_arguments.delta",
            {
                "type": "response.function_call_arguments.delta",
                "sequence_number": 3,
                "item_id": "fc_1",
                "output_index": 0,
                "delta": ANSWER_END,
            },
        ),
        (
            "response.output_item.done",
            {"type": "response.output_item.done", "sequence_number": 4, "output_index": 0, "item": done},
        ),
        ("response.completed", {"type": "response.completed", "sequence_number": 5, "response": completed}),
    ]
    return event_stream(events)


def anthropic_stream() -> bytes:
    message: dict[str, JsonValue] = {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5",
        "content": [],
        "stop_reason": None,
        "stop_sequence": None,
        "usage": {"input_tokens": 40, "output_tokens": 1},
    }
    events: list[tuple[str, JsonValue]] = [
        ("message_start", {"type": "message_start", "message": message}),
        (
            "content_block_start",
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "tool_use", "id": "toolu_1", "name": "final_result", "input": {}},
            },
        ),
        (
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "input_json_delta", "partial_json": ANSWER_START},
            },
        ),
        (
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "input_json_delta", "partial_json": ANSWER_END},
            },
        ),
        ("content_block_stop", {"type": "content_block_stop", "index": 0}),
        (
            "message_delta",
            {
                "type": "message_delta",
                "delta": {"stop_reason": "tool_use", "stop_sequence": None},
                "usage": {"output_tokens": 12},
            },
        ),
        ("message_stop", {"type": "message_stop"}),
    ]
    return event_stream(events)


def google_stream() -> bytes:
    chunk: dict[str, JsonValue] = {
        "candidates": [
            {
                "content": {"role": "model", "parts": [{"functionCall": {"name": "final_result", "args": ANSWER}}]},
                "finishReason": "STOP",
                "index": 0,
            }
        ],
        "usageMetadata": {"promptTokenCount": 40, "candidatesTokenCount": 12, "totalTokenCount": 52},
        "modelVersion": "gemini-3.8-flash",
        "responseId": "resp_1",
    }
    return plain_data_stream([chunk])


def mistral_stream() -> bytes:
    call: dict[str, JsonValue] = {
        "id": "call00001",
        "type": "function",
        "index": 0,
        "function": {"name": "final_result", "arguments": json.dumps(ANSWER)},
    }
    chunk: dict[str, JsonValue] = {
        "id": "cmpl-1",
        "object": "chat.completion.chunk",
        "created": 1_790_000_000,
        "model": "mistral-small-latest",
        "choices": [
            {
                "index": 0,
                "delta": {"role": "assistant", "content": "", "tool_calls": [call]},
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {"prompt_tokens": 40, "completion_tokens": 12, "total_tokens": 52},
    }
    return data_stream([chunk])


def groq_stream() -> bytes:
    chunks = chat_tool_stream()
    return data_stream(chunks)


type RequestBody = Mapping[str, JsonValue]


@dataclass(frozen=True, slots=True)
class StreamCase:
    model: str
    stream: Callable[[], bytes]
    url: str
    streamed: Callable[[RequestBody], bool]


def stream_flag(body: RequestBody) -> bool:
    return body.get("stream") is True


def any_body(_: RequestBody) -> bool:
    return True


OPENROUTER_CASE: Final = StreamCase(
    "openrouter:openai/gpt-oss-20b",
    lambda: data_stream(chat_tool_stream({"cost": 0.00001})),
    "https://openrouter.ai/api/v1/chat/completions",
    stream_flag,
)

HTTPX2_CASES: Final[Mapping[str, StreamCase]] = {
    "openrouter": OPENROUTER_CASE,
    "openai": StreamCase(
        "openai:gpt-5.4-mini", openai_responses_stream, "https://api.openai.com/v1/responses", stream_flag
    ),
    "openai-chat": StreamCase(
        "openai-chat:gpt-5.4-mini",
        lambda: data_stream(chat_tool_stream()),
        "https://api.openai.com/v1/chat/completions",
        stream_flag,
    ),
    "deepseek": StreamCase(
        "deepseek:deepseek-chat",
        lambda: data_stream(chat_tool_stream()),
        "https://api.deepseek.com/chat/completions",
        stream_flag,
    ),
    "anthropic": StreamCase(
        "anthropic:claude-sonnet-5", anthropic_stream, "https://api.anthropic.com/v1/messages?beta=true", stream_flag
    ),
    "google": StreamCase(
        "google:gemini-3.8-flash",
        google_stream,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
        any_body,
    ),
    "mistral": StreamCase(
        "mistral:mistral-small-latest", mistral_stream, "https://api.mistral.ai/v1/chat/completions#stream", stream_flag
    ),
}

SDK_MODULES: Final[Mapping[str, str]] = {"anthropic": "anthropic", "google": "google.genai", "mistral": "mistralai"}


def require_sdk(provider: str) -> None:
    module = SDK_MODULES.get(provider)
    if module is not None:
        require_module(module)


async def drain_events(_: RunContext[object], stream: AsyncIterable[AgentStreamEvent]) -> None:
    async for _event in stream:
        continue


def run_agent(factory: ProviderModelFactory, model: str) -> Verdict:
    agent = Agent(factory.build(model, settings=None, api_key=API_KEY), output_type=ToolOutput(Verdict))
    result = asyncio.run(agent.run("capital of France?", event_stream_handler=drain_events))
    return result.output


@pytest.mark.parametrize("provider", list(HTTPX2_CASES))
def test_structured_output_is_streamed(provider: str) -> None:
    require_sdk(provider)
    case = HTTPX2_CASES[provider]
    recorder = Recorder([sse_reply(case.stream())])

    output = run_agent(ProviderModelFactory(http_client=recorder.client, environ={}), case.model)

    assert output == Verdict(answer="Paris", score=9)
    assert len(recorder.requests) == 1
    assert str(recorder.requests[0].url) == case.url
    assert case.streamed(recorder.bodies()[0])


@pytest.mark.parametrize("provider", list(HTTPX2_CASES))
def test_rate_limit_makes_exactly_one_http_call(provider: str) -> None:
    require_sdk(provider)
    case = HTTPX2_CASES[provider]
    recorder = Recorder([RATE_LIMITED])
    built = ProviderModelFactory(http_client=recorder.client, environ={}).build(
        case.model, settings=None, api_key=API_KEY
    )

    async def open_stream() -> None:
        async with built.request_stream(prompt("hi"), None, ModelRequestParameters()) as stream:
            async for _ in stream:
                continue

    with pytest.raises(ModelHTTPError) as raised:
        asyncio.run(open_stream())

    assert raised.value.status_code == 429
    assert len(recorder.requests) == 1


@dataclass(frozen=True, slots=True)
class LocalCase:
    model: str
    module: str
    environ: Mapping[str, str]


LOCAL_CASES: Final[Mapping[str, LocalCase]] = {
    "groq": LocalCase("groq:llama-3.3-70b-versatile", "groq", {}),
    "bedrock": LocalCase(
        "bedrock:us.amazon.nova-micro-v1:0",
        "boto3",
        {
            "AWS_DEFAULT_REGION": "us-east-1",
            "AWS_ACCESS_KEY_ID": "AKIAOFFLINE000000000",
            "AWS_SECRET_ACCESS_KEY": "offline",
        },
    ),
    "huggingface": LocalCase("huggingface:meta-llama/Llama-3.3-70B-Instruct", "huggingface_hub", {}),
}


def local_factory(provider: str, base_url: str) -> ProviderModelFactory:
    return ProviderModelFactory(providers={provider: ProviderOptions(base_url=base_url)}, environ={})


def require_module(module: str) -> None:
    if importlib.util.find_spec(module) is None:
        pytest.skip(f"{module} is not installed")


def test_groq_streams_structured_output_through_its_own_client() -> None:
    require_module("groq")
    with local_server([sse_reply(groq_stream())]) as (base_url, log):
        output = run_agent(local_factory("groq", base_url), LOCAL_CASES["groq"].model)

    assert output == Verdict(answer="Paris", score=9)
    assert log.paths == ["/openai/v1/chat/completions"]
    assert json.loads(log.bodies[0])["stream"] is True


@pytest.mark.parametrize("provider", list(LOCAL_CASES))
def test_rate_limit_through_sdk_owned_clients_makes_one_http_call(
    provider: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = LOCAL_CASES[provider]
    require_module(case.module)
    for name, value in case.environ.items():
        monkeypatch.setenv(name, value)
    with local_server([RATE_LIMITED]) as (base_url, log):
        built = local_factory(provider, base_url).build(case.model, settings=None, api_key=API_KEY)

        async def open_stream() -> None:
            async with built.request_stream(prompt("hi"), None, ModelRequestParameters()) as stream:
                async for _ in stream:
                    continue

        with pytest.raises(ModelHTTPError) as raised:
            asyncio.run(open_stream())

    assert raised.value.status_code == 429
    assert len(log.paths) == 1
