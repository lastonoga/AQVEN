import io
from collections.abc import Callable, Mapping, Sequence
from typing import Final, Protocol, TypeGuard, cast

from pydantic import BaseModel, JsonValue, ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.representer import RoundTripRepresenter
from ruamel.yaml.scalarstring import DoubleQuotedScalarString

from aqven.loader import read_strict_yaml, spec_kind
from aqven.loader.aliases import AliasScope, resolve_aliases
from aqven.loader.project import (
    AGENT_ADAPTER,
    DATASET_ADAPTER,
    EVAL_ADAPTER,
    FLOW_ADAPTER,
    INFERENCE_ADAPTER,
    MCP_SERVER_ADAPTER,
    NODE_ADAPTER,
    PROJECT_ADAPTER,
    TOOL_ADAPTER,
    TYPE_ADAPTER,
)
from aqven.spec import SpecKind

NULL_TAG: Final = "tag:yaml.org,2002:null"
NULL_TEXT: Final = "null"
HEADER_KEYS: Final = ("apiVersion", "kind")
UNLIMITED_WIDTH: Final = 2**31 - 1
INDENT: Final = 2

type JsonObject = dict[str, JsonValue]
type Validator = Callable[[JsonValue], object]

VALIDATORS: Final[Mapping[SpecKind, Validator]] = {
    SpecKind.PROJECT: PROJECT_ADAPTER.validate_python,
    SpecKind.TYPE: TYPE_ADAPTER.validate_python,
    SpecKind.FLOW: FLOW_ADAPTER.validate_python,
    SpecKind.NODE: NODE_ADAPTER.validate_python,
    SpecKind.DATASET: DATASET_ADAPTER.validate_python,
    SpecKind.EVAL: EVAL_ADAPTER.validate_python,
    SpecKind.INFERENCE: INFERENCE_ADAPTER.validate_python,
    SpecKind.AGENT: AGENT_ADAPTER.validate_python,
    SpecKind.TOOL: TOOL_ADAPTER.validate_python,
    SpecKind.MCP_SERVER: MCP_SERVER_ADAPTER.validate_python,
}


class _ScalarRepresenter(Protocol):
    def represent_scalar(self, tag: str, value: str) -> object: ...


class _RepresenterRegistry(Protocol):
    def add_representer(self, data_type: type, representer: Callable[[_ScalarRepresenter, object], object]) -> None: ...


class _Emitter(Protocol):
    def dump(self, data: object, stream: io.StringIO) -> None: ...


class _Representer(RoundTripRepresenter):
    pass


def _represent_null(representer: _ScalarRepresenter, data: object) -> object:
    return representer.represent_scalar(NULL_TAG, NULL_TEXT)


cast("_RepresenterRegistry", _Representer).add_representer(type(None), _represent_null)


def parse_document(path: str, data: bytes) -> JsonObject | None:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    document, _ = read_strict_yaml(text, path)
    if document is None or not isinstance(document.data, dict):
        return None
    return document.data


def canonical_yaml(path: str, data: JsonObject, scope: AliasScope) -> bytes:
    stream = io.StringIO()
    cast("_Emitter", _emitter()).dump(_styled(ordered_document(path, data, scope)), stream)
    return stream.getvalue().encode("utf-8")


def ordered_document(path: str, data: JsonObject, scope: AliasScope) -> JsonObject:
    model = spec_model(path, data, scope)
    if isinstance(model, BaseModel):
        return _ordered_model(data, model)
    return _header_first(data)


def spec_model(path: str, data: JsonObject, scope: AliasScope) -> object | None:
    kind = spec_kind(data)
    if kind is None:
        return None
    resolved = resolve_aliases(scope, path, kind, data)
    try:
        return VALIDATORS[kind](resolved.data)
    except ValidationError:
        return None


def _emitter() -> YAML:
    emitter = YAML(typ="rt", pure=True)
    emitter.Representer = _Representer
    emitter.default_flow_style = False
    emitter.width = UNLIMITED_WIDTH
    emitter.allow_unicode = True
    emitter.indent(mapping=INDENT, sequence=INDENT, offset=0)
    return emitter


def _header_first(data: JsonObject) -> JsonObject:
    keys = (*(key for key in HEADER_KEYS if key in data), *(key for key in data if key not in HEADER_KEYS))
    return {key: data[key] for key in keys}


def _ordered(raw: JsonValue, value: object) -> JsonValue:
    if isinstance(raw, dict) and isinstance(value, BaseModel):
        return _ordered_model(raw, value)
    if isinstance(raw, dict):
        return {key: _ordered(item, _entry(value, key)) for key, item in raw.items()}
    if isinstance(raw, list):
        return [_ordered(item, _item(value, index)) for index, item in enumerate(raw)]
    return raw


def _ordered_model(raw: JsonObject, model: BaseModel) -> JsonObject:
    names = {(info.alias or name): name for name, info in type(model).model_fields.items()}
    known = (key for key in names if key in raw)
    rest = (key for key in raw if key not in names)
    return {key: _ordered(raw[key], _field(model, names, key)) for key in (*known, *rest)}


def _field(model: BaseModel, names: Mapping[str, str], key: str) -> object:
    name = names.get(key)
    return getattr(model, name) if name is not None else None


def _entry(value: object, key: str) -> object:
    return value.get(key) if _is_object_map(value) else None


def _item(value: object, index: int) -> object:
    if not _is_object_list(value) or index >= len(value):
        return None
    return value[index]


def _is_object_map(value: object) -> TypeGuard[Mapping[str, object]]:
    return isinstance(value, dict)


def _is_object_list(value: object) -> TypeGuard[Sequence[object]]:
    return isinstance(value, list | tuple)


def _styled(value: JsonValue) -> object:
    if isinstance(value, dict):
        return {key: _styled(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_styled(item) for item in value]
    if isinstance(value, str):
        return DoubleQuotedScalarString(value)
    return value
