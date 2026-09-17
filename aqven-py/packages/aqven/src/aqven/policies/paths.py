from collections.abc import Mapping, Sequence

from pydantic import BaseModel, JsonValue

from aqven.spec import FieldStep, IndexStep, LiftStep, RefRoot, RefStep, parse_ref


def json_of(model: BaseModel) -> JsonValue:
    return model.model_dump(mode="json", by_alias=True)


def read(roots: Mapping[RefRoot, JsonValue], path: str) -> JsonValue:
    ref = parse_ref(path)
    return pick(roots.get(ref.root), ref.steps)


def pick(document: JsonValue, steps: Sequence[RefStep]) -> JsonValue:
    if not steps:
        return document
    step, rest = steps[0], steps[1:]
    match step:
        case FieldStep(name=name) if isinstance(document, dict):
            return pick(document.get(name), rest)
        case IndexStep(index=index) if isinstance(document, list) and index < len(document):
            return pick(document[index], rest)
        case LiftStep() if isinstance(document, list):
            return [pick(item, rest) for item in document]
        case _:
            return None


def number(value: JsonValue) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def text(value: JsonValue) -> str:
    return value if isinstance(value, str) else ""


def items(value: JsonValue) -> list[JsonValue]:
    return value if isinstance(value, list) else []


def member(value: JsonValue, name: str) -> JsonValue:
    return value.get(name) if isinstance(value, dict) else None
