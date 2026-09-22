import inspect
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from types import NoneType, UnionType
from typing import Annotated, Any, Final, Literal, NewType, TypeAliasType, get_args, get_origin, get_type_hints

from pydantic import BaseModel, ConfigDict, Field, JsonValue, TypeAdapter, ValidationError
from pydantic.fields import FieldInfo

from aqven.spec.builtins import (
    AUDIO,
    BOOL,
    DATE,
    DATE_TIME,
    DOCUMENT,
    DYNAMIC,
    FIELD_SPEC,
    FLOAT,
    IMAGE,
    INT,
    MAP_ITEM_ERROR,
    TEXT,
    VIDEO,
    Audio,
    Document,
    DynamicValue,
    FieldSpec,
    Image,
    MapItemError,
    Video,
)
from aqven.spec.common import Limits, SpecModel
from aqven.spec.flow import FlowSpec
from aqven.spec.inference import AllowedSetSpec, CheckSpec, ExampleSpec, InferenceSpec, VariantSlot
from aqven.spec.names import API_VERSION, NodeId, RunContextKey, TypeId
from aqven.spec.nodes import NODE_SPEC_CLASSES, CodeNodeSpec, LlmNodeSpec, NodeBase, NodeSpec, ToolNodeSpec
from aqven.spec.typeref import TypeRef

PORT_MARKER: Final = "aqven_port"
DIRECTION_IN: Final = "in"
DIRECTION_OUT: Final = "out"
CONSTRAINT_KEYS: Final = ("maxLength", "maxItems", "minimum", "maximum", "pattern", "enum")

SCALAR_TYPE_IDS: Final[Mapping[type, TypeId]] = {
    str: TEXT,
    int: INT,
    float: FLOAT,
    bool: BOOL,
    date: DATE,
    datetime: DATE_TIME,
}

SCALAR_CONSTRAINT_KEYS: Final[Mapping[TypeId, tuple[str, ...]]] = {
    TEXT: ("maxLength", "pattern"),
    INT: ("minimum", "maximum"),
    FLOAT: ("minimum", "maximum"),
}

MODEL_TYPE_IDS: Final[Mapping[type[BaseModel], TypeId]] = {
    Image: IMAGE,
    Audio: AUDIO,
    Video: VIDEO,
    Document: DOCUMENT,
    FieldSpec: FIELD_SPEC,
    DynamicValue: DYNAMIC,
    MapItemError: MAP_ITEM_ERROR,
}

JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])


class BuilderError(Exception):
    pass


class Inference(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class BuiltNode[S: NodeBase]:
    __slots__ = ("_node_id", "_spec")

    def __init__(self, node_id: NodeId, spec: S) -> None:
        self._node_id = node_id
        self._spec = spec

    def __repr__(self) -> str:
        return f"BuiltNode(node_id={self._node_id!r}, spec={self._spec!r})"

    @property
    def node_id(self) -> NodeId:
        return self._node_id

    @property
    def spec(self) -> S:
        return self._spec


type LlmNode = BuiltNode[LlmNodeSpec]
type CodeNode = BuiltNode[CodeNodeSpec]
type ToolNode = BuiltNode[ToolNodeSpec]


@dataclass(frozen=True, slots=True)
class Flow:
    spec: FlowSpec
    nodes: Mapping[NodeId, NodeSpec]


@dataclass(frozen=True, slots=True)
class _Port:
    name: str
    direction: JsonValue
    description: str | None
    annotation: object
    marker: Mapping[str, JsonValue]


@dataclass(frozen=True, slots=True)
class _ItemShape:
    type_id: TypeId
    constraints: Mapping[str, JsonValue]


@dataclass(frozen=True, slots=True)
class _ItemRule:
    matches: Callable[[object], bool]
    translate: Callable[[object, object], _ItemShape]


def In(
    *,
    description: str,
    max_length: int | None = None,
    max_items: int | None = None,
    minimum: float | None = None,
    maximum: float | None = None,
    pattern: str | None = None,
) -> Any:
    return _port_field(DIRECTION_IN, description, (max_length, max_items, minimum, maximum, pattern))


def Out(
    *,
    description: str,
    max_length: int | None = None,
    max_items: int | None = None,
    minimum: float | None = None,
    maximum: float | None = None,
    pattern: str | None = None,
) -> Any:
    return _port_field(DIRECTION_OUT, description, (max_length, max_items, minimum, maximum, pattern))


def inference_spec(
    model: type[Inference],
    *,
    description: str,
    prompt: str | None = None,
    variants: Mapping[str, VariantSlot] | None = None,
    allowed_sets: Sequence[AllowedSetSpec] = (),
    examples: Sequence[ExampleSpec] = (),
    checks: Sequence[CheckSpec] = (),
) -> InferenceSpec:
    ports = _inference_ports(model)
    slots: dict[str, JsonValue] = {name: _dump(slot) for name, slot in (variants or {}).items()}
    data: dict[str, JsonValue] = {
        "apiVersion": API_VERSION,
        "kind": "Inference",
        "description": description,
        "in": [_field_json(port) for port in ports if port.direction == DIRECTION_IN],
        "out": [_field_json(port) for port in ports if port.direction == DIRECTION_OUT],
        **_optional_value("prompt", prompt),
        **({"variants": slots} if slots else {}),
        **_optional_list("allowed_sets", [_dump(item) for item in allowed_sets]),
        **_optional_list("examples", [_dump(item) for item in examples]),
        **_optional_list("checks", [_dump(item) for item in checks]),
    }
    return _validate(InferenceSpec, model.__name__, data)


def llm(node_id: str, *, inference: str, agent: str, bind: Mapping[str, str], description: str) -> LlmNode:
    data: dict[str, JsonValue] = {
        **_node_header("llm", description),
        "inference": inference,
        "agent": agent,
        "in": _bindings(bind),
    }
    return BuiltNode(NodeId(node_id), _validate(LlmNodeSpec, node_id, data))


def code(
    node_id: str,
    fn: Callable[..., BaseModel],
    *,
    bind: Mapping[str, str],
    description: str,
) -> CodeNode:
    data: dict[str, JsonValue] = {
        **_node_header("code", description),
        "run": _code_ref(fn),
        "in": _bound_inputs(node_id, _parameter_ports(fn), bind),
        "out": [_field_json(port) for port in _return_ports(fn)],
    }
    return BuiltNode(NodeId(node_id), _validate(CodeNodeSpec, node_id, data))


def tool(node_id: str, *, tool: str, bind: Mapping[str, str], description: str) -> ToolNode:
    data: dict[str, JsonValue] = {**_node_header("tool", description), "tool": tool, "in": _bindings(bind)}
    return BuiltNode(NodeId(node_id), _validate(ToolNodeSpec, node_id, data))


def flow(
    *,
    description: str,
    input: type[BaseModel],
    output: type[BaseModel],
    returns: Mapping[str, str],
    nodes: Sequence[BuiltNode[NodeBase]],
    context: Sequence[RunContextKey] = (),
    limits: Limits | None = None,
) -> Flow:
    order = [node.node_id for node in nodes]
    duplicates = sorted({node_id for node_id in order if order.count(node_id) > 1})
    if duplicates:
        raise BuilderError(f"duplicate node ids: {', '.join(duplicates)}")
    data: dict[str, JsonValue] = {
        "apiVersion": API_VERSION,
        "kind": "Flow",
        "description": description,
        "input": input.__name__,
        "output": output.__name__,
        "returns": _returns(output, returns),
        **_optional_list("context", [key.value for key in context]),
        **_optional_model("limits", limits),
        "order": list[JsonValue](order),
    }
    spec = _validate(FlowSpec, "flow", data)
    return Flow(spec=spec, nodes={node.node_id: _node_spec(node) for node in nodes})


def describe_annotation(annotation: object) -> tuple[TypeRef, Mapping[str, JsonValue]]:
    inner, optional = _split_optional(annotation)
    stripped = _strip_annotated(inner)
    if get_origin(stripped) is list:
        item = _item_shape(get_args(stripped)[0])
        list_constraints = _schema_constraints(inner, ("maxItems",))
        return TypeRef(item.type_id, is_list=True, is_optional=optional), {**item.constraints, **list_constraints}
    item = _item_shape(inner)
    return TypeRef(item.type_id, is_list=False, is_optional=optional), item.constraints


def _port_field(direction: str, description: str, constraints: tuple[JsonValue, ...]) -> Any:
    values = dict(zip(("maxLength", "maxItems", "minimum", "maximum", "pattern"), constraints, strict=True))
    marker: dict[str, JsonValue] = {PORT_MARKER: direction, **{k: v for k, v in values.items() if v is not None}}
    return Field(description=description, json_schema_extra=marker)


def _node_header(kind: str, description: str) -> dict[str, JsonValue]:
    return {"apiVersion": API_VERSION, "kind": "Node", "node": kind, "description": description}


def _optional_model(key: str, model: SpecModel | None) -> dict[str, JsonValue]:
    if model is None:
        return {}
    return {key: _dump(model)}


def _dump(model: SpecModel) -> JsonValue:
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


def _bindings(bind: Mapping[str, str]) -> list[JsonValue]:
    return [{"name": name, "from": source} for name, source in bind.items()]


def _optional_value(key: str, value: str | None) -> dict[str, JsonValue]:
    if value is None:
        return {}
    return {key: value}


def _optional_list(key: str, values: list[JsonValue]) -> dict[str, JsonValue]:
    if not values:
        return {}
    return {key: values}


def _validate[S: SpecModel](model: type[S], owner: str, data: dict[str, JsonValue]) -> S:
    try:
        return model.model_validate(data)
    except ValidationError as error:
        raise BuilderError(f"{owner}: spec does not pass model {model.__name__}: {error}") from error


def _node_spec(node: BuiltNode[NodeBase]) -> NodeSpec:
    spec = node.spec
    if isinstance(spec, NODE_SPEC_CLASSES):
        return spec
    raise BuilderError(f"node {node.node_id}: unknown spec kind {type(spec).__name__}")


def _code_ref(fn: Callable[..., object]) -> str:
    return f"{fn.__module__}:{fn.__qualname__}"


def _returns(output: type[BaseModel], returns: Mapping[str, str]) -> list[JsonValue]:
    names = list(output.model_fields)
    missing = [name for name in names if name not in returns]
    extra = sorted(set(returns) - set(names))
    if missing or extra:
        raise BuilderError(
            f"returns does not match the fields of {output.__name__}: missing {', '.join(missing) or '—'}, "
            f"extra {', '.join(extra) or '—'}"
        )
    return [{"name": name, "from": returns[name]} for name in names]


def _inference_ports(model: type[Inference]) -> list[_Port]:
    ports = [_model_port(name, info) for name, info in model.model_fields.items()]
    unmarked = [port.name for port in ports if port.direction not in (DIRECTION_IN, DIRECTION_OUT)]
    if unmarked:
        raise BuilderError(f"{model.__name__}: fields without In(...) or Out(...): {', '.join(unmarked)}")
    return ports


def _model_port(name: str, info: FieldInfo) -> _Port:
    marker = _marker(info)
    return _Port(name, marker.get(PORT_MARKER), info.description, info.rebuild_annotation(), marker)


def _parameter_ports(fn: Callable[..., object]) -> list[_Port]:
    hints = get_type_hints(fn, include_extras=True)
    parameters = list(inspect.signature(fn).parameters.values())
    missing = [parameter.name for parameter in parameters if parameter.name not in hints]
    if missing:
        raise BuilderError(f"{_code_ref(fn)}: parameters without annotations: {', '.join(missing)}")
    return [_parameter_port(parameter.name, hints[parameter.name]) for parameter in parameters]


def _parameter_port(name: str, annotation: object) -> _Port:
    infos = [item for item in _annotated_metadata(annotation) if isinstance(item, FieldInfo)]
    described = next((info for info in infos if info.description), None)
    if described is None:
        return _Port(name, DIRECTION_IN, None, annotation, {})
    return _Port(name, DIRECTION_IN, described.description, annotation, _marker(described))


def _return_ports(fn: Callable[..., object]) -> list[_Port]:
    returned = get_type_hints(fn, include_extras=True).get("return")
    model = _strip_annotated(returned)
    if not (isinstance(model, type) and issubclass(model, BaseModel)):
        raise BuilderError(f"{_code_ref(fn)}: the return type must be a Pydantic model with the out fields")
    return [_model_port(name, info) for name, info in model.model_fields.items()]


def _marker(info: FieldInfo) -> Mapping[str, JsonValue]:
    extra = info.json_schema_extra
    if extra is None or callable(extra):
        return {}
    return extra


def _bound_inputs(node_id: str, ports: Sequence[_Port], bind: Mapping[str, str]) -> list[JsonValue]:
    names = [port.name for port in ports]
    missing = [name for name in names if name not in bind]
    extra = sorted(set(bind) - set(names))
    if missing or extra:
        raise BuilderError(
            f"node {node_id}: bind does not match the inputs: missing {', '.join(missing) or '—'}, "
            f"extra {', '.join(extra) or '—'}"
        )
    return [{**_field_json(port), "from": bind[port.name]} for port in ports]


def _field_json(port: _Port) -> dict[str, JsonValue]:
    if not port.description:
        raise BuilderError(
            f"field {port.name}: no description; set In(description=...), Out(description=...) "
            "or Annotated[..., Field(description=...)]"
        )
    type_ref, derived = describe_annotation(port.annotation)
    declared = {key: port.marker[key] for key in CONSTRAINT_KEYS if key in port.marker}
    constraints = {**derived, **declared}
    ordered = {key: constraints[key] for key in CONSTRAINT_KEYS if key in constraints}
    return {"name": port.name, "type": str(type_ref), "description": port.description, **ordered}


def _annotated_metadata(annotation: object) -> tuple[object, ...]:
    if get_origin(annotation) is not Annotated:
        return ()
    return tuple(get_args(annotation)[1:])


def _strip_annotated(annotation: object) -> object:
    if get_origin(annotation) is not Annotated:
        return annotation
    return _strip_annotated(get_args(annotation)[0])


def _split_optional(annotation: object) -> tuple[object, bool]:
    if not isinstance(annotation, UnionType):
        return annotation, False
    members = [member for member in get_args(annotation) if member is not NoneType]
    if len(members) != 1:
        raise BuilderError(f"{annotation!r}: the only union that maps to the type notation is T | None")
    return members[0], True


def _item_shape(annotation: object) -> _ItemShape:
    stripped = _strip_annotated(annotation)
    if isinstance(stripped, UnionType) or get_origin(stripped) is list:
        raise BuilderError(f"{annotation!r}: lists of lists and lists of optional values are not allowed")
    rule = next((rule for rule in ITEM_RULES if rule.matches(stripped)), None)
    if rule is None:
        raise BuilderError(f"{annotation!r}: the type has no equivalent in the type notation")
    return rule.translate(annotation, stripped)


def _schema_constraints(annotation: object, keys: tuple[str, ...]) -> dict[str, JsonValue]:
    if not keys:
        return {}
    schema = JSON_OBJECT.validate_python(TypeAdapter[object](annotation).json_schema())
    return {key: schema[key] for key in keys if key in schema}


def _is_alias(value: object) -> bool:
    return isinstance(value, TypeAliasType)


def _alias_item(annotation: object, stripped: object) -> _ItemShape:
    if not isinstance(stripped, TypeAliasType):
        raise BuilderError(f"{annotation!r}: expected a type alias")
    target = _strip_annotated(stripped.__value__)
    name = target.__name__ if isinstance(target, NewType) else stripped.__name__
    return _ItemShape(TypeId(name), {})


def _is_new_type(value: object) -> bool:
    return isinstance(value, NewType)


def _new_type_item(annotation: object, stripped: object) -> _ItemShape:
    if not isinstance(stripped, NewType):
        raise BuilderError(f"{annotation!r}: expected a NewType")
    return _ItemShape(TypeId(stripped.__name__), {})


def _is_literal(value: object) -> bool:
    return get_origin(value) is Literal


def _literal_item(annotation: object, stripped: object) -> _ItemShape:
    values = get_args(stripped)
    texts = [value for value in values if isinstance(value, str)]
    if len(texts) != len(values):
        raise BuilderError(f"{annotation!r}: Literal maps to enum only when every value is a string")
    return _ItemShape(TEXT, {"enum": list[JsonValue](texts)})


def _is_scalar(value: object) -> bool:
    return isinstance(value, type) and value in SCALAR_TYPE_IDS


def _scalar_item(annotation: object, stripped: object) -> _ItemShape:
    if not isinstance(stripped, type):
        raise BuilderError(f"{annotation!r}: expected a scalar type")
    type_id = SCALAR_TYPE_IDS[stripped]
    return _ItemShape(type_id, _schema_constraints(annotation, SCALAR_CONSTRAINT_KEYS.get(type_id, ())))


def _is_model(value: object) -> bool:
    return isinstance(value, type) and issubclass(value, BaseModel)


def _model_item(annotation: object, stripped: object) -> _ItemShape:
    if not (isinstance(stripped, type) and issubclass(stripped, BaseModel)):
        raise BuilderError(f"{annotation!r}: expected a Pydantic model")
    return _ItemShape(MODEL_TYPE_IDS.get(stripped, TypeId(stripped.__name__)), {})


ITEM_RULES: Final[tuple[_ItemRule, ...]] = (
    _ItemRule(_is_alias, _alias_item),
    _ItemRule(_is_new_type, _new_type_item),
    _ItemRule(_is_literal, _literal_item),
    _ItemRule(_is_scalar, _scalar_item),
    _ItemRule(_is_model, _model_item),
)
