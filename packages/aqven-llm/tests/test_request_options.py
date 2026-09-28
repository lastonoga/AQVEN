import asyncio
import importlib.util
import json
from collections.abc import Mapping
from typing import Final, Protocol

import pytest
from llm_wire import API_KEY, Recorder, chat_tool_stream, data_stream, json_reply, local_server, prompt, sse_reply
from pydantic import JsonValue
from pydantic_ai import Agent
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models import Model, ModelRequestParameters
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.settings import ModelSettings

from aqven_llm import (
    BEDROCK_OPTIONS,
    GOOGLE_OPTIONS,
    MISTRAL_OPTIONS,
    NO_REQUEST_OPTIONS,
    PROVIDERS,
    REQUEST_BODY,
    XAI_OPTIONS,
    MediaOutput,
    ModelOverride,
    NativeOptionsModel,
    OptionsRequest,
    ProviderModelFactory,
    ProviderOptions,
    native_settings,
)

RATE_LIMITED: Final = json_reply(429, {"error": {"message": "slow down", "type": "rate_limit_error", "code": 429}})
ADJUSTABLE: Final = ModelProfile(supports_thinking=True)
ALWAYS_ON: Final = ModelProfile(supports_thinking=True, thinking_always_enabled=True)
GOOGLE_MODEL: Final = "google:gemini-3.8-flash"
MISTRAL_MODEL: Final = "mistral:mistral-small-latest"
MAGISTRAL_MODEL: Final = "mistral:magistral-medium-latest"
BEDROCK_MODEL: Final = "bedrock:us.anthropic.claude-sonnet-5-v1:0"
XAI_MODEL: Final = "xai:grok-4.3"
AWS_OFFLINE: Final[Mapping[str, str]] = {
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "AKIAOFFLINE000000000",
    "AWS_SECRET_ACCESS_KEY": "offline",
}
PASSTHROUGH: Final = ("openai", "openai-chat", "openrouter", "anthropic", "groq", "huggingface", "ollama", "zai")


class ChatRequest(Protocol):
    user: str
    max_tokens: int

    def HasField(self, field_name: str) -> bool: ...


class ChatCaptured(Exception):
    def __init__(self, request: ChatRequest) -> None:
        super().__init__("chat request captured")
        self.request = request


def require_module(module: str) -> None:
    if importlib.util.find_spec(module) is None:
        pytest.skip(f"{module} is not installed")


def extra_body(options: Mapping[str, JsonValue]) -> ModelSettings:
    return ModelSettings(max_tokens=64, extra_body=dict(options))


def stream_once(model: Model, settings: ModelSettings | None) -> None:
    async def open_stream() -> None:
        async with model.request_stream(prompt("hi"), settings, ModelRequestParameters()) as stream:
            async for _ in stream:
                continue

    asyncio.run(open_stream())


def rate_limited_body(model: Model, settings: ModelSettings | None, recorder: Recorder) -> dict[str, JsonValue]:
    with pytest.raises(ModelHTTPError):
        stream_once(model, settings)
    return recorder.bodies()[0]


def recorded_factory(recorder: Recorder) -> ProviderModelFactory:
    return ProviderModelFactory(http_client=recorder.client, environ={})


@pytest.mark.parametrize("provider", PASSTHROUGH)
def test_providers_that_take_a_request_body_keep_extra_body(provider: str) -> None:
    assert PROVIDERS[provider].request_options is REQUEST_BODY


@pytest.mark.parametrize(
    ("provider", "delivery"),
    [
        ("google", GOOGLE_OPTIONS),
        ("mistral", MISTRAL_OPTIONS),
        ("xai", XAI_OPTIONS),
        ("bedrock", BEDROCK_OPTIONS),
        ("cohere", NO_REQUEST_OPTIONS),
    ],
)
def test_providers_without_a_request_body_route_the_options_natively(provider: str, delivery: object) -> None:
    assert PROVIDERS[provider].request_options is delivery


def test_google_maps_generate_content_fields_to_its_settings_and_names_the_rest() -> None:
    options: dict[str, JsonValue] = {
        "thinking_config": {"thinking_budget": 0},
        "safety_settings": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}],
        "top_k": 20,
        "logprobs": 3,
        "reasoning_effort": "low",
        "labels": {"team": "ops"},
    }

    split = GOOGLE_OPTIONS.split(OptionsRequest(options))

    assert split.native == {
        "google_thinking_config": {"thinking_budget": 0},
        "google_safety_settings": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}],
        "top_k": 20,
    }
    assert split.ignored == ("logprobs", "reasoning_effort", "labels")


def test_google_sends_top_logprobs_only_with_response_logprobs() -> None:
    split = GOOGLE_OPTIONS.split(OptionsRequest({"response_logprobs": True, "logprobs": 3}))

    assert split.native == {"google_logprobs": True, "google_top_logprobs": 3}
    assert split.ignored == ()


@pytest.mark.parametrize(
    ("effort", "profile", "native"),
    [
        ("none", ADJUSTABLE, {"thinking": False}),
        ("high", ADJUSTABLE, {"thinking": "high"}),
        ("low", ADJUSTABLE, {}),
        ("high", ALWAYS_ON, {}),
        ("high", ModelProfile(), {}),
    ],
)
def test_mistral_reasoning_effort_rides_the_unified_thinking_setting(
    effort: str, profile: ModelProfile, native: Mapping[str, JsonValue]
) -> None:
    split = MISTRAL_OPTIONS.split(OptionsRequest({"reasoning_effort": effort}, profile))

    assert split.native == native
    assert split.ignored == (() if native else ("reasoning_effort",))


def test_bedrock_puts_every_option_into_the_additional_model_request_fields() -> None:
    options: dict[str, JsonValue] = {"thinking": {"type": "enabled", "budget_tokens": 1024}, "top_k": 40}

    split = BEDROCK_OPTIONS.split(OptionsRequest(options))

    assert split.native == {"bedrock_additional_model_requests_fields": options}
    assert split.ignored == ()


def test_cohere_sends_no_option() -> None:
    split = NO_REQUEST_OPTIONS.split(OptionsRequest({"thinking": {"type": "disabled"}}))

    assert split.native == {}
    assert split.ignored == ("thinking",)


def test_native_settings_replace_the_extra_body_and_keep_the_other_settings() -> None:
    settings = ModelSettings(temperature=0.2, extra_body={"reasoning_effort": "low", "user": "u-1"})

    native = native_settings(XAI_OPTIONS, settings, ModelProfile())

    assert native == {"temperature": 0.2, "xai_reasoning_effort": "low", "xai_user": "u-1"}


def test_native_settings_leave_settings_without_options_alone() -> None:
    settings = ModelSettings(temperature=0.2)

    assert native_settings(GOOGLE_OPTIONS, settings, ModelProfile()) is settings
    assert native_settings(GOOGLE_OPTIONS, None, ModelProfile()) is None


def test_openai_chat_sends_the_options_in_the_request_body_unwrapped() -> None:
    recorder = Recorder([sse_reply(data_stream(chat_tool_stream()))])
    model = recorded_factory(recorder).build("openai-chat:gpt-5.4-mini", settings=None, api_key=API_KEY)

    stream_once(model, extra_body({"reasoning_effort": "minimal"}))

    assert not isinstance(model, NativeOptionsModel)
    assert recorder.bodies()[0]["reasoning_effort"] == "minimal"


def test_openrouter_image_output_keeps_its_modalities_next_to_the_agent_options() -> None:
    model_name = "openrouter:google/gemini-3.1-flash-lite-image"
    recorder = Recorder([RATE_LIMITED])
    overrides = {model_name: ModelOverride(media=MediaOutput(image=True))}
    factory = ProviderModelFactory(overrides=overrides, http_client=recorder.client, environ={})
    model = factory.build(model_name, settings=None, api_key=API_KEY)
    agent = Agent(model, model_settings=extra_body({"provider": {"require_parameters": True}}))

    with pytest.raises(ModelHTTPError):
        asyncio.run(agent.run("draw"))

    body = recorder.bodies()[0]
    assert body["modalities"] == ["image", "text"]
    assert body["provider"] == {"require_parameters": True}


def test_google_request_carries_the_thinking_config_and_generation_fields() -> None:
    require_module("google.genai")
    recorder = Recorder([RATE_LIMITED])
    model = recorded_factory(recorder).build(GOOGLE_MODEL, settings=None, api_key=API_KEY)
    options: dict[str, JsonValue] = {
        "thinking_config": {"thinking_budget": 0},
        "safety_settings": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}],
        "top_k": 20,
        "stop_sequences": ["END"],
        "reasoning_effort": "low",
    }

    body = rate_limited_body(model, extra_body(options), recorder)

    assert isinstance(model, NativeOptionsModel)
    assert body["generationConfig"] == {
        "maxOutputTokens": 64,
        "topK": 20.0,
        "stopSequences": ["END"],
        "thinkingConfig": {"thinking_budget": 0},
        "responseModalities": ["TEXT"],
    }
    assert body["safetySettings"] == [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}]
    assert "reasoning_effort" not in json.dumps(body)


def test_google_reads_options_given_at_build_time() -> None:
    require_module("google.genai")
    recorder = Recorder([RATE_LIMITED])
    settings = extra_body({"thinking_config": {"thinking_budget": 512}})
    model = recorded_factory(recorder).build(GOOGLE_MODEL, settings=settings, api_key=API_KEY)

    body = rate_limited_body(model, None, recorder)

    generation = body["generationConfig"]
    assert isinstance(generation, dict)
    assert generation["thinkingConfig"] == {"thinking_budget": 512}


def test_google_agent_run_carries_the_agent_options() -> None:
    require_module("google.genai")
    recorder = Recorder([RATE_LIMITED])
    model = recorded_factory(recorder).build(GOOGLE_MODEL, settings=None, api_key=API_KEY)
    agent = Agent(model, model_settings=extra_body({"thinking_config": {"thinking_budget": 0}}))

    with pytest.raises(ModelHTTPError):
        asyncio.run(agent.run("hi"))

    generation = recorder.bodies()[0]["generationConfig"]
    assert isinstance(generation, dict)
    assert generation["thinkingConfig"] == {"thinking_budget": 0}


@pytest.mark.parametrize(
    ("model_name", "sent_effort"),
    [(MISTRAL_MODEL, "none"), (MAGISTRAL_MODEL, None)],
)
def test_mistral_request_carries_the_options_it_takes(model_name: str, sent_effort: str | None) -> None:
    require_module("mistralai")
    recorder = Recorder([RATE_LIMITED])
    model = recorded_factory(recorder).build(model_name, settings=None, api_key=API_KEY)
    options: dict[str, JsonValue] = {"reasoning_effort": "none", "prompt_cache_key": "support", "stop": ["END"]}

    body = rate_limited_body(model, extra_body(options), recorder)

    assert body.get("reasoning_effort") == sent_effort
    assert body["prompt_cache_key"] == "support"
    assert body["stop"] == ["END"]


def test_bedrock_request_carries_the_additional_model_request_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    require_module("boto3")
    for name, value in AWS_OFFLINE.items():
        monkeypatch.setenv(name, value)
    options: dict[str, JsonValue] = {"thinking": {"type": "disabled"}, "anthropic_beta": ["context-1m-2025-08-07"]}
    with local_server([RATE_LIMITED]) as (base_url, log):
        factory = ProviderModelFactory(providers={"bedrock": ProviderOptions(base_url=base_url)}, environ={})
        model = factory.build(BEDROCK_MODEL, settings=None, api_key=API_KEY)
        with pytest.raises(ModelHTTPError):
            stream_once(model, extra_body(options))

    body = json.loads(log.bodies[0])
    assert body["additionalModelRequestFields"] == options
    assert body["inferenceConfig"] == {"maxTokens": 64}


def test_xai_request_carries_the_reasoning_effort_and_user(monkeypatch: pytest.MonkeyPatch) -> None:
    require_module("xai_sdk")
    model = ProviderModelFactory(environ={}).build(XAI_MODEL, settings=None, api_key=API_KEY)
    provider = model.provider
    assert provider is not None
    chat = provider.client.chat
    create = chat.create

    def captured(*args: object, **kwargs: object) -> None:
        raise ChatCaptured(create(*args, **kwargs).proto)

    monkeypatch.setattr(chat, "create", captured)
    options: dict[str, JsonValue] = {"reasoning_effort": "low", "user": "u-1", "search_parameters": {"mode": "on"}}

    with pytest.raises(ChatCaptured) as raised:
        stream_once(model, extra_body(options))

    request = raised.value.request
    assert (request.user, request.max_tokens) == ("u-1", 64)
    assert request.HasField("reasoning_effort")
    assert not request.HasField("search_parameters")
