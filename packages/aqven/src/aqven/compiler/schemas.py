from typing import Final

from pydantic import JsonValue, TypeAdapter

from aqven.ir import JsonSchema

TITLE_KEY: Final = "title"
NAMED_SCHEMA_MAPS: Final = frozenset({"properties", "patternProperties", "dependentSchemas", "$defs"})
JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])


def open_object() -> JsonSchema:
    return {"type": "object"}


def ir_schema(annotation: object) -> JsonSchema:
    document = JSON_OBJECT.validate_python(TypeAdapter[object](annotation).json_schema())
    return _untitled_object(document)


def _untitled_object(node: dict[str, JsonValue]) -> dict[str, JsonValue]:
    return {key: _untitled_member(key, value) for key, value in node.items() if key != TITLE_KEY}


def _untitled_member(key: str, value: JsonValue) -> JsonValue:
    if key in NAMED_SCHEMA_MAPS and isinstance(value, dict):
        return {name: _untitled_value(child) for name, child in value.items()}
    return _untitled_value(value)


def _untitled_value(value: JsonValue) -> JsonValue:
    match value:
        case dict():
            return _untitled_object(value)
        case list():
            return [_untitled_value(item) for item in value]
        case _:
            return value
