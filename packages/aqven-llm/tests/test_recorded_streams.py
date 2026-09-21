import asyncio
import base64
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest
from llm_wire import API_KEY, Recorder, prompt, sse_reply
from pydantic import JsonValue
from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import FilePart, ModelResponse, SpeechPart, TextPart, ThinkingPart
from pydantic_ai.models import Model, ModelRequestParameters, infer_model

from aqven_llm import AudioOutput, MediaOutput, ModelOverride, OpenRouterMediaModel, ProviderModelFactory

FIXTURES: Final = Path(__file__).parent / "fixtures" / "openrouter"
IMAGE_PARAMETERS: Final = ModelRequestParameters(allow_image_output=True)
TEXT_PARAMETERS: Final = ModelRequestParameters()


def stream_body(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def chunks(name: str) -> Iterator[dict[str, JsonValue]]:
    for line in (FIXTURES / name).read_text(encoding="utf-8").splitlines():
        if line.startswith("data: {"):
            yield json.loads(line.removeprefix("data: "))


def vanilla_model(name: str, recorder: Recorder) -> Model:
    provider = aqven_model(name, recorder).provider
    assert provider is not None
    vanilla = infer_model(f"openrouter:{name}", provider_factory=lambda _: provider)
    assert type(vanilla).__name__ == "OpenRouterModel"
    assert not isinstance(vanilla, OpenRouterMediaModel)
    return vanilla


def aqven_model(name: str, recorder: Recorder, media: MediaOutput | None = None) -> Model:
    model = f"openrouter:{name}"
    factory = ProviderModelFactory(
        http_client=recorder.client, overrides={model: ModelOverride(media=media)}, environ={}
    )
    return factory.build(model, settings=None, api_key=API_KEY)


def replay(model: Model, parameters: ModelRequestParameters) -> ModelResponse:
    async def run() -> ModelResponse:
        async with model_request_stream(model, prompt("replay"), model_request_parameters=parameters) as stream:
            async for _ in stream:
                continue
            return stream.get()

    return asyncio.run(run())


def both(
    fixture: str, name: str, media: MediaOutput | None, parameters: ModelRequestParameters
) -> tuple[ModelResponse, ModelResponse]:
    vanilla = replay(vanilla_model(name, Recorder([sse_reply(stream_body(fixture))])), parameters)
    ours = replay(aqven_model(name, Recorder([sse_reply(stream_body(fixture))]), media), parameters)
    return vanilla, ours


def cost(response: ModelResponse) -> object:
    return (response.provider_details or {}).get("cost")


def recorded_cost(fixture: str) -> object:
    usage = [chunk["usage"] for chunk in chunks(fixture) if isinstance(chunk.get("usage"), dict)]
    last = usage[-1]
    assert isinstance(last, dict)
    return last["cost"]


def texts(response: ModelResponse) -> str:
    return "".join(part.content for part in response.parts if isinstance(part, TextPart))


def thinking(response: ModelResponse) -> str:
    return "".join(part.content for part in response.parts if isinstance(part, ThinkingPart))


def recorded_images(fixture: str) -> list[bytes]:
    found: list[bytes] = []
    for chunk in chunks(fixture):
        choices = chunk.get("choices")
        assert isinstance(choices, list)
        for choice in choices:
            assert isinstance(choice, dict)
            delta = choice.get("delta")
            assert isinstance(delta, dict)
            images = delta.get("images") or []
            assert isinstance(images, list)
            for image in images:
                assert isinstance(image, dict)
                url = image["image_url"]
                assert isinstance(url, dict)
                data = url["url"]
                assert isinstance(data, str)
                found.append(base64.b64decode(data.partition(",")[2]))
    return found


def deltas(fixture: str) -> Iterator[dict[str, JsonValue]]:
    for chunk in chunks(fixture):
        choices = chunk.get("choices")
        assert isinstance(choices, list)
        for choice in choices:
            assert isinstance(choice, dict)
            delta = choice.get("delta")
            assert isinstance(delta, dict)
            yield delta


def recorded_reasoning(fixture: str) -> str:
    return "".join(text for delta in deltas(fixture) if isinstance(text := delta.get("reasoning"), str))


def recorded_audio(fixture: str) -> tuple[str, bytes]:
    transcript = ""
    audio = b""
    for chunk in chunks(fixture):
        choices = chunk.get("choices")
        assert isinstance(choices, list)
        for choice in choices:
            assert isinstance(choice, dict)
            delta = choice.get("delta")
            assert isinstance(delta, dict)
            payload = delta.get("audio")
            if not isinstance(payload, dict):
                continue
            text = payload.get("transcript")
            data = payload.get("data")
            transcript += text if isinstance(text, str) else ""
            audio += base64.b64decode(data) if isinstance(data, str) else b""
    return transcript, audio


@pytest.mark.parametrize(
    ("fixture", "name"),
    [
        ("gpt_oss_reasoning.sse", "openai/gpt-oss-20b"),
        ("gemini_lite_text.sse", "google/gemini-2.5-flash-lite"),
        ("gemini_image.sse", "google/gemini-3.1-flash-lite-image"),
        ("gpt_audio.sse", "openai/gpt-audio-mini"),
        ("reasoning_without_details.sse", "some/model"),
    ],
)
def test_vanilla_openrouter_keeps_the_cost(fixture: str, name: str) -> None:
    vanilla, ours = both(fixture, name, None, TEXT_PARAMETERS)

    assert cost(vanilla) == recorded_cost(fixture)
    assert cost(ours) == recorded_cost(fixture)


def test_reasoning_with_details_is_identical() -> None:
    vanilla, ours = both("gpt_oss_reasoning.sse", "openai/gpt-oss-20b", None, TEXT_PARAMETERS)

    assert thinking(vanilla) == recorded_reasoning("gpt_oss_reasoning.sse")
    assert thinking(ours) == thinking(vanilla)
    assert texts(ours) == texts(vanilla) == "391"


def test_text_stream_is_identical() -> None:
    vanilla, ours = both("gemini_lite_text.sse", "google/gemini-2.5-flash-lite", None, TEXT_PARAMETERS)

    assert texts(ours) == texts(vanilla) == "Hello, nice to meet you."


def test_vanilla_openrouter_drops_streamed_images() -> None:
    fixture = "gemini_image.sse"
    vanilla, ours = both(fixture, "google/gemini-3.1-flash-lite-image", MediaOutput(image=True), IMAGE_PARAMETERS)
    ours_files = [part.content for part in ours.parts if isinstance(part, FilePart)]

    assert [part for part in vanilla.parts if isinstance(part, FilePart)] == []
    assert [content.media_type for content in ours_files] == ["image/jpeg"]
    assert [content.data for content in ours_files] == recorded_images(fixture)


def test_vanilla_openrouter_drops_streamed_audio() -> None:
    fixture = "gpt_audio.sse"
    vanilla, ours = both(fixture, "openai/gpt-audio-mini", MediaOutput(audio=AudioOutput()), TEXT_PARAMETERS)
    transcript, audio = recorded_audio(fixture)
    speech = [part for part in ours.parts if isinstance(part, SpeechPart)]

    assert [part for part in vanilla.parts if isinstance(part, SpeechPart)] == []
    assert len(speech) == 1
    assert speech[0].transcript == transcript
    assert speech[0].audio is not None
    assert speech[0].audio.data == audio
    assert speech[0].audio.media_type == "audio/pcm"


def test_vanilla_openrouter_drops_reasoning_without_details() -> None:
    vanilla, ours = both("reasoning_without_details.sse", "some/model", None, TEXT_PARAMETERS)

    assert thinking(vanilla) == ""
    assert thinking(ours) == "thinking without details"
    assert texts(ours) == texts(vanilla) == "ok"
