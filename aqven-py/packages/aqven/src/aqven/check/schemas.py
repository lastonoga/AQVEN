import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.spec import normalized_schema

type JsonObject = dict[str, JsonValue]
type KeywordCheck = Callable[[JsonValue, JsonObject], bool]
type StructuralCheck = Callable[[str, JsonValue, JsonObject], Rejection | None]

UNION_KEYS: Final = ("anyOf", "oneOf")
NUMERIC_TYPES: Final = frozenset({"integer", "number"})
VALUE_PREVIEW_LIMIT: Final = 120
POINTER_PREFIX: Final = "#"


@dataclass(frozen=True, slots=True)
class Rejection:
    pointer: str
    slot: JsonValue
    source: JsonValue

    def describe(self) -> str:
        return f"{POINTER_PREFIX}{self.pointer}: slot {_preview(self.slot)} ≠ source {_preview(self.source)}"


def schema_of(annotation: object) -> JsonValue | None:
    try:
        return normalized_schema(annotation)
    except Exception:
        return None


def accepts(slot: JsonValue, source: JsonValue) -> bool:
    return rejection(slot, source) is None


def rejection(slot: JsonValue, source: JsonValue, pointer: str = "") -> Rejection | None:
    if slot == source:
        return None
    if not isinstance(slot, dict) or not isinstance(source, dict):
        return Rejection(pointer, slot, source)
    source_members = _members(source)
    if source_members is not None:
        return _all_members(slot, source_members, pointer)
    slot_members = _members(slot)
    if slot_members is not None:
        return _any_member(slot, slot_members, source, pointer)
    return next(
        (found for key, value in slot.items() if (found := _keyword_rejection(key, value, source, pointer))),
        None,
    )


def json_pointer(pointer: str, segment: str | int) -> str:
    escaped = str(segment).replace("~", "~0").replace("/", "~1")
    return f"{pointer}/{escaped}"


def _all_members(slot: JsonObject, members: Sequence[JsonValue], pointer: str) -> Rejection | None:
    return next((found for member in members if (found := rejection(slot, member, pointer))), None)


def _any_member(slot: JsonObject, members: Sequence[JsonValue], source: JsonObject, pointer: str) -> Rejection | None:
    if any(rejection(member, source) is None for member in members):
        return None
    return Rejection(pointer, slot, source)


def _members(schema: JsonObject) -> Sequence[JsonValue] | None:
    return next((members for key in UNION_KEYS if isinstance(members := schema.get(key), list)), None)


def _keyword_rejection(key: str, value: JsonValue, source: JsonObject, pointer: str) -> Rejection | None:
    structural = STRUCTURAL_CHECKS.get(key)
    if structural is not None:
        return structural(pointer, value, source)
    check = KEYWORD_CHECKS.get(key)
    held = source.get(key) == value if check is None else check(value, source)
    return None if held else Rejection(json_pointer(pointer, key), value, source.get(key))


def _items(pointer: str, value: JsonValue, source: JsonObject) -> Rejection | None:
    return rejection(value, source.get("items"), json_pointer(pointer, "items"))


def _properties(pointer: str, value: JsonValue, source: JsonObject) -> Rejection | None:
    theirs = source.get("properties")
    location = json_pointer(pointer, "properties")
    if not isinstance(value, dict) or not isinstance(theirs, dict):
        return Rejection(location, value, theirs)
    if list(value) != list(theirs):
        return Rejection(location, list[JsonValue](value), list[JsonValue](theirs))
    pairs = ((name, slot, theirs[name]) for name, slot in value.items())
    return next(
        (found for name, slot, other in pairs if (found := rejection(slot, other, json_pointer(location, name)))),
        None,
    )


def _literals(source: JsonObject) -> list[JsonValue] | None:
    if "const" in source:
        return [source["const"]]
    values = source.get("enum")
    return values if isinstance(values, list) else None


def _type(value: JsonValue, source: JsonObject) -> bool:
    kind = source.get("type")
    return kind == value or (value == "number" and kind in NUMERIC_TYPES)


def _upper(key: str) -> KeywordCheck:
    def check(value: JsonValue, source: JsonObject) -> bool:
        bound = source.get(key)
        return _number(bound) is not None and _number(value) is not None and _le(bound, value)

    return check


def _lower(key: str) -> KeywordCheck:
    def check(value: JsonValue, source: JsonObject) -> bool:
        bound = source.get(key)
        return _number(bound) is not None and _number(value) is not None and _le(value, bound)

    return check


def _number(value: JsonValue) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _le(left: JsonValue, right: JsonValue) -> bool:
    low, high = _number(left), _number(right)
    return low is not None and high is not None and low <= high


def _max_length(value: JsonValue, source: JsonObject) -> bool:
    literals = _literals(source)
    if literals is not None:
        return all(isinstance(item, str) and _le(len(item), value) for item in literals)
    return _upper("maxLength")(value, source)


def _pattern(value: JsonValue, source: JsonObject) -> bool:
    literals = _literals(source)
    if source.get("pattern") == value:
        return True
    if literals is None or not isinstance(value, str):
        return False
    return all(isinstance(item, str) and re.search(value, item) is not None for item in literals)


def _enum(value: JsonValue, source: JsonObject) -> bool:
    literals = _literals(source)
    return isinstance(value, list) and literals is not None and all(item in value for item in literals)


def _const(value: JsonValue, source: JsonObject) -> bool:
    literals = _literals(source)
    return literals is not None and all(item == value for item in literals)


def _preview(value: JsonValue) -> str:
    text = str(value)
    return text if len(text) <= VALUE_PREVIEW_LIMIT else f"{text[: VALUE_PREVIEW_LIMIT - 3]}..."


KEYWORD_CHECKS: Final[Mapping[str, KeywordCheck]] = {
    "type": _type,
    "maxLength": _max_length,
    "minLength": _lower("minLength"),
    "maximum": _upper("maximum"),
    "exclusiveMaximum": _upper("exclusiveMaximum"),
    "minimum": _lower("minimum"),
    "exclusiveMinimum": _lower("exclusiveMinimum"),
    "maxItems": _upper("maxItems"),
    "minItems": _lower("minItems"),
    "pattern": _pattern,
    "enum": _enum,
    "const": _const,
    "format": lambda value, source: source.get("format") == value,
}

STRUCTURAL_CHECKS: Final[Mapping[str, StructuralCheck]] = {
    "items": _items,
    "properties": _properties,
}
