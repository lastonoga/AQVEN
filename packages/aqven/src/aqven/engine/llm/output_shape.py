from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.engine.llm.instructions import Schema
from aqven.runtime.executions import OutputShape

REF_PREFIX: Final = "#/$defs/"
ROOT_PATH: Final = ""
ROOT_LABEL: Final = "output"
ITEMS_SUFFIX: Final = "[]"
MAP_SUFFIX: Final = ".*"
MAX_DEPTH: Final = 32
FLAT_DEPTH: Final = 1
OPTION_KEYS: Final = ("anyOf", "oneOf", "allOf")

type Size = Callable[[Schema], int | None]


@dataclass(frozen=True, slots=True)
class SchemaNode:
    path: str
    depth: int
    schema: Schema


@dataclass(frozen=True, slots=True)
class Measure:
    path: str
    value: int
    nested: bool


def output_shape(schema: Schema) -> OutputShape:
    nodes = tuple(schema_nodes(schema))
    deepest = max(nodes, key=lambda node: node.depth, default=None)
    deepest_path = None if deepest is None or deepest.depth == 0 else deepest.path
    widest = _largest(_measures(nodes, _max_items, deepest_path))
    enum = _largest(_measures(nodes, _enum_size, deepest_path))
    return OutputShape(
        depth=0 if deepest is None else deepest.depth,
        deepest_path=deepest_path,
        max_items=None if widest is None else widest.value,
        max_items_path=None if widest is None else widest.path,
        enum_size=None if enum is None else enum.value,
        enum_path=None if enum is None else enum.path,
    )


def shape_summary(shape: OutputShape) -> str:
    nested = shape.deepest_path if shape.depth > FLAT_DEPTH else None
    parts = (
        _part(nested, f"deepest nesting {shape.deepest_path} ({shape.depth} levels)"),
        _part(shape.max_items_path, f"largest maxItems {shape.max_items_path} ({shape.max_items})"),
        _part(shape.enum_path, f"largest enum {shape.enum_path} ({shape.enum_size} values)"),
    )
    return ", ".join(part for part in parts if part)


def schema_nodes(schema: Schema) -> Iterator[SchemaNode]:
    defs = _mapping(schema.get("$defs"))
    yield from _walk(schema, defs, ROOT_PATH, 0, frozenset())


def path_label(path: str) -> str:
    return path or ROOT_LABEL


def _walk(schema: Schema, defs: Schema, path: str, depth: int, seen: frozenset[str]) -> Iterator[SchemaNode]:
    name, resolved = _resolve(schema, defs)
    if depth > MAX_DEPTH:
        return
    yield SchemaNode(path_label(path), depth, resolved)
    if name is not None and name in seen:
        return
    trail = seen if name is None else seen | {name}
    for option in _options(resolved):
        yield from _walk(option, defs, path, depth, trail)
    for key, child in _mapping(resolved.get("properties")).items():
        yield from _walk(_mapping(child), defs, _joined(path, key), depth + 1, trail)
    yield from _children(resolved, "items", defs, path + ITEMS_SUFFIX, depth, trail)
    yield from _children(resolved, "additionalProperties", defs, path + MAP_SUFFIX, depth, trail)


def _children(
    schema: Schema, key: str, defs: Schema, path: str, depth: int, seen: frozenset[str]
) -> Iterator[SchemaNode]:
    child = _mapping(schema.get(key))
    if not child:
        return
    yield from _walk(child, defs, path, depth + 1, seen)


def _measures(nodes: Sequence[SchemaNode], size: Size, deepest: str | None) -> Iterator[Measure]:
    for node in nodes:
        value = size(node.schema)
        if value is None:
            continue
        nested = deepest is not None and deepest.startswith(node.path)
        yield Measure(path=node.path, value=value, nested=nested)


def _largest(measures: Iterator[Measure]) -> Measure | None:
    return max(measures, key=lambda item: (item.value, item.nested), default=None)


def _max_items(schema: Schema) -> int | None:
    value = schema.get("maxItems")
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _enum_size(schema: Schema) -> int | None:
    values = schema.get("enum")
    return len(values) if isinstance(values, list) else None


def _options(schema: Schema) -> Iterator[Schema]:
    for key in OPTION_KEYS:
        yield from _list_of_maps(schema.get(key))


def _resolve(schema: Schema, defs: Schema) -> tuple[str | None, Schema]:
    ref = schema.get("$ref")
    if not isinstance(ref, str) or not ref.startswith(REF_PREFIX):
        return None, schema
    name = ref.removeprefix(REF_PREFIX)
    target = _mapping(defs.get(name))
    siblings = {key: value for key, value in schema.items() if key != "$ref"}
    return name, {**target, **siblings}


def _joined(path: str, key: str) -> str:
    return key if not path else f"{path}.{key}"


def _part(anchor: str | None, text: str) -> str | None:
    return None if anchor is None else text


def _mapping(value: JsonValue) -> Schema:
    return value if isinstance(value, dict) else {}


def _list_of_maps(value: JsonValue) -> list[Schema]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []
