import asyncio
import base64
from collections.abc import AsyncIterable, Mapping, Sequence
from typing import Final

import pytest
from llm_wire import API_KEY, Recorder, chat_chunk, chat_tool_stream, data_stream, prompt, sse_reply
from pydantic import BaseModel, JsonValue, SecretStr
from pydantic_ai import Agent, AgentStreamEvent, RunContext, ToolOutput
from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import FilePart, PartDeltaEvent, SpeechPart, SpeechPartDelta
from pydantic_ai.models import ModelRequestParameters
from pydantic_ai.settings import ModelSettings

from aqven_llm import (
    PRIVATE_ROUTING,
    AudioOutput,
    MediaOutput,
    MissingProviderKey,
    ModelOverride,
    ProviderKeys,
    ProviderMisconfigured,
    ProviderModelFactory,
    ProviderNoStreaming,
    ProviderOptions,
    ProviderUnavailable,
    UnknownProvider,
)

CHEAP_MODEL: Final = "openrouter:openai/gpt-oss-20b"
PNG_PIXEL: Final = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()


class Verdict(BaseModel):
    answer: str
    score: int


class StoredKeys:
    def __init__(self, keys: Mapping[str, str]) -> None:
        self.keys = keys

    async def provider_key(self, provider: str) -> SecretStr | None:
        value = self.keys.get(provider)
        return None if value is None else SecretStr(value)


def factory(
    recorder: Recorder,
    *,
    providers: Mapping[str, ProviderOptions] | None = None,
    overrides: Mapping[str, ModelOverride] | None = None,
    environ: Mapping[str, str] | None = None,
) -> ProviderModelFactory:
    return ProviderModelFactory(
        providers=providers, overrides=overrides, http_client=recorder.client, environ=environ or {}
    )


async def drain_events(_: RunContext[object], stream: AsyncIterable[AgentStreamEvent]) -> None:
    async for _event in stream:
        continue


def missing(_: str) -> bool:
    return False


def test_openrouter_streams_structured_output_with_private_routing() -> None:
    recorder = Recorder([sse_reply(data_stream(chat_tool_stream({"cost": 0.00001})))])
    models = factory(recorder, providers={"openrouter": ProviderOptions(routing=PRIVATE_ROUTING)})
    agent = Agent(
        models.build(CHEAP_MODEL, settings=ModelSettings(max_tokens=64), api_key=API_KEY),
        output_type=ToolOutput(Verdict),
    )

    result = asyncio.run(agent.run("capital of France?", event_stream_handler=drain_events))
    body = recorder.bodies()[0]

    assert result.output == Verdict(answer="Paris", score=9)
    assert body["stream"] is True
    assert body["provider"] == {"data_collection": "deny", "zdr": True}
    assert body["model"] == "openai/gpt-oss-20b"
    assert body["max_tokens"] == 64
    assert recorder.requests[0].headers["authorization"] == f"Bearer {API_KEY.get_secret_value()}"
    assert str(recorder.requests[0].url) == "https://openrouter.ai/api/v1/chat/completions"


def test_model_override_disables_zdr_for_a_cheap_model() -> None:
    recorder = Recorder([sse_reply(data_stream(chat_tool_stream()))])
    models = factory(
        recorder,
        providers={"openrouter": ProviderOptions(routing=PRIVATE_ROUTING)},
        overrides={CHEAP_MODEL: ModelOverride(routing=PRIVATE_ROUTING.without_zdr())},
    )
    agent = Agent(models.build(CHEAP_MODEL, settings=None, api_key=API_KEY), output_type=ToolOutput(Verdict))

    asyncio.run(agent.run("capital of France?", event_stream_handler=drain_events))

    assert recorder.bodies()[0]["provider"] == {"data_collection": "deny", "zdr": False}


@pytest.mark.parametrize(
    ("model", "url"),
    [
        ("openai-chat:gpt-5.4-mini", "https://proxy.local/v1/chat/completions"),
        ("together:meta-llama/Llama-3.3-70B-Instruct-Turbo", "https://proxy.local/v1/chat/completions"),
        (CHEAP_MODEL, "https://proxy.local/v1/chat/completions"),
    ],
)
def test_provider_base_url_is_configurable(model: str, url: str) -> None:
    recorder = Recorder([sse_reply(data_stream(chat_tool_stream()))])
    provider = model.partition(":")[0]
    models = factory(recorder, providers={provider: ProviderOptions(base_url="https://proxy.local/v1")})
    agent = Agent(models.build(model, settings=None, api_key=API_KEY), output_type=ToolOutput(Verdict))

    asyncio.run(agent.run("hi", event_stream_handler=drain_events))

    assert str(recorder.requests[0].url) == url


def test_key_falls_back_to_the_pydantic_ai_environment_variable() -> None:
    recorder = Recorder([sse_reply(data_stream(chat_tool_stream()))])
    models = factory(recorder, environ={"OPENROUTER_API_KEY": "sk-or-from-env-0001"})
    agent = Agent(models.build(CHEAP_MODEL, settings=None), output_type=ToolOutput(Verdict))

    asyncio.run(agent.run("hi", event_stream_handler=drain_events))

    assert recorder.requests[0].headers["authorization"] == "Bearer sk-or-from-env-0001"


def test_missing_required_key_names_the_environment_variable() -> None:
    with pytest.raises(MissingProviderKey) as raised:
        factory(Recorder([])).build(CHEAP_MODEL, settings=None)

    assert raised.value.env_var == "OPENROUTER_API_KEY"
    assert "OPENROUTER_API_KEY" in str(raised.value)


def test_missing_extra_reports_the_install_hint() -> None:
    models = ProviderModelFactory(environ={}, finder=missing)

    with pytest.raises(ProviderUnavailable) as raised:
        models.build("anthropic:claude-sonnet-5", settings=None, api_key=API_KEY)

    assert raised.value.extra == "anthropic"
    assert raised.value.hint == 'uv add "aqven[anthropic]"'
    assert 'uv add "aqven[anthropic]"' in str(raised.value)


def test_provider_without_streaming_is_rejected_before_its_extra() -> None:
    models = ProviderModelFactory(environ={}, finder=missing)

    with pytest.raises(ProviderNoStreaming) as raised:
        models.build("cohere:command-a-03-2025", settings=None, api_key=API_KEY)

    assert raised.value.model_class == "pydantic_ai.models.cohere.CohereModel"


@pytest.mark.parametrize("model", ["mystery:large", "openrouter", "gpt-4o", "openrouter:"])
def test_unknown_provider_is_rejected(model: str) -> None:
    with pytest.raises(UnknownProvider):
        factory(Recorder([])).build(model, settings=None, api_key=API_KEY)


def test_pydantic_ai_configuration_errors_are_wrapped() -> None:
    with pytest.raises(ProviderMisconfigured) as raised:
        factory(Recorder([])).build("openrouter:gpt-oss-20b", settings=None, api_key=API_KEY)

    assert raised.value.provider == "openrouter"


def test_stored_key_wins_over_environment() -> None:
    keys = ProviderKeys(environ={"GROQ_API_KEY": "from-env"}, store=StoredKeys({"groq": "from-store"}))

    found = asyncio.run(keys.key("groq:llama-3.3-70b-versatile"))

    assert found is not None
    assert found.get_secret_value() == "from-store"


def test_alternate_environment_variable_is_accepted() -> None:
    keys = ProviderKeys(environ={"GEMINI_API_KEY": "gemini-key"})

    found = asyncio.run(keys.key("google:gemini-3.8-flash"))

    assert found is not None
    assert found.get_secret_value() == "gemini-key"


def test_keyless_provider_resolves_to_no_key() -> None:
    keys = ProviderKeys(environ={}, store=StoredKeys({}))

    assert asyncio.run(keys.key("ollama:llama3.3")) is None


def test_required_key_is_reported_by_the_resolver() -> None:
    keys = ProviderKeys(environ={}, store=StoredKeys({}))

    with pytest.raises(MissingProviderKey):
        asyncio.run(keys.key("anthropic:claude-sonnet-5"))


def test_image_output_streams_as_file_part() -> None:
    image: JsonValue = {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{PNG_PIXEL}"}}
    stream = data_stream(
        [chat_chunk({"role": "assistant", "content": "here", "images": [image]}), chat_chunk({}, "stop")]
    )
    recorder = Recorder([sse_reply(stream)])
    model_name = "openrouter:google/gemini-3.1-flash-lite-image"
    models = factory(recorder, overrides={model_name: ModelOverride(media=MediaOutput(image=True))})
    built = models.build(model_name, settings=None, api_key=API_KEY)

    async def run() -> list[object]:
        async with model_request_stream(
            built, prompt("draw"), model_request_parameters=ModelRequestParameters(allow_image_output=True)
        ) as stream:
            async for _ in stream:
                continue
            return list(stream.get().parts)

    parts = asyncio.run(run())
    files = [part for part in parts if isinstance(part, FilePart)]

    assert recorder.bodies()[0]["modalities"] == ["image", "text"]
    assert len(files) == 1
    assert files[0].content.media_type == "image/png"
    assert files[0].content.data == base64.b64decode(PNG_PIXEL)


def test_audio_output_streams_speech_deltas() -> None:
    first = base64.b64encode(b"\x01\x02").decode()
    second = base64.b64encode(b"\x03\x04").decode()
    stream = data_stream(
        [
            chat_chunk({"role": "assistant", "audio": {"id": "a1", "data": first, "transcript": "Hel"}}),
            chat_chunk({"audio": {"data": second, "transcript": "lo"}}),
            chat_chunk({}, "stop"),
        ]
    )
    recorder = Recorder([sse_reply(stream)])
    model_name = "openrouter:openai/gpt-audio-mini"
    models = factory(
        recorder, overrides={model_name: ModelOverride(media=MediaOutput(audio=AudioOutput(voice="alloy")))}
    )
    built = models.build(model_name, settings=None, api_key=API_KEY)

    async def run() -> tuple[Sequence[object], Sequence[object]]:
        async with model_request_stream(built, prompt("say hello")) as stream:
            events = [event async for event in stream]
            return events, list(stream.get().parts)

    events, parts = asyncio.run(run())
    speech = [part for part in parts if isinstance(part, SpeechPart)]
    deltas = [
        event.delta
        for event in events
        if isinstance(event, PartDeltaEvent) and isinstance(event.delta, SpeechPartDelta)
    ]
    body = recorder.bodies()[0]

    assert body["modalities"] == ["text", "audio"]
    assert body["audio"] == {"voice": "alloy", "format": "pcm16"}
    assert speech[0].transcript == "Hello"
    assert speech[0].audio is not None
    assert speech[0].audio.data == b"\x01\x02\x03\x04"
    assert speech[0].audio.media_type == "audio/pcm"
    assert [delta.audio_chunk for delta in deltas] == [b"\x03\x04"]
