import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from typing import Final

from pydantic import JsonValue

from aqven.check.simulation.regex import sample_text
from aqven.runtime.address import JsonObject
from aqven.testing.blobs import media_value

type Schema = Mapping[str, JsonValue]

MEDIA_KEY: Final = "$media"
DEFINITIONS_KEY: Final = "$defs"
REFERENCE_KEY: Final = "$ref"
DEFINITIONS_PREFIX: Final = "#/$defs/"
TEXT_PREFIX: Final = "simulated"
PAD_CHARACTER: Final = "x"
DEFAULT_LIST_ITEMS: Final = 2
DEFAULT_DEPTH: Final = 8
DEFAULT_NUMBER: Final = 0.5
DEFAULT_INTEGER: Final = 1
TEXT_LIMIT: Final = 120

PNG_PIXEL: Final = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478"
    "9c6360000002000154a24f1e0000000049454e44ae426082"
)
WAV_CLIP: Final = (
    b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00"
    b"\x80>\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
)
MP4_CLIP: Final = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
PDF_PAGE: Final = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
TEXT_FILE: Final = b"aqven simulation document\n"


@dataclass(frozen=True, slots=True)
class MediaSample:
    media_type: str
    data: bytes


MEDIA_SAMPLES: Final[tuple[MediaSample, ...]] = (
    MediaSample("image/png", PNG_PIXEL),
    MediaSample("audio/wav", WAV_CLIP),
    MediaSample("video/mp4", MP4_CLIP),
    MediaSample("application/pdf", PDF_PAGE),
    MediaSample("text/plain", TEXT_FILE),
)

FORMAT_SAMPLES: Final[Mapping[str, str]] = {
    "date": "2026-01-01",
    "date-time": "2026-01-01T00:00:00Z",
    "time": "00:00:00",
    "duration": "PT1S",
    "uuid": "00000000-0000-4000-8000-000000000000",
    "email": "user@example.com",
    "uri": "https://example.com/a",
    "hostname": "example.com",
}

GENERIC_SAMPLES: Final[tuple[str, ...]] = (
    "a",
    "a1",
    "abc",
    "Abc",
    "2026-01-01",
    "2026-01-01T00:00:00Z",
    "00000000-0000-4000-8000-000000000000",
    "en-US",
    "Europe/Berlin",
    "user@example.com",
    "https://example.com/a",
    "sha256-" + "0" * 64,
    "ref:env/AQVEN_SIMULATION",
    "openrouter:openai/gpt-oss-20b",
    "$input.a",
    "0",
)


@dataclass(frozen=True, slots=True)
class Context:
    defs: Mapping[str, Schema]
    name: str
    depth: int = 0
    index: int = 0

    def field(self, name: str) -> Context:
        return replace(self, name=name, depth=self.depth + 1)

    def item(self, index: int) -> Context:
        return replace(self, depth=self.depth + 1, index=index + 1)


@dataclass(frozen=True, slots=True)
class ValueFactory:
    list_items: int = DEFAULT_LIST_ITEMS
    max_depth: int = DEFAULT_DEPTH

    def record(self, schema: Schema, name: str) -> JsonObject:
        built = self.value(schema, name)
        return built if isinstance(built, dict) else {}

    def value(self, schema: Schema, name: str) -> JsonValue:
        return self.build(schema, Context(defs=definitions(schema), name=name))

    def build(self, schema: Schema, context: Context) -> JsonValue:
        resolved = self.resolved_schema(schema, context)
        if context.depth > self.max_depth:
            return None
        if "const" in resolved:
            return resolved["const"]
        options = choices(resolved)
        if options:
            return options[context.index % len(options)]
        if MEDIA_KEY in properties_of(resolved):
            return self.media_record(resolved, context)
        variants = union_of(resolved)
        if variants is not None:
            return self.build(variants, context)
        return BUILDERS.get(type_name(resolved), ValueFactory.empty_value)(self, resolved, context)

    def resolved_schema(self, schema: Schema, context: Context) -> Schema:
        reference = text_of(schema, REFERENCE_KEY)
        merged = merged_schema(schema)
        if reference is None:
            return merged
        target = context.defs.get(reference.removeprefix(DEFINITIONS_PREFIX), {})
        return {**target, **{key: value for key, value in merged.items() if key != REFERENCE_KEY}}

    def media_record(self, schema: Schema, context: Context) -> JsonValue:
        sample = media_sample(properties_of(schema).get(MEDIA_KEY))
        media = media_value(sample.data, sample.media_type, f"{context.name or 'file'}")
        return media.model_dump(mode="json", by_alias=True)

    def object_record(self, schema: Schema, context: Context) -> JsonValue:
        properties = properties_of(schema)
        return {name: self.build(child, context.field(name)) for name, child in properties.items()}

    def array_items(self, schema: Schema, context: Context) -> JsonValue:
        items = schema_of(schema.get("items")) or {}
        count = array_length(schema, self.list_items)
        return [self.build(items, context.item(index)) for index in range(count)]

    def text_value(self, schema: Schema, context: Context) -> JsonValue:
        minimum = int_of(schema, "minLength") or 0
        maximum = int_of(schema, "maxLength")
        pattern = text_of(schema, "pattern")
        sample = FORMAT_SAMPLES.get(text_of(schema, "format") or "")
        drawn = sample_text(pattern, minimum) if pattern is not None else None
        candidates = (drawn, sample, phrase(context.name, context.index), *GENERIC_SAMPLES)
        fitting = (item for item in candidates if item is not None and fits(item, minimum, maximum, pattern))
        return next(fitting, padded(context.name, context.index, minimum, maximum))

    def integer_value(self, schema: Schema, context: Context) -> JsonValue:
        return int(bounded(schema, float(DEFAULT_INTEGER)))

    def number_value(self, schema: Schema, context: Context) -> JsonValue:
        return bounded(schema, DEFAULT_NUMBER)

    def boolean_value(self, schema: Schema, context: Context) -> JsonValue:
        return True

    def null_value(self, schema: Schema, context: Context) -> JsonValue:
        return None

    def empty_value(self, schema: Schema, context: Context) -> JsonValue:
        return {} if "properties" in schema else None


type Builder = Callable[[ValueFactory, Schema, Context], JsonValue]

BUILDERS: Final[Mapping[str, Builder]] = {
    "object": ValueFactory.object_record,
    "array": ValueFactory.array_items,
    "string": ValueFactory.text_value,
    "integer": ValueFactory.integer_value,
    "number": ValueFactory.number_value,
    "boolean": ValueFactory.boolean_value,
    "null": ValueFactory.null_value,
}


def definitions(schema: Schema) -> Mapping[str, Schema]:
    found = schema.get(DEFINITIONS_KEY)
    if not isinstance(found, dict):
        return {}
    return {name: value for name, value in found.items() if isinstance(value, dict)}


def properties_of(schema: Schema) -> Mapping[str, Schema]:
    found = schema.get("properties")
    if not isinstance(found, dict):
        return {}
    return {name: value for name, value in found.items() if isinstance(value, dict)}


def schema_of(value: JsonValue) -> Schema | None:
    return value if isinstance(value, dict) else None


def text_of(schema: Schema, key: str) -> str | None:
    value = schema.get(key)
    return value if isinstance(value, str) else None


def int_of(schema: Schema, key: str) -> int | None:
    value = schema.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def number_of(schema: Schema, key: str) -> float | None:
    value = schema.get(key)
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def choices(schema: Schema) -> tuple[JsonValue, ...]:
    found = schema.get("enum")
    return tuple(found) if isinstance(found, list) and found else ()


def type_name(schema: Schema) -> str:
    declared = schema.get("type")
    if isinstance(declared, str):
        return declared
    if not isinstance(declared, list):
        return ""
    named = [item for item in declared if isinstance(item, str) and item != "null"]
    return named[0] if named else "null"


def merged_schema(schema: Schema) -> Schema:
    parts = schema.get("allOf")
    if not isinstance(parts, list):
        return schema
    merged: dict[str, JsonValue] = {key: value for key, value in schema.items() if key != "allOf"}
    for part in parts:
        if isinstance(part, dict):
            merged.update(part)
    return merged


def union_of(schema: Schema) -> Schema | None:
    for key in ("anyOf", "oneOf"):
        options = schema.get(key)
        if not isinstance(options, list):
            continue
        chosen = next((item for item in options if isinstance(item, dict) and item.get("type") != "null"), None)
        if chosen is not None:
            return chosen
    return None


def media_sample(schema: Schema | None) -> MediaSample:
    pattern = text_of(schema or {}, "pattern") or ""
    matching = (sample for sample in MEDIA_SAMPLES if re.fullmatch(pattern, sample.media_type))
    return next(matching, MEDIA_SAMPLES[-1]) if pattern else MEDIA_SAMPLES[-1]


def array_length(schema: Schema, wanted: int) -> int:
    minimum = int_of(schema, "minItems") or 0
    maximum = int_of(schema, "maxItems")
    count = max(wanted, minimum)
    return min(count, maximum) if maximum is not None else count


def bounded(schema: Schema, fallback: float) -> float:
    low = number_of(schema, "minimum")
    high = number_of(schema, "maximum")
    if low is not None and high is not None:
        return (low + high) / 2
    if low is not None:
        return low + 1
    if high is not None:
        return min(fallback, high)
    return fallback


def phrase(name: str, index: int = 0) -> str:
    numbered = f"{name} {index}" if index else name
    return f"{TEXT_PREFIX} {numbered}".strip()[:TEXT_LIMIT]


def fits(value: str, minimum: int, maximum: int | None, pattern: str | None) -> bool:
    if len(value) < minimum or (maximum is not None and len(value) > maximum):
        return False
    return pattern is None or re.fullmatch(pattern, value) is not None


def padded(name: str, index: int, minimum: int, maximum: int | None) -> str:
    text = phrase(name, index) or PAD_CHARACTER
    filled = text + PAD_CHARACTER * max(minimum - len(text), 0)
    return filled if maximum is None else filled[:maximum]
