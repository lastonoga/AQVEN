import base64
import itertools
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Final, Literal

from openai.types.chat import chat_completion_chunk
from pydantic import BaseModel, ConfigDict
from pydantic_ai.messages import (
    BinaryContent,
    FilePart,
    ModelResponseStreamEvent,
    PartDeltaEvent,
    PartStartEvent,
    SpeechPart,
    SpeechPartDelta,
)
from pydantic_ai.models.openai import OpenAIStreamedResponse
from pydantic_ai.models.openrouter import OpenRouterModel, OpenRouterStreamedResponse

type AudioFormat = Literal["wav", "mp3", "flac", "opus", "pcm16"]

AUDIO_MEDIA_TYPES: Final[Mapping[AudioFormat, str]] = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "opus": "audio/opus",
    "pcm16": "audio/pcm",
}
AUDIO_VENDOR_ID: Final = "aqven-audio"
IMAGE_VENDOR_PREFIX: Final = "aqven-image-"


@dataclass(frozen=True, slots=True)
class AudioOutput:
    voice: str = "alloy"
    format: AudioFormat = "pcm16"


@dataclass(frozen=True, slots=True)
class MediaOutput:
    image: bool = False
    audio: AudioOutput | None = None

    def modalities(self) -> list[str]:
        image = ["image"] if self.image else []
        audio = ["audio"] if self.audio is not None else []
        return [*image, "text", *audio]

    def extra_body(self) -> dict[str, object]:
        if self.audio is None:
            return {"modalities": self.modalities()}
        return {
            "modalities": self.modalities(),
            "audio": {"voice": self.audio.voice, "format": self.audio.format},
        }

    @property
    def requested(self) -> bool:
        return self.image or self.audio is not None


TEXT_ONLY: Final = MediaOutput()


class ImageUrlPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    url: str


class ImagePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    image_url: ImageUrlPayload


class AudioPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    data: str | None = None
    transcript: str | None = None


class AudioRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    format: AudioFormat = "pcm16"


class AudioRequestBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    audio: AudioRequest | None = None


class MediaDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    images: list[ImagePayload] | None = None
    audio: AudioPayload | None = None


@dataclass
class OpenRouterMediaStreamedResponse(OpenRouterStreamedResponse):
    _images_seen: int = field(default=0, init=False)

    def _map_part_delta(self, choice: chat_completion_chunk.Choice) -> Iterable[ModelResponseStreamEvent]:
        media = MediaDeltaPayload.model_validate(choice.delta.model_extra or {})
        return itertools.chain(
            super()._map_part_delta(choice),
            self._map_images(media.images or []),
            self._map_audio(media.audio),
        )

    def _map_thinking_delta(self, choice: chat_completion_chunk.Choice) -> Iterable[ModelResponseStreamEvent]:
        detailed = list(super()._map_thinking_delta(choice))
        if detailed:
            return detailed
        return OpenAIStreamedResponse._map_thinking_delta(self, choice)

    def _map_images(self, images: list[ImagePayload]) -> Iterable[ModelResponseStreamEvent]:
        for image in images:
            vendor_id = f"{IMAGE_VENDOR_PREFIX}{self._images_seen}"
            self._images_seen += 1
            content = BinaryContent.from_data_uri(image.image_url.url)
            yield self._parts_manager.handle_part(vendor_part_id=vendor_id, part=FilePart(content=content))

    def _map_audio(self, audio: AudioPayload | None) -> Iterable[ModelResponseStreamEvent]:
        if audio is None or (audio.data is None and audio.transcript is None):
            return ()
        chunk = base64.b64decode(audio.data) if audio.data else b""
        existing = self._parts_manager.get_part_by_vendor_id(AUDIO_VENDOR_ID)
        if isinstance(existing, SpeechPart):
            return self._continue_speech(existing, chunk, audio.transcript)
        return (self._start_speech(chunk, audio.transcript),)

    def _audio_media_type(self) -> str:
        settings = self._model_settings or {}
        request = AudioRequestBody.model_validate(settings.get("extra_body") or {})
        audio_format: AudioFormat = "pcm16" if request.audio is None else request.audio.format
        return AUDIO_MEDIA_TYPES[audio_format]

    def _start_speech(self, chunk: bytes, transcript: str | None) -> ModelResponseStreamEvent:
        audio = BinaryContent(data=chunk, media_type=self._audio_media_type())
        part = SpeechPart(speaker="assistant", transcript=transcript, audio=audio)
        return self._parts_manager.handle_part(vendor_part_id=AUDIO_VENDOR_ID, part=part)

    def _continue_speech(
        self, existing: SpeechPart, chunk: bytes, transcript: str | None
    ) -> Iterable[ModelResponseStreamEvent]:
        delta = SpeechPartDelta(speaker="assistant", transcript_delta=transcript, audio_chunk=chunk or None)
        replaced = self._parts_manager.handle_part(vendor_part_id=AUDIO_VENDOR_ID, part=delta.apply(existing))
        if not isinstance(replaced, PartStartEvent):
            return ()
        return (PartDeltaEvent(index=replaced.index, delta=delta),)


class OpenRouterMediaModel(OpenRouterModel):
    @property
    def _streamed_response_cls(self) -> type[OpenRouterStreamedResponse]:
        return OpenRouterMediaStreamedResponse
