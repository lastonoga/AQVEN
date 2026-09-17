import json
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

type Schema = Mapping[str, JsonValue]

LIMITS_HEADER: Final = "Output limits (a value outside a limit is rejected and the answer is requested again):"
SECTION_SEPARATOR: Final = "\n\n"
PHRASE_SEPARATOR: Final = "; "
ENUM_SEPARATOR: Final = ", "
REF_KEY: Final = "$ref"
DEFS_KEY: Final = "$defs"
REF_PREFIX: Final = "#/$defs/"
VARIANT_KEYS: Final = ("anyOf", "oneOf", "allOf")
ITEM_SUFFIX: Final = "[]"
FIELD_SEPARATOR: Final = "."
MAX_DEPTH: Final = 12
NULL_TYPE: Final = "null"


@dataclass(frozen=True, slots=True)
class Bound:
    low: str
    high: str
    unit: str

    def phrase(self, schema: Schema) -> str | None:
        low = _number(schema.get(self.low))
        high = _number(schema.get(self.high))
        if low is None and high is None:
            return None
        if low is None:
            return f"at most {high}{self.unit}"
        if high is None:
            return f"at least {low}{self.unit}"
        return f"from {low} to {high}{self.unit}"


BOUNDS: Final[tuple[Bound, ...]] = (
    Bound("minLength", "maxLength", " characters"),
    Bound("minimum", "maximum", ""),
    Bound("minItems", "maxItems", " items"),
)


def output_limits(schema: Schema) -> str | None:
    defs = _mapping(schema.get(DEFS_KEY)) or {}
    lines = [f"- {path}: {text}" for path, text in _distinct(_walk(schema, "", defs, 0))]
    if not lines:
        return None
    return "\n".join((LIMITS_HEADER, *lines))


def join_instructions(sections: Iterable[str | None]) -> str | None:
    present = [section for section in sections if section]
    return SECTION_SEPARATOR.join(present) or None


def _walk(schema: Schema, path: str, defs: Schema, depth: int) -> Iterator[tuple[str, str]]:
    if depth > MAX_DEPTH:
        return
    for variant in _variants(schema, defs):
        phrases = [phrase for phrase in (*(bound.phrase(variant) for bound in BOUNDS), _enum(variant)) if phrase]
        if phrases and path:
            yield path, PHRASE_SEPARATOR.join(phrases)
        properties = _mapping(variant.get("properties")) or {}
        for name, child in properties.items():
            nested = _mapping(child)
            if nested is not None:
                yield from _walk(nested, _field_path(path, name), defs, depth + 1)
        items = _mapping(variant.get("items"))
        if items is not None:
            yield from _walk(items, f"{path}{ITEM_SUFFIX}", defs, depth + 1)


def _variants(schema: Schema, defs: Schema) -> tuple[Schema, ...]:
    resolved = _resolved(schema, defs)
    nested = [
        _resolved(option, defs)
        for key in VARIANT_KEYS
        for option in _schemas(resolved.get(key))
        if option.get("type") != NULL_TYPE
    ]
    return (resolved, *nested)


def _resolved(schema: Schema, defs: Schema) -> Schema:
    ref = schema.get(REF_KEY)
    if not isinstance(ref, str) or not ref.startswith(REF_PREFIX):
        return schema
    target = _mapping(defs.get(ref.removeprefix(REF_PREFIX)))
    return schema if target is None else target


def _enum(schema: Schema) -> str | None:
    values = schema.get("enum")
    if not isinstance(values, list) or not values:
        return None
    return "one of " + ENUM_SEPARATOR.join(json.dumps(value, ensure_ascii=False) for value in values)


def _number(value: JsonValue) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return json.dumps(value)


def _mapping(value: JsonValue) -> Schema | None:
    return value if isinstance(value, dict) else None


def _schemas(value: JsonValue) -> tuple[Schema, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, dict))


def _field_path(path: str, name: str) -> str:
    return f"{path}{FIELD_SEPARATOR}{name}" if path else name


def _distinct(pairs: Iterable[tuple[str, str]]) -> Sequence[tuple[str, str]]:
    return tuple(dict.fromkeys(pairs))
