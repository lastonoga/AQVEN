from collections.abc import Callable, Iterable, Mapping, Sequence
from importlib import import_module
from typing import Final, cast

PARSE: Final[Callable[[str], object]] = cast("Callable[[str], object]", import_module("re._parser").parse)

REPEAT_CAP: Final = 64
DEFAULT_CHAR: Final = "a"
CATEGORY_CHARS: Final[Mapping[str, str]] = {
    "CATEGORY_DIGIT": "0",
    "CATEGORY_NOT_DIGIT": "a",
    "CATEGORY_WORD": "a",
    "CATEGORY_NOT_WORD": "-",
    "CATEGORY_SPACE": " ",
    "CATEGORY_NOT_SPACE": "a",
    "CATEGORY_LINEBREAK": "\n",
    "CATEGORY_NOT_LINEBREAK": "a",
}
NEGATED_CANDIDATES: Final[tuple[str, ...]] = ("a", "0", "-", "A", "_", " ")
EMPTY: Final = ""


def sample_text(pattern: str, want: int) -> str | None:
    items = _items(_parsed(pattern))
    return None if items is None else _sequence(items, max(want, 1))


def _parsed(pattern: str) -> object:
    try:
        return PARSE(pattern)
    except Exception:
        return None


def _items(parsed: object) -> Sequence[object] | None:
    if parsed is None or isinstance(parsed, str | bytes | int):
        return None
    try:
        return list(cast("Iterable[object]", parsed))
    except TypeError:
        return None


def _tuple(item: object, size: int) -> tuple[object, ...] | None:
    if not isinstance(item, tuple):
        return None
    values = cast("tuple[object, ...]", item)
    return values if len(values) == size else None


def _pair(item: object) -> tuple[object, object] | None:
    values = _tuple(item, 2)
    return None if values is None else (values[0], values[1])


def _sequence(items: Sequence[object], want: int) -> str | None:
    parts: list[str] = []
    for item in items:
        text = _node(item, want)
        if text is None:
            return None
        parts.append(text)
    return "".join(parts)


def _node(item: object, want: int) -> str | None:
    pair = _pair(item)
    if pair is None:
        return None
    opcode, argument = pair
    handler = HANDLERS.get(str(opcode))
    return None if handler is None else handler(argument, want)


def _literal(argument: object, want: int) -> str | None:
    return chr(argument) if isinstance(argument, int) else None


def _not_literal(argument: object, want: int) -> str | None:
    if not isinstance(argument, int):
        return None
    return DEFAULT_CHAR if chr(argument) != DEFAULT_CHAR else "b"


def _any(argument: object, want: int) -> str | None:
    return DEFAULT_CHAR


def _skipped(argument: object, want: int) -> str | None:
    return EMPTY


def _set(argument: object, want: int) -> str | None:
    items = _items(argument)
    if items is None:
        return None
    if _negated(items):
        return _outside(items)
    chosen = (_set_char(item) for item in items)
    return next((char for char in chosen if char is not None), None)


def _repeat(argument: object, want: int) -> str | None:
    values = _tuple(argument, 3)
    if values is None:
        return None
    low, high, sub = values
    items = _items(sub)
    if items is None or not isinstance(low, int) or not isinstance(high, int):
        return None
    body = _sequence(items, 1)
    if body is None:
        return None
    return body * _count(low, high, want)


def _subpattern(argument: object, want: int) -> str | None:
    values = _tuple(argument, 4)
    if values is None:
        return None
    items = _items(values[3])
    return None if items is None else _sequence(items, want)


def _atomic(argument: object, want: int) -> str | None:
    items = _items(argument)
    return None if items is None else _sequence(items, want)


def _branch(argument: object, want: int) -> str | None:
    values = _tuple(argument, 2)
    if values is None:
        return None
    alternatives = _items(values[1])
    if alternatives is None:
        return None
    sampled = (_sequence(items, want) for option in alternatives if (items := _items(option)) is not None)
    return next((text for text in sampled if text is not None), None)


HANDLERS: Final[Mapping[str, Callable[[object, int], str | None]]] = {
    "LITERAL": _literal,
    "NOT_LITERAL": _not_literal,
    "ANY": _any,
    "AT": _skipped,
    "ASSERT": _skipped,
    "ASSERT_NOT": _skipped,
    "IN": _set,
    "MAX_REPEAT": _repeat,
    "MIN_REPEAT": _repeat,
    "POSSESSIVE_REPEAT": _repeat,
    "SUBPATTERN": _subpattern,
    "ATOMIC_GROUP": _atomic,
    "BRANCH": _branch,
}


def _count(low: int, high: int, want: int) -> int:
    return max(low, min(want, high, REPEAT_CAP))


def _negated(items: Sequence[object]) -> bool:
    first = _pair(items[0]) if items else None
    return first is not None and str(first[0]) == "NEGATE"


def _outside(items: Sequence[object]) -> str | None:
    forbidden = {char for item in items if (char := _set_char(item)) is not None}
    ranges = tuple(_range(item) for item in items)
    allowed = (
        candidate
        for candidate in NEGATED_CANDIDATES
        if candidate not in forbidden and not any(low <= ord(candidate) <= high for low, high in ranges if low >= 0)
    )
    return next(allowed, None)


def _range(item: object) -> tuple[int, int]:
    pair = _pair(item)
    bounds = _tuple(pair[1], 2) if pair is not None and str(pair[0]) == "RANGE" else None
    if bounds is None:
        return (-1, -1)
    low, high = bounds
    return (low, high) if isinstance(low, int) and isinstance(high, int) else (-1, -1)


def _set_char(item: object) -> str | None:
    pair = _pair(item)
    if pair is None:
        return None
    opcode, argument = pair
    name = str(opcode)
    if name == "LITERAL" and isinstance(argument, int):
        return chr(argument)
    if name == "CATEGORY":
        return CATEGORY_CHARS.get(str(argument))
    if name != "RANGE":
        return None
    low, high = _range(item)
    if low < 0:
        return None
    return DEFAULT_CHAR if low <= ord(DEFAULT_CHAR) <= high else chr(low)
