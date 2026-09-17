import os
from collections.abc import AsyncGenerator, AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Annotated, Final, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, JsonValue, SecretStr, TypeAdapter
from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import CompletedStreamedResponse, Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings, merge_model_settings
from pydantic_ai.usage import RequestUsage

from aqven.models.callsite import CallSite, current_call_site
from aqven.models.cassette_key import (
    CASSETTE_KEY_PATTERN,
    CassetteKey,
    canonical_request,
    cassette_key,
    jsonable,
    request_key,
)
from aqven.models.redaction import PartRedaction, RedactionPolicy, redact_response
from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel
from aqven.models.usage import DiscardUsage, UsageSink, replay_cost
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.options import CassetteMode

CASSETTE_FORMAT: Final = "aqven.cassette.v1"
CASSETTE_METADATA_KEY: Final = "aqven.cassette"
SECRET_PLACEHOLDER: Final = "<secret>"
UNBOUND_DIRECTORY: Final = "_unbound"
RECORDING_SUFFIX: Final = ".json"

EVENTS_ADAPTER: Final[TypeAdapter[list[ModelResponseStreamEvent]]] = TypeAdapter(
    list[ModelResponseStreamEvent],
    config=ConfigDict(defer_build=True, ser_json_bytes="base64", val_json_bytes="base64"),
)
USAGE_ADAPTER: Final[TypeAdapter[RequestUsage]] = TypeAdapter(RequestUsage)


@dataclass(frozen=True, slots=True)
class CassetteBehavior:
    reads: bool
    writes: bool
    strict: bool


LIVE_BEHAVIOR: Final = CassetteBehavior(reads=False, writes=False, strict=False)

CASSETTE_BEHAVIORS: Final[Mapping[CassetteMode, CassetteBehavior]] = {
    CassetteMode.RECORD: CassetteBehavior(reads=False, writes=True, strict=False),
    CassetteMode.REPLAY_STRICT: CassetteBehavior(reads=True, writes=False, strict=True),
    CassetteMode.RECORD_NEW: CassetteBehavior(reads=True, writes=True, strict=False),
}


class CassetteMiss(Exception):
    def __init__(self, key: CassetteKey, site: CallSite, model_ref: str) -> None:
        super().__init__(
            f"cassette miss: key {key} for model {model_ref} at {site.as_json()} is not recorded; "
            "replay_strict never falls back to a live call"
        )
        self.key = key
        self.site = site
        self.model_ref = model_ref


class AmbiguousReplay(Exception):
    code: Final = "AMBIGUOUS_REPLAY"

    def __init__(self, key: CassetteKey, site: CallSite) -> None:
        super().__init__(
            f"{self.code}: key {key} at {site.as_json()} was recorded twice with different responses; "
            "identical requests at one call site must differ in their input"
        )
        self.key = key
        self.site = site


class RecordedSite(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    address: ExecutionAddress | None
    attempt: Annotated[int, Field(ge=1)]


class CassetteRecording(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    format: Literal["aqven.cassette.v1"] = CASSETTE_FORMAT
    key: Annotated[str, Field(pattern=CASSETTE_KEY_PATTERN)]
    request_key: Annotated[str, Field(pattern=CASSETTE_KEY_PATTERN)]
    model_ref: str
    site: RecordedSite
    events: list[JsonValue]
    response: JsonValue

    def stream_events(self) -> list[ModelResponseStreamEvent]:
        return EVENTS_ADAPTER.validate_python(self.events)

    def model_response(self) -> ModelResponse:
        restored = ModelMessagesTypeAdapter.validate_python([self.response])[0]
        if not isinstance(restored, ModelResponse):
            raise ValueError(f"cassette {self.key} holds a {restored.kind} instead of a response")
        return restored

    def outcome_fingerprint(self) -> JsonValue:
        response = self.response if isinstance(self.response, dict) else {}
        return {"parts": response.get("parts"), "finish_reason": response.get("finish_reason")}


class CassetteStore(Protocol):
    def load(self, key: CassetteKey, site: CallSite) -> CassetteRecording | None: ...

    def save(self, recording: CassetteRecording, site: CallSite) -> None: ...


class MemoryCassetteStore:
    def __init__(self) -> None:
        self.recordings: dict[CassetteKey, CassetteRecording] = {}

    def load(self, key: CassetteKey, site: CallSite) -> CassetteRecording | None:
        return self.recordings.get(key)

    def save(self, recording: CassetteRecording, site: CallSite) -> None:
        self.recordings[CassetteKey(recording.key)] = recording


class DirectoryCassetteStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def path(self, key: CassetteKey, site: CallSite) -> Path:
        folder = site.node_id or UNBOUND_DIRECTORY
        return self.directory / folder / f"{key.removeprefix('sha256-')}{RECORDING_SUFFIX}"

    def load(self, key: CassetteKey, site: CallSite) -> CassetteRecording | None:
        path = self.path(key, site)
        if not path.is_file():
            return None
        return CassetteRecording.model_validate_json(path.read_bytes())

    def save(self, recording: CassetteRecording, site: CallSite) -> None:
        path = self.path(CassetteKey(recording.key), site)
        path.parent.mkdir(parents=True, exist_ok=True)
        staging = path.with_suffix(".tmp")
        staging.write_text(recording.model_dump_json(indent=2) + "\n", encoding="utf-8")
        os.replace(staging, path)


class SecretScrubber:
    def __init__(self, secrets: Sequence[SecretStr]) -> None:
        self.values = tuple(value for value in (secret.get_secret_value() for secret in secrets) if value)

    def scrub(self, value: JsonValue) -> JsonValue:
        if isinstance(value, str):
            return self.scrub_text(value)
        if isinstance(value, list):
            return [self.scrub(item) for item in value]
        if isinstance(value, dict):
            return {key: self.scrub(item) for key, item in value.items()}
        return value

    def scrub_text(self, text: str) -> str:
        for secret in self.values:
            text = text.replace(secret, SECRET_PLACEHOLDER)
        return text


def free_replay(response: ModelResponse, key: CassetteKey) -> ModelResponse:
    metadata = {
        **(response.metadata or {}),
        CASSETTE_METADATA_KEY: {
            "hit": True,
            "key": key,
            "usage": USAGE_ADAPTER.dump_python(response.usage, mode="json"),
        },
    }
    return replace(response, usage=RequestUsage(), metadata=metadata)


class RecordingSession:
    def __init__(self) -> None:
        self.written: dict[CassetteKey, JsonValue] = {}

    def guard(self, recording: CassetteRecording, site: CallSite) -> None:
        key = CassetteKey(recording.key)
        fingerprint = recording.outcome_fingerprint()
        previous = self.written.get(key)
        if previous is not None and previous != fingerprint:
            raise AmbiguousReplay(key, site)
        self.written[key] = fingerprint


@dataclass(frozen=True, slots=True)
class CassettePolicy:
    store: CassetteStore
    behavior: CassetteBehavior
    redaction: RedactionPolicy | None = None
    secrets: tuple[SecretStr, ...] = ()
    session: RecordingSession = field(default_factory=RecordingSession)


class RecordingRelay:
    def __init__(self, model: CassetteModel, source: StreamedResponse, key: CassetteKey, request: CassetteKey) -> None:
        self.model = model
        self.source = source
        self.key = key
        self.request = request
        self.site = current_call_site()
        self.captured: list[ModelResponseStreamEvent] = []

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            self.captured.append(event)
            yield event
        self.model.record(self.key, self.request, self.site, self.captured, self.source.get())

    def response(self, response: ModelResponse) -> ModelResponse:
        return response


class CassetteModel(StreamFirstModel):
    def __init__(
        self,
        wrapped: Model,
        *,
        model_ref: str,
        policy: CassettePolicy,
        usage_sink: UsageSink | None = None,
    ) -> None:
        super().__init__(wrapped)
        self.model_ref = model_ref
        self.policy = policy
        self.scrubber = SecretScrubber(policy.secrets)
        self.usage_sink: UsageSink = DiscardUsage() if usage_sink is None else usage_sink

    def keys(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> tuple[CassetteKey, CassetteKey]:
        merged = merge_model_settings(self.wrapped.settings, model_settings)
        request = request_key(canonical_request(self.model_ref, messages, merged, model_request_parameters))
        return request, cassette_key(request, current_call_site())

    async def count_tokens(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> RequestUsage:
        if self.policy.behavior.reads:
            return RequestUsage()
        return await self.wrapped.count_tokens(messages, model_settings, model_request_parameters)

    def replay(self, recording: CassetteRecording, parameters: ModelRequestParameters) -> StreamedResponse:
        site = current_call_site()
        response = recording.model_response()
        self.usage_sink.record(replay_cost(site, self.model_ref, response, response.usage))
        return CompletedStreamedResponse(
            free_replay(response, CassetteKey(recording.key)),
            model_request_parameters=parameters,
            replay_events=recording.stream_events(),
        )

    def record(
        self,
        key: CassetteKey,
        request: CassetteKey,
        site: CallSite,
        events: list[ModelResponseStreamEvent],
        response: ModelResponse,
    ) -> None:
        if not self.policy.behavior.writes:
            return
        recording = self.recording(key, request, site, events, response)
        self.policy.session.guard(recording, site)
        self.policy.store.save(recording, site)

    def recording(
        self,
        key: CassetteKey,
        request: CassetteKey,
        site: CallSite,
        events: list[ModelResponseStreamEvent],
        response: ModelResponse,
    ) -> CassetteRecording:
        stored_events, stored_response = self.redacted(events, response)
        return CassetteRecording(
            key=key,
            request_key=request,
            model_ref=self.model_ref,
            site=RecordedSite(address=site.address, attempt=site.attempt),
            events=self.as_list(self.scrubber.scrub(jsonable(EVENTS_ADAPTER.dump_python(stored_events, mode="json")))),
            response=self.scrubber.scrub(
                self.first(jsonable(ModelMessagesTypeAdapter.dump_python([stored_response], mode="json")))
            ),
        )

    def redacted(
        self, events: list[ModelResponseStreamEvent], response: ModelResponse
    ) -> tuple[list[ModelResponseStreamEvent], ModelResponse]:
        redaction = self.policy.redaction
        if redaction is None or not redaction.redact_responses:
            return events, response
        return PartRedaction(redaction.redactor).collapse(events), redact_response(response, redaction.redactor)

    @staticmethod
    def as_list(value: JsonValue) -> list[JsonValue]:
        return value if isinstance(value, list) else []

    @staticmethod
    def first(value: JsonValue) -> JsonValue:
        return value[0] if isinstance(value, list) and value else None

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        request, key = self.keys(messages, model_settings, model_request_parameters)
        site = current_call_site()
        recording = self.policy.store.load(key, site) if self.policy.behavior.reads else None
        if recording is not None:
            yield self.replay(recording, model_request_parameters)
            return
        if self.policy.behavior.strict:
            raise CassetteMiss(key, site, self.model_ref)
        async with self.wrapped.request_stream(
            messages, model_settings, model_request_parameters, run_context
        ) as stream:
            yield RelayedStream(stream, RecordingRelay(self, stream, key, request))
