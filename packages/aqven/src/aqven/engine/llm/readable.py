import json
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Final, TypeGuard, overload

from pydantic import ValidationError

from aqven.spec import DynamicValue, FieldSpec, MediaValue

INDENT: Final = "  "
LINE_SEPARATOR: Final = "\n"
MEDIA_KEY: Final = "$media"
NULL_TEXT: Final = "null"
TRUE_TEXT: Final = "true"
FALSE_TEXT: Final = "false"
EMPTY_RECORD: Final = "{}"
EMPTY_LIST: Final = "[]"
DYNAMIC_KEYS: Final = frozenset({"value", "fields", "schema_hash"})
FIELD_SPEC_KEYS: Final = frozenset({"name", "type", "description"})
DYNAMIC_HEAD: Final = "- {name} ({description}):"
NAMED_MEDIA: Final = "[{media_type} {name}, {size} bytes]"
PLAIN_MEDIA: Final = "[{media_type}, {size} bytes]"


class ReadableMapping(dict[str, object]):
    __slots__ = ("text",)

    def __init__(self, items: Mapping[str, object], text: str) -> None:
        super().__init__(items)
        self.text = text

    def __str__(self) -> str:
        return self.text


class ReadableSequence(Sequence[object]):
    __slots__ = ("items", "text")

    def __init__(self, items: Sequence[object], text: str) -> None:
        self.items = tuple(items)
        self.text = text

    @overload
    def __getitem__(self, index: int) -> object: ...

    @overload
    def __getitem__(self, index: slice) -> Sequence[object]: ...

    def __getitem__(self, index: int | slice) -> object | Sequence[object]:
        return self.items[index]

    def __len__(self) -> int:
        return len(self.items)

    def __str__(self) -> str:
        return self.text


@dataclass(frozen=True, slots=True)
class Rendered:
    value: object
    lines: tuple[str, ...]
    structured: bool = False


type Shape = Callable[[object], Rendered | None]


def readable_values(document: Mapping[str, object]) -> dict[str, object]:
    return {name: readable_value(value) for name, value in document.items()}


def readable_value(value: object) -> object:
    return _render(value).value


def readable_text(value: object) -> str:
    return LINE_SEPARATOR.join(_render(value).lines)


def dynamic_text(dynamic: DynamicValue) -> str:
    return LINE_SEPARATOR.join(_dynamic_lines(dynamic))


def scalar_text(value: object) -> str:
    match value:
        case None:
            return NULL_TEXT
        case bool():
            return TRUE_TEXT if value else FALSE_TEXT
        case str():
            return value
        case int() | float():
            return json.dumps(value)
        case _:
            return str(value)


def _render(value: object) -> Rendered:
    found = next((rendered for shape in SHAPES if (rendered := shape(value)) is not None), None)
    if found is not None:
        return found
    return Rendered(value, (scalar_text(value),))


def _media(value: object) -> Rendered | None:
    items = _mapping_items(value)
    if items is None or MEDIA_KEY not in items:
        return None
    try:
        media = MediaValue.model_validate(items)
    except ValidationError:
        return None
    text = _media_text(media)
    return Rendered(ReadableMapping(items, text), (text,))


def _media_text(media: MediaValue) -> str:
    if media.name is None:
        return PLAIN_MEDIA.format(media_type=media.media_type, size=media.size_bytes)
    return NAMED_MEDIA.format(media_type=media.media_type, name=media.name, size=media.size_bytes)


def _dynamic(value: object) -> Rendered | None:
    items = _mapping_items(value)
    if items is None or frozenset(items) != DYNAMIC_KEYS:
        return None
    try:
        dynamic = DynamicValue.model_validate(items)
    except ValidationError:
        return None
    lines = _dynamic_lines(dynamic)
    return Rendered(ReadableMapping(_children(items), LINE_SEPARATOR.join(lines)), lines, structured=True)


def _dynamic_lines(dynamic: DynamicValue) -> tuple[str, ...]:
    values = _mapping_items(dynamic.value)
    if values is None:
        return _render(dynamic.value).lines
    return tuple(
        line
        for spec in dynamic.fields
        for line in _entry(DYNAMIC_HEAD.format(name=spec.name, description=spec.description), values.get(spec.name))
    )


def _field_spec(value: object) -> Rendered | None:
    items = _mapping_items(value)
    if items is None or not frozenset(items) >= FIELD_SPEC_KEYS:
        return None
    try:
        FieldSpec.model_validate(items)
    except ValidationError:
        return None
    return _record(items, tuple(key for key, item in items.items() if item is not None))


def _mapping(value: object) -> Rendered | None:
    items = _mapping_items(value)
    return None if items is None else _record(items, tuple(items))


def _record(items: Mapping[str, object], shown: Sequence[str]) -> Rendered:
    lines = tuple(line for key in shown for line in _entry(f"{key}:", items[key]))
    text = LINE_SEPARATOR.join(lines) if lines else EMPTY_RECORD
    return Rendered(ReadableMapping(_children(items), text), lines or (EMPTY_RECORD,), structured=bool(lines))


def _sequence(value: object) -> Rendered | None:
    items = _sequence_items(value)
    if items is None:
        return None
    rendered = [_render(item) for item in items]
    lines = tuple(line for item in rendered for line in _item_lines(item.lines))
    text = LINE_SEPARATOR.join(lines) if lines else EMPTY_LIST
    values = ReadableSequence([item.value for item in rendered], text)
    return Rendered(values, lines or (EMPTY_LIST,), structured=bool(lines))


def _entry(head: str, value: object) -> Iterator[str]:
    rendered = _render(value)
    lines = rendered.lines
    if len(lines) == 1 and not rendered.structured:
        yield f"{head} {lines[0]}"
        return
    yield head
    yield from (INDENT + line for line in lines)


def _item_lines(lines: Sequence[str]) -> Iterator[str]:
    yield f"- {lines[0]}"
    yield from (INDENT + line for line in lines[1:])


def _children(items: Mapping[str, object]) -> dict[str, object]:
    return {key: readable_value(item) for key, item in items.items()}


def _is_mapping(value: object) -> TypeGuard[Mapping[str, object]]:
    return isinstance(value, Mapping)


def _is_sequence(value: object) -> TypeGuard[Sequence[object]]:
    return isinstance(value, Sequence) and not isinstance(value, str | bytes | Mapping)


def _mapping_items(value: object) -> dict[str, object] | None:
    if not _is_mapping(value):
        return None
    return dict(value)


def _sequence_items(value: object) -> tuple[object, ...] | None:
    return tuple(value) if _is_sequence(value) else None


def _temporal(value: object) -> Rendered | None:
    if not isinstance(value, date):
        return None
    text = value.isoformat()
    return Rendered(text, (text,))


SHAPES: Final[tuple[Shape, ...]] = (_media, _dynamic, _field_spec, _mapping, _sequence, _temporal)
