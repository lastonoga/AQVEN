import json
from dataclasses import dataclass
from typing import Final

from pydantic import BaseModel, ConfigDict, Field, JsonValue, TypeAdapter, ValidationError
from pydantic_ai import ModelAPIError, ModelHTTPError

from aqven.models.redaction import PATTERN_ORDER, PatternRedactor

LAYER_DEPTH: Final = 4
HEADLINE_LIMIT: Final = 240
HEADLINE_CAP: Final = 300
ELLIPSIS: Final = "…"
SENTENCE_END: Final = ". "
GENERIC_MESSAGES: Final = frozenset({"provider returned error", "error", "bad request"})
JSON_VALUES: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)
REDACTOR: Final = PatternRedactor(PATTERN_ORDER)


class RouterMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    raw: JsonValue = None
    provider_name: str | None = None


class ErrorEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    message: str | None = None
    code: int | str | None = None
    status: str | None = None
    kind: str | None = Field(default=None, alias="type")
    param: str | None = None
    error: JsonValue = None
    metadata: RouterMetadata | None = None


NO_METADATA: Final = RouterMetadata()


@dataclass(frozen=True, slots=True)
class ErrorLayer:
    message: str | None = None
    status: int | None = None
    label: str | None = None
    param: str | None = None
    provider: str | None = None

    def words(self) -> tuple[str, ...]:
        return tuple(item for item in (self.message, self.label, self.param) if item)


@dataclass(frozen=True, slots=True)
class ProviderFailure:
    model: str | None
    status: int | None
    message: str
    code: str | None
    provider: str | None
    param: str | None
    raw: str
    layers: tuple[ErrorLayer, ...] = ()

    @property
    def headline(self) -> str:
        line = one_line(self.message)
        if len(line) <= HEADLINE_LIMIT or SENTENCE_END not in line:
            return _capped(line)
        return _capped(line.split(SENTENCE_END, 1)[0] + ".")

    @property
    def searchable(self) -> str:
        words = (word for layer in self.layers for word in layer.words())
        return " ".join((*words, self.raw)).lower()

    @property
    def redacted_raw(self) -> str:
        return REDACTOR.redact(self.raw)

    def described(self) -> str:
        source = f"provider {self.provider}" if self.provider else "the provider"
        if self.status is None:
            return f"the call to {source} failed: {self.headline}"
        code = f" {self.code}" if self.code and self.code != str(self.status) else ""
        return f"{source} answered HTTP {self.status}{code}: {self.headline}"


def provider_failure(error: BaseException) -> ProviderFailure | None:
    match error:
        case ModelHTTPError():
            return failure_of_body(error.model_name, error.status_code, error.body)
        case ModelAPIError():
            return failure_of_body(error.model_name, None, error.message)
        case _:
            return None


def failure_of_body(model: str | None, status: int | None, body: object) -> ProviderFailure:
    value = _json_value(body)
    layers = error_layers(value)
    raw = _raw_text(value)
    message = next((layer.message for layer in layers if _specific(layer.message)), None)
    return ProviderFailure(
        model=model,
        status=status if status is not None else next((layer.status for layer in layers if layer.status), None),
        message=message or next((layer.message for layer in layers if layer.message), None) or raw,
        code=next((layer.label for layer in layers if layer.label), None),
        provider=next((layer.provider for layer in reversed(layers) if layer.provider), None),
        param=next((layer.param for layer in layers if layer.param), None),
        raw=raw,
        layers=layers,
    )


def error_layers(value: JsonValue, depth: int = 0) -> tuple[ErrorLayer, ...]:
    if depth > LAYER_DEPTH:
        return ()
    decoded = _decoded(value)
    if isinstance(decoded, str):
        return (ErrorLayer(message=decoded),) if decoded.strip() else ()
    if not isinstance(decoded, dict):
        return ()
    envelope = _envelope(decoded)
    if envelope is None:
        return ()
    metadata = envelope.metadata or NO_METADATA
    inner = (*error_layers(metadata.raw, depth + 1), *error_layers(envelope.error, depth + 1))
    return (*inner, _own_layer(envelope, metadata))


def one_line(text: str) -> str:
    return " ".join(text.split())


def _own_layer(envelope: ErrorEnvelope, metadata: RouterMetadata) -> ErrorLayer:
    code = envelope.code
    numeric = code if isinstance(code, int) and not isinstance(code, bool) else None
    textual = code if isinstance(code, str) and code else None
    return ErrorLayer(
        message=envelope.message,
        status=numeric,
        label=envelope.status or textual or envelope.kind,
        param=envelope.param,
        provider=metadata.provider_name,
    )


def _envelope(value: dict[str, JsonValue]) -> ErrorEnvelope | None:
    try:
        return ErrorEnvelope.model_validate(value)
    except ValidationError:
        return None


def _decoded(value: JsonValue) -> JsonValue:
    if not isinstance(value, str):
        return value
    try:
        return JSON_VALUES.validate_json(value)
    except ValidationError:
        return value.strip()


def _json_value(body: object) -> JsonValue:
    try:
        return JSON_VALUES.validate_python(body)
    except ValidationError:
        return str(body)


def _raw_text(value: JsonValue) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _specific(message: str | None) -> bool:
    return bool(message) and one_line(message or "").lower().rstrip(".") not in GENERIC_MESSAGES


def _capped(text: str) -> str:
    redacted = REDACTOR.redact(text)
    if len(redacted) <= HEADLINE_CAP:
        return redacted
    return redacted[: HEADLINE_CAP - len(ELLIPSIS)] + ELLIPSIS
