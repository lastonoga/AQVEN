import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Final

from pydantic import JsonValue, SecretStr
from pydantic_ai.messages import FinishReason, ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import RequestUsage

from aqven.models.streams import StreamContext
from aqven.ports.settings import SettingKey, SettingScope, SettingView

FIXED_TIME: Final = datetime(2026, 9, 17, tzinfo=UTC)


@dataclass(slots=True)
class LaneClock:
    now: float = 0.0
    waits: list[float] = field(default_factory=list[float])

    def time(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)
        self.now += seconds


@dataclass(frozen=True)
class Chunk:
    text: str | None = None
    tool_name: str | None = None
    args: str | None = None
    gate: asyncio.Event | None = None


@dataclass(frozen=True)
class Script:
    chunks: tuple[Chunk, ...]
    finish_reason: FinishReason | None = "stop"
    usage: RequestUsage = field(default_factory=lambda: RequestUsage(input_tokens=10, output_tokens=5))
    provider_details: dict[str, JsonValue] | None = None
    model_name: str = "scripted"


def text_script(*pieces: str, finish_reason: FinishReason | None = "stop") -> Script:
    return Script(chunks=tuple(Chunk(text=piece) for piece in pieces), finish_reason=finish_reason)


def tool_script(name: str, *pieces: str, finish_reason: FinishReason | None = "stop") -> Script:
    first = Chunk(tool_name=name, args=pieces[0])
    rest = tuple(Chunk(args=piece) for piece in pieces[1:])
    return Script(chunks=(first, *rest), finish_reason=finish_reason)


class ScriptedStream(StreamedResponse):
    def __init__(self, parameters: ModelRequestParameters, script: Script) -> None:
        super().__init__(parameters)
        self.script = script

    async def _get_event_iterator(self) -> AsyncIterator[ModelResponseStreamEvent]:
        for chunk in self.script.chunks:
            for event in await self.chunk_events(chunk):
                yield event
        self.finish_reason = self.script.finish_reason
        self.provider_details = None if self.script.provider_details is None else dict(self.script.provider_details)
        self._usage = self.script.usage

    async def chunk_events(self, chunk: Chunk) -> list[ModelResponseStreamEvent]:
        if chunk.gate is not None:
            await asyncio.wait_for(chunk.gate.wait(), timeout=2)
        return [*self.text_events(chunk), *self.tool_events(chunk)]

    def text_events(self, chunk: Chunk) -> list[ModelResponseStreamEvent]:
        if chunk.text is None:
            return []
        return list(self._parts_manager.handle_text_delta(vendor_part_id="text", content=chunk.text))

    def tool_events(self, chunk: Chunk) -> list[ModelResponseStreamEvent]:
        if chunk.args is None:
            return []
        event = self._parts_manager.handle_tool_call_delta(
            vendor_part_id="tool", tool_name=chunk.tool_name, args=chunk.args, tool_call_id="call_1"
        )
        return [] if event is None else [event]

    async def close_stream(self) -> None:
        return None

    @property
    def model_name(self) -> str:
        return self.script.model_name

    @property
    def provider_name(self) -> str | None:
        return "scripted"

    @property
    def provider_url(self) -> str | None:
        return None

    @property
    def timestamp(self) -> datetime:
        return FIXED_TIME


class RequestNotStreamed(AssertionError):
    pass


class ScriptedModel(Model):
    def __init__(self, scripts: Sequence[Script], *, open_errors: Sequence[Exception] = ()) -> None:
        super().__init__()
        self.scripts = list(scripts)
        self.open_errors = list(open_errors)
        self.opens = 0
        self.streams = 0
        self.seen: list[list[ModelMessage]] = []

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        raise RequestNotStreamed("the guarantee chain must call request_stream")

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext = None,
    ) -> AsyncGenerator[StreamedResponse]:
        self.opens += 1
        self.seen.append(list(messages))
        if self.open_errors:
            raise self.open_errors.pop(0)
        script = self.scripts[min(self.streams, len(self.scripts) - 1)]
        self.streams += 1
        yield ScriptedStream(model_request_parameters, script)

    @property
    def model_name(self) -> str:
        return "scripted"

    @property
    def system(self) -> str:
        return "scripted"


class FailingModel(ScriptedModel):
    def __init__(self) -> None:
        super().__init__([text_script("never")], open_errors=[AssertionError("model must not be called")] * 50)


@dataclass
class MemorySettings:
    secrets: dict[tuple[SettingScope, SettingKey], SecretStr] = field(
        default_factory=dict[tuple[SettingScope, SettingKey], SecretStr]
    )

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        return None

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        raise NotImplementedError

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        self.secrets[(scope, key)] = secret
        raise NotImplementedError

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return self.secrets.pop((scope, key), None) is not None

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return self.secrets.get((scope, key))


def sse_body(chunks: Sequence[Mapping[str, JsonValue]]) -> bytes:
    lines = [f"data: {json.dumps(chunk)}\n\n" for chunk in chunks]
    return ("".join(lines) + "data: [DONE]\n\n").encode()
