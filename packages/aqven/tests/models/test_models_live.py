import asyncio
import io
import math
import os
import struct
import wave
import zlib
from collections.abc import AsyncIterable, Sequence
from pathlib import Path
from typing import Final

import pytest
from models_support import FailingModel, MemorySettings
from pydantic import BaseModel
from pydantic_ai import Agent, AgentStreamEvent, RunContext, ToolOutput
from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import (
    BinaryContent,
    FilePart,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    SpeechPart,
    UserPromptPart,
)
from pydantic_ai.models import Model, ModelRequestParameters, override_allow_model_requests
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
from aqven_llm import (
    PRIVATE_ROUTING,
    AudioOutput,
    MediaOutput,
    ModelOverride,
    ProviderModelFactory,
    ProviderOptions,
)

LIVE: Final = os.environ.get("AQVEN_LIVE") == "1"
TEXT_MODEL: Final = "openrouter:mistralai/mistral-nemo"
VISION_MODEL: Final = "openrouter:google/gemma-3-12b-it"
AUDIO_IN_MODEL: Final = "openrouter:google/gemini-2.5-flash-lite"
IMAGE_MODEL: Final = "openrouter:google/gemini-3.1-flash-lite-image"
SPEECH_MODEL: Final = "openrouter:openai/gpt-audio-mini"
CHEAP_ROUTING: Final = PRIVATE_ROUTING.without_zdr()

pytestmark = pytest.mark.skipif(not LIVE, reason="live OpenRouter smoke tests run only with AQVEN_LIVE=1")


class Capital(BaseModel):
    city: str
    country: str


def factory(overrides: dict[str, ModelOverride]) -> GuardedModelFactory:
    providers = ProviderModelFactory(
        providers={"openrouter": ProviderOptions(routing=PRIVATE_ROUTING)},
        overrides=overrides,
    )
    return GuardedModelFactory(providers, ProviderKeyResolver(MemorySettings(), os.environ))


def record_policy(directory: Path, log: UsageLog) -> CallPolicy:
    return CallPolicy(
        cassettes=CassettePolicy(
            store=DirectoryCassetteStore(directory), behavior=CASSETTE_BEHAVIORS[CassetteMode.RECORD]
        ),
        backoff=BackoffPolicy(attempts=1),
        usage_sink=log,
    )


def replay_model(directory: Path, model: str) -> Model:
    policy = CallPolicy(
        cassettes=CassettePolicy(
            store=DirectoryCassetteStore(directory), behavior=CASSETTE_BEHAVIORS[CassetteMode.REPLAY_STRICT]
        )
    )
    return guard_model(FailingModel(), model_ref=model, policy=policy)


def report(label: str, log: UsageLog) -> None:
    for entry in log.entries:
        print(
            f"LIVE {label}: model={entry.model_name} input={entry.usage.input_tokens} "
            f"output={entry.usage.output_tokens} provider_cost={entry.provider_cost} estimated={entry.estimated_cost}"
        )


def red_png(size: int = 16) -> bytes:
    row = b"\x00" + b"\xff\x00\x00" * size
    raw = row * size
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)

    def block(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return b"\x89PNG\r\n\x1a\n" + block(b"IHDR", header) + block(b"IDAT", zlib.compress(raw)) + block(b"IEND", b"")


def tone_wav(seconds: float = 0.6, rate: int = 16_000) -> bytes:
    frames = b"".join(
        struct.pack("<h", int(12_000 * math.sin(2 * math.pi * 440 * index / rate)))
        for index in range(int(seconds * rate))
    )
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as sink:
        sink.setnchannels(1)
        sink.setsampwidth(2)
        sink.setframerate(rate)
        sink.writeframes(frames)
    return buffer.getvalue()


def messages(*content: str | BinaryContent) -> list[ModelMessage]:
    return [ModelRequest(parts=[UserPromptPart(list(content))])]


async def stream_parts(
    model: Model, request: list[ModelMessage], parameters: ModelRequestParameters
) -> tuple[ModelResponse, int]:
    deltas = 0
    async with model_request_stream(model, request, model_request_parameters=parameters) as stream:
        async for event in stream:
            deltas += isinstance(event, PartDeltaEvent)
        return stream.get(), deltas


def test_live_structured_output_streams_and_replays(tmp_path: Path) -> None:
    log = UsageLog()
    models = factory({TEXT_MODEL: ModelOverride(routing=CHEAP_ROUTING)})
    deltas: list[int] = [0]

    async def handler(_: RunContext[object], stream: AsyncIterable[AgentStreamEvent]) -> None:
        async for event in stream:
            deltas[0] += isinstance(event, PartDeltaEvent)

    async def live() -> Capital:
        model = await models.build(
            TEXT_MODEL, settings=ModelSettings(max_tokens=120), policy=record_policy(tmp_path, log)
        )
        agent: Agent[None, Capital] = Agent(model, output_type=ToolOutput(Capital))
        return (await agent.run("What is the capital of France? Use the tool.", event_stream_handler=handler)).output

    with call_site(node_address("capital"), 1):
        answer = asyncio.run(live())
    with override_allow_model_requests(False), call_site(node_address("capital"), 1):
        replay_agent: Agent[None, Capital] = Agent(
            replay_model(tmp_path, TEXT_MODEL),
            output_type=ToolOutput(Capital),
            model_settings=ModelSettings(max_tokens=120),
        )
        replayed = asyncio.run(replay_agent.run("What is the capital of France? Use the tool.")).output
    report("text", log)

    assert "paris" in answer.city.lower()
    assert replayed == answer
    assert deltas[0] >= 1


def test_live_vision_input(tmp_path: Path) -> None:
    log = UsageLog()
    models = factory({VISION_MODEL: ModelOverride(routing=CHEAP_ROUTING)})

    async def live() -> tuple[ModelResponse, int]:
        model = await models.build(
            VISION_MODEL, settings=ModelSettings(max_tokens=16), policy=record_policy(tmp_path, log)
        )
        image = BinaryContent(data=red_png(), media_type="image/png")
        request = messages("What single color fills this image? Answer with one word.", image)
        return await stream_parts(model, request, ModelRequestParameters())

    with call_site(node_address("vision"), 1):
        response, _ = asyncio.run(live())
    report("vision", log)

    assert response.text is not None
    assert "red" in response.text.lower()


def test_live_audio_input(tmp_path: Path) -> None:
    log = UsageLog()
    models = factory({AUDIO_IN_MODEL: ModelOverride(routing=CHEAP_ROUTING)})

    async def live() -> tuple[ModelResponse, int]:
        model = await models.build(
            AUDIO_IN_MODEL, settings=ModelSettings(max_tokens=24), policy=record_policy(tmp_path, log)
        )
        audio = BinaryContent(data=tone_wav(), media_type="audio/wav")
        request = messages("Describe this audio clip in at most five words.", audio)
        return await stream_parts(model, request, ModelRequestParameters())

    with call_site(node_address("audio"), 1):
        response, _ = asyncio.run(live())
    report("audio-input", log)

    assert response.text
    assert log.entries[0].usage.input_tokens > 0


def test_live_image_generation(tmp_path: Path) -> None:
    log = UsageLog()
    models = factory({IMAGE_MODEL: ModelOverride(routing=CHEAP_ROUTING, media=MediaOutput(image=True))})

    async def live() -> tuple[ModelResponse, int]:
        model = await models.build(IMAGE_MODEL, settings=None, policy=record_policy(tmp_path, log))
        request = messages("Generate a tiny flat icon of a yellow circle on white background.")
        return await stream_parts(model, request, ModelRequestParameters(allow_image_output=True))

    with call_site(node_address("image"), 1):
        response, _ = asyncio.run(live())
    report("image-generation", log)
    images = [part for part in response.parts if isinstance(part, FilePart)]

    assert images
    assert images[0].content.is_image
    assert len(images[0].content.data) > 100


def test_live_speech_output(tmp_path: Path) -> None:
    log = UsageLog()
    speech = MediaOutput(audio=AudioOutput(voice="alloy", format="pcm16"))
    models = factory({SPEECH_MODEL: ModelOverride(routing=CHEAP_ROUTING, media=speech)})

    async def live() -> tuple[ModelResponse, int]:
        model = await models.build(
            SPEECH_MODEL, settings=ModelSettings(max_tokens=60), policy=record_policy(tmp_path, log)
        )
        return await stream_parts(model, messages("Say exactly: hello."), ModelRequestParameters())

    with call_site(node_address("speech"), 1):
        response, deltas = asyncio.run(live())
    report("speech", log)
    spoken: Sequence[SpeechPart] = [part for part in response.parts if isinstance(part, SpeechPart)]

    assert spoken
    assert spoken[0].audio is not None
    assert len(spoken[0].audio.data) > 1_000
    assert deltas >= 1
