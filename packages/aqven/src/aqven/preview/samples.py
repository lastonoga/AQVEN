from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.runtime.address import JsonObject

type Schema = Mapping[str, JsonValue]
type SampleBuilder = Callable[["Sampler", Schema, str, int], JsonValue]

MAX_DEPTH: Final = 8
MAX_ITEMS: Final = 2
MAX_TEXT: Final = 120
REF_KEY: Final = "$ref"
DEFS_KEY: Final = "$defs"
REF_PREFIX: Final = "#/$defs/"
OPTION_KEYS: Final = ("anyOf", "oneOf", "allOf")
NULL_TYPE: Final = "null"
DEFAULT_NAME: Final = "value"
FORMAT_SAMPLES: Final[Mapping[str, str]] = {
    "date": "2026-01-01",
    "date-time": "2026-01-01T09:00:00Z",
    "time": "09:00:00",
    "duration": "PT1H",
    "email": "person@example.invalid",
    "uri": "https://example.invalid/sample",
    "uuid": "00000000-0000-4000-8000-000000000000",
}


@dataclass(frozen=True, slots=True)
class Sampler:
    defs: Schema

    def value(self, schema: Schema, name: str, depth: int) -> JsonValue:
        resolved = self.resolve(schema)
        if "const" in resolved:
            return resolved["const"]
        if "default" in resolved:
            return resolved["default"]
        listed = resolved.get("enum")
        if isinstance(listed, list) and listed:
            return listed[0]
        if depth >= MAX_DEPTH:
            return None
        option = self.option(resolved)
        if option is not None:
            return self.value(option, name, depth + 1)
        return BUILDERS.get(_type_name(resolved), _text)(self, resolved, name, depth)

    def resolve(self, schema: Schema) -> Schema:
        reference = schema.get(REF_KEY)
        if not isinstance(reference, str) or not reference.startswith(REF_PREFIX):
            return schema
        target = _mapping(self.defs.get(reference.removeprefix(REF_PREFIX)))
        return schema if target is None else target

    def option(self, schema: Schema) -> Schema | None:
        options = [
            option
            for key in OPTION_KEYS
            for option in _mappings(schema.get(key))
            if self.resolve(option).get("type") != NULL_TYPE
        ]
        return options[0] if options else None


def sample_document(schema: Schema) -> JsonObject:
    sampler = Sampler(_mapping(schema.get(DEFS_KEY)) or {})
    properties = _mapping(sampler.resolve(schema).get("properties")) or {}
    return {name: sampler.value(child, name, 1) for name, child in _children(properties)}


def _text(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    fixed = FORMAT_SAMPLES.get(_string(schema.get("format")) or "")
    return _sized(fixed or f"<{name or DEFAULT_NAME}>", schema)


def _integer(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    return int(_bounded(schema, 1.0))


def _number(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    return _bounded(schema, 1.0)


def _boolean(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    return True


def _null(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    return None


def _array(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    items = _mapping(schema.get("items"))
    if items is None:
        return []
    count = min(max(_integer_option(schema.get("minItems")) or 1, 1), _integer_option(schema.get("maxItems")) or 1)
    return [sampler.value(items, name, depth + 1) for _ in range(min(count, MAX_ITEMS))]


def _object(sampler: Sampler, schema: Schema, name: str, depth: int) -> JsonValue:
    properties = _mapping(schema.get("properties"))
    if properties:
        return {key: sampler.value(child, key, depth + 1) for key, child in _children(properties)}
    extra = _mapping(schema.get("additionalProperties"))
    return {} if extra is None else {name or DEFAULT_NAME: sampler.value(extra, name, depth + 1)}


BUILDERS: Final[Mapping[str, SampleBuilder]] = {
    "string": _text,
    "integer": _integer,
    "number": _number,
    "boolean": _boolean,
    "array": _array,
    "object": _object,
    NULL_TYPE: _null,
}


def _type_name(schema: Schema) -> str:
    name = schema.get("type")
    if isinstance(name, str):
        return name
    listed = [item for item in _strings(name) if item != NULL_TYPE]
    if listed:
        return listed[0]
    return "object" if "properties" in schema else "string"


def _sized(text: str, schema: Schema) -> str:
    high = _integer_option(schema.get("maxLength"))
    low = _integer_option(schema.get("minLength"))
    trimmed = text[:high] if high is not None else text
    if low is None or len(trimmed) >= low:
        return trimmed
    return trimmed.ljust(min(low, MAX_TEXT), "x")


def _bounded(schema: Schema, fallback: float) -> float:
    low = _number_option(schema.get("minimum")) or _number_option(schema.get("exclusiveMinimum"))
    high = _number_option(schema.get("maximum"))
    chosen = low if low is not None else fallback
    return min(chosen, high) if high is not None else chosen


def _children(properties: Schema) -> list[tuple[str, Schema]]:
    return [(name, child) for name, value in properties.items() if (child := _mapping(value)) is not None]


def _mapping(value: JsonValue) -> Schema | None:
    return value if isinstance(value, dict) else None


def _mappings(value: JsonValue) -> list[Schema]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _strings(value: JsonValue) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _string(value: JsonValue) -> str | None:
    return value if isinstance(value, str) else None


def _integer_option(value: JsonValue) -> int | None:
    number = _number_option(value)
    return None if number is None else int(number)


def _number_option(value: JsonValue) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
