import json
from collections.abc import Mapping
from typing import Final

from pydantic import JsonValue, ValidationError

from aqven.ir import CompiledInference
from aqven.runtime.address import JsonObject
from aqven.spec import DYNAMIC, DynamicValue, parse_type_ref

FIELD_LINE: Final = "- {name} ({description}): {value}"
LINE_SEPARATOR: Final = "\n"


class ReadableMapping(dict[str, object]):
    __slots__ = ("text",)

    def __init__(self, items: Mapping[str, object], text: str) -> None:
        super().__init__(items)
        self.text = text

    def __str__(self) -> str:
        return self.text


def template_values(inference: CompiledInference, document: JsonObject) -> dict[str, object]:
    dynamic = frozenset(field.name for field in inference.input_fields if parse_type_ref(field.type).type_id == DYNAMIC)
    return {name: _readable_input(value, name in dynamic) for name, value in document.items()}


def readable_value(value: JsonValue) -> object:
    if isinstance(value, dict):
        return ReadableMapping({key: readable_value(item) for key, item in value.items()}, value_text(value))
    if isinstance(value, list):
        return [readable_value(item) for item in value]
    return value


def readable_dynamic(value: JsonValue) -> object:
    try:
        dynamic = DynamicValue.model_validate(value)
    except ValidationError:
        return readable_value(value)
    items = value if isinstance(value, dict) else {}
    return ReadableMapping({key: readable_value(item) for key, item in items.items()}, dynamic_text(dynamic))


def dynamic_text(dynamic: DynamicValue) -> str:
    values = dynamic.value
    if not isinstance(values, dict):
        return value_text(values)
    lines = (
        FIELD_LINE.format(name=field.name, description=field.description, value=value_text(values.get(field.name)))
        for field in dynamic.fields
    )
    return LINE_SEPARATOR.join(lines)


def value_text(value: JsonValue) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _readable_input(value: JsonValue, dynamic: bool) -> object:
    if dynamic:
        return readable_dynamic(value)
    return readable_value(value)
