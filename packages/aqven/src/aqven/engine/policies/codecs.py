from dataclasses import dataclass
from typing import Final, Protocol, TypeVar

from pydantic import BaseModel, JsonValue, TypeAdapter

JSON_ADAPTER: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)
PASS_THROUGH: Final[tuple[object, ...]] = (object, JsonValue, BaseModel, None)


class ValueCodec(Protocol):
    def decode(self, value: JsonValue) -> object: ...

    def encode(self, value: object) -> JsonValue: ...


@dataclass(frozen=True, slots=True)
class JsonCodec:
    def decode(self, value: JsonValue) -> object:
        return value

    def encode(self, value: object) -> JsonValue:
        if isinstance(value, BaseModel):
            return JSON_ADAPTER.validate_python(value.model_dump(mode="json", by_alias=True))
        return JSON_ADAPTER.validate_python(value)


@dataclass(frozen=True, slots=True)
class AdapterCodec:
    adapter: TypeAdapter[object]

    def decode(self, value: JsonValue) -> object:
        return self.adapter.validate_python(value)

    def encode(self, value: object) -> JsonValue:
        return JSON_ADAPTER.validate_python(self.adapter.dump_python(value, mode="json", by_alias=True))


JSON_CODEC: Final = JsonCodec()


def codec_for(annotation: object) -> ValueCodec:
    if isinstance(annotation, TypeVar) or any(annotation is item for item in PASS_THROUGH):
        return JSON_CODEC
    return AdapterCodec(TypeAdapter[object](annotation))
