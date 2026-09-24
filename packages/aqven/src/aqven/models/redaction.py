import re
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, replace
from typing import Final, Protocol

from pydantic import TypeAdapter
from pydantic_ai.messages import (
    BaseToolCallPart,
    FinalResultEvent,
    ModelMessage,
    ModelRequest,
    ModelRequestPart,
    ModelResponse,
    ModelResponsePart,
    ModelResponseStreamEvent,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    RetryPromptPart,
    SystemPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings

from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel


class TextRedactor(Protocol):
    def redact(self, text: str) -> str: ...


@dataclass(frozen=True, slots=True)
class PiiPattern:
    placeholder: str
    pattern: re.Pattern[str]


PII_PATTERNS: Final[Mapping[str, PiiPattern]] = {
    "email": PiiPattern("<EMAIL>", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    "iban": PiiPattern("<IBAN>", re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b")),
    "card_number": PiiPattern("<CARD_NUMBER>", re.compile(r"\b(?:\d[ -]?){12,18}\d\b")),
    "phone": PiiPattern("<PHONE>", re.compile(r"(?<![\w+])\+?\d[\d ()-]{7,}\d\b")),
    "ip_address": PiiPattern("<IP_ADDRESS>", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")),
}

PATTERN_ORDER: Final = ("email", "iban", "card_number", "ip_address", "phone")


class UnknownPiiDetector(ValueError):
    def __init__(self, detector: str) -> None:
        super().__init__(f"unknown PII detector {detector!r}; known: {sorted(PII_PATTERNS)}")
        self.detector = detector


class PatternRedactor:
    def __init__(self, detectors: Sequence[str]) -> None:
        unknown = [detector for detector in detectors if detector not in PII_PATTERNS]
        if unknown:
            raise UnknownPiiDetector(unknown[0])
        chosen = set(detectors)
        self.patterns = tuple(PII_PATTERNS[name] for name in PATTERN_ORDER if name in chosen)

    def redact(self, text: str) -> str:
        for entry in self.patterns:
            text = entry.pattern.sub(entry.placeholder, text)
        return text


@dataclass(frozen=True, slots=True)
class RedactionPolicy:
    redactor: TextRedactor
    redact_responses: bool = False


type ValueRedactor = Callable[[object, TextRedactor], object]

OBJECT_MAP: Final[TypeAdapter[dict[str, object]]] = TypeAdapter(dict[str, object])
OBJECT_LIST: Final[TypeAdapter[list[object]]] = TypeAdapter(list[object])
OBJECT_TUPLE: Final[TypeAdapter[tuple[object, ...]]] = TypeAdapter(tuple[object, ...])


def redact_text(value: object, redactor: TextRedactor) -> object:
    return redactor.redact(str(value))


def redact_mapping(value: object, redactor: TextRedactor) -> object:
    return {key: redact_value(item, redactor) for key, item in OBJECT_MAP.validate_python(value).items()}


def redact_list(value: object, redactor: TextRedactor) -> object:
    return [redact_value(item, redactor) for item in OBJECT_LIST.validate_python(value)]


def redact_tuple(value: object, redactor: TextRedactor) -> object:
    return tuple(redact_value(item, redactor) for item in OBJECT_TUPLE.validate_python(value))


VALUE_REDACTORS: Final[Mapping[type, ValueRedactor]] = {
    str: redact_text,
    dict: redact_mapping,
    list: redact_list,
    tuple: redact_tuple,
}


def redact_value(value: object, redactor: TextRedactor) -> object:
    handler = VALUE_REDACTORS.get(type(value))
    return value if handler is None else handler(value, redactor)


REDACTED_FIELDS: Final[Mapping[type, str]] = {
    SystemPromptPart: "content",
    UserPromptPart: "content",
    ToolReturnPart: "content",
    RetryPromptPart: "content",
    TextPart: "content",
    ThinkingPart: "content",
    ToolCallPart: "args",
}


def redacted_field(part: object, redactor: TextRedactor) -> dict[str, object]:
    field_name = REDACTED_FIELDS.get(type(part))
    if field_name is None:
        return {}
    return {field_name: redact_value(getattr(part, field_name), redactor)}


def redact_request_part(part: ModelRequestPart, redactor: TextRedactor) -> ModelRequestPart:
    return replace(part, **redacted_field(part, redactor))


def redact_response_part(part: ModelResponsePart, redactor: TextRedactor) -> ModelResponsePart:
    return replace(part, **redacted_field(part, redactor))


def redact_request(message: ModelRequest, redactor: TextRedactor) -> ModelRequest:
    instructions = None if message.instructions is None else redactor.redact(message.instructions)
    parts = [redact_request_part(part, redactor) for part in message.parts]
    return replace(message, parts=parts, instructions=instructions)


def redact_response(message: ModelResponse, redactor: TextRedactor) -> ModelResponse:
    return replace(message, parts=[redact_response_part(part, redactor) for part in message.parts])


def redact_message(message: ModelMessage, redactor: TextRedactor) -> ModelMessage:
    if isinstance(message, ModelRequest):
        return redact_request(message, redactor)
    return redact_response(message, redactor)


def redact_messages(messages: Sequence[ModelMessage], redactor: TextRedactor) -> list[ModelMessage]:
    return [redact_message(message, redactor) for message in messages]


def buffered_part(part: ModelResponsePart) -> bool:
    return isinstance(part, TextPart | ThinkingPart | BaseToolCallPart)


class PartRedaction:
    def __init__(self, redactor: TextRedactor) -> None:
        self.redactor = redactor
        self.held_final: list[FinalResultEvent] = []

    def start(self, event: PartStartEvent) -> list[ModelResponseStreamEvent]:
        if buffered_part(event.part):
            return []
        return [replace(event, part=redact_response_part(event.part, self.redactor)), *self.release_final()]

    def end(self, event: PartEndEvent) -> list[ModelResponseStreamEvent]:
        part = redact_response_part(event.part, self.redactor)
        start = PartStartEvent(index=event.index, part=part)
        return [start, *self.release_final(), replace(event, part=part)]

    def final(self, event: FinalResultEvent) -> list[ModelResponseStreamEvent]:
        self.held_final.append(event)
        return []

    def release_final(self) -> list[ModelResponseStreamEvent]:
        released: list[ModelResponseStreamEvent] = list(self.held_final)
        self.held_final.clear()
        return released

    def apply(self, event: ModelResponseStreamEvent) -> list[ModelResponseStreamEvent]:
        match event:
            case PartStartEvent():
                return self.start(event)
            case PartEndEvent():
                return self.end(event)
            case FinalResultEvent():
                return self.final(event)
            case PartDeltaEvent():
                return []

    def collapse(self, events: Sequence[ModelResponseStreamEvent]) -> list[ModelResponseStreamEvent]:
        collapsed = [item for event in events for item in self.apply(event)]
        return [*collapsed, *self.release_final()]


class ResponseRedactionRelay:
    def __init__(self, redactor: TextRedactor) -> None:
        self.redactor = redactor
        self.parts = PartRedaction(redactor)

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            for item in self.parts.apply(event):
                yield item
        for item in self.parts.release_final():
            yield item

    def response(self, response: ModelResponse) -> ModelResponse:
        return redact_response(response, self.redactor)


class RedactingModel(StreamFirstModel):
    def __init__(self, wrapped: Model, *, policy: RedactionPolicy) -> None:
        super().__init__(wrapped)
        self.policy = policy

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        redacted = redact_messages(messages, self.policy.redactor)
        async with self.wrapped.request_stream(
            redacted, model_settings, model_request_parameters, run_context
        ) as stream:
            yield self.relay(stream)

    def relay(self, stream: StreamedResponse) -> StreamedResponse:
        if not self.policy.redact_responses:
            return stream
        return RelayedStream(stream, ResponseRedactionRelay(self.policy.redactor))
