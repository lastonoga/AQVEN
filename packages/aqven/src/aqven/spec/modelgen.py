import contextlib
import types
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Final, Literal, Protocol, Union, assert_never

from pydantic import BaseModel, ConfigDict, Field, JsonValue, TypeAdapter, create_model
from pydantic.fields import FieldInfo

from aqven.spec.builtins import (
    AUDIO,
    BOOL,
    DATE,
    DATE_TIME,
    DOCUMENT,
    DYNAMIC,
    FIELD_SPEC,
    FIELD_SPEC_FORBIDDEN_TYPES,
    FLOAT,
    IMAGE,
    INT,
    LOCALE,
    MAP_ITEM_ERROR,
    RECORD_LABEL,
    TENANT_ID,
    TEXT,
    TIME_ZONE,
    VIDEO,
    Audio,
    Document,
    DynamicValue,
    FieldSpec,
    Image,
    MapItemError,
    Video,
)
from aqven.spec.fields import FieldDecl
from aqven.spec.names import Locale, TenantId, TimeZone, TypeId
from aqven.spec.typeref import TypeRef, TypeRefSyntaxError, parse_type_ref
from aqven.spec.types import EnumType, IdType, RecordType, TypeSpec, UnionType, UnionVariant, ValueType

LITERAL_FORM: Final[Any] = Literal
ANNOTATED_FORM: Final[Any] = Annotated
UNION_FORM: Final[Any] = Union

GENERATED_CONFIG: Final = ConfigDict(
    extra="forbid",
    frozen=True,
    revalidate_instances="always",
    serialize_by_alias=True,
)

BUILTIN_ANNOTATIONS: Final[Mapping[TypeId, object]] = {
    TEXT: str,
    INT: int,
    FLOAT: float,
    BOOL: bool,
    DATE: date,
    DATE_TIME: datetime,
    TIME_ZONE: TimeZone,
    LOCALE: Locale,
    TENANT_ID: TenantId,
    IMAGE: Image,
    AUDIO: Audio,
    VIDEO: Video,
    DOCUMENT: Document,
    DYNAMIC: DynamicValue,
    FIELD_SPEC: FieldSpec,
    MAP_ITEM_ERROR: MapItemError,
}

RESERVED_ATTRIBUTE_NAMES: Final = frozenset(dir(BaseModel))
REMOVED_SCHEMA_KEYS: Final = frozenset({"title", "description", "examples", "default", "discriminator", "$defs"})
NAMED_SCHEMA_MAPS: Final = frozenset({"properties", "patternProperties", "dependentSchemas"})
DEFINITIONS_PREFIX: Final = "#/$defs/"

JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])

type Resolver = Callable[[TypeId], object]
type FieldDefinition = tuple[object, FieldInfo]


class TypeModelError(Exception):
    pass


class ItemConstraints(Protocol):
    @property
    def max_length(self) -> int | None: ...

    @property
    def pattern(self) -> str | None: ...

    @property
    def enum(self) -> list[str] | None: ...

    @property
    def minimum(self) -> int | float | None: ...

    @property
    def maximum(self) -> int | float | None: ...


class FieldSpecTypeIssue(StrEnum):
    UNKNOWN = "unknown"
    FORBIDDEN = "forbidden"


@dataclass(frozen=True, slots=True)
class FieldSpecTypeProblem:
    issue: FieldSpecTypeIssue
    message: str


def _text_item(base: object, constraints: ItemConstraints) -> object:
    if constraints.enum is not None:
        return LITERAL_FORM[tuple(constraints.enum)]
    if constraints.max_length is None and constraints.pattern is None:
        return base
    return ANNOTATED_FORM[base, Field(max_length=constraints.max_length, pattern=constraints.pattern)]


def _number_item(base: object, constraints: ItemConstraints) -> object:
    if constraints.minimum is None and constraints.maximum is None:
        return base
    return ANNOTATED_FORM[base, Field(ge=constraints.minimum, le=constraints.maximum)]


ITEM_CONSTRAINERS: Final[Mapping[TypeId, Callable[[object, ItemConstraints], object]]] = {
    TEXT: _text_item,
    INT: _number_item,
    FLOAT: _number_item,
}


@dataclass(frozen=True, slots=True)
class TypeModels:
    annotations: Mapping[TypeId, object]
    failures: Mapping[TypeId, str]
    specs: Mapping[TypeId, TypeSpec]

    def __contains__(self, type_id: object) -> bool:
        return type_id in BUILTIN_ANNOTATIONS or type_id in self.annotations

    def resolve(self, type_id: TypeId) -> object:
        builtin = BUILTIN_ANNOTATIONS.get(type_id)
        if builtin is not None:
            return builtin
        annotation = self.annotations.get(type_id)
        if annotation is not None:
            return annotation
        raise TypeModelError(self.failures.get(type_id, f"type {type_id} is not declared"))

    def model(self, type_id: TypeId) -> type[BaseModel]:
        annotation = self.resolve(type_id)
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            return annotation
        raise TypeModelError(f"type {type_id} is not a record: it has no Pydantic model")

    def annotation(self, ref: TypeRef) -> object:
        return shaped_annotation(self.resolve(ref.type_id), ref, None)

    def field_annotation(self, decl: FieldDecl) -> object:
        return field_annotation(decl, self.resolve)

    def record(self, name: str, fields: Sequence[FieldDecl]) -> type[BaseModel]:
        return record_model(name, fields, self.resolve)

    def dynamic_record(self, name: str, fields: Sequence[FieldSpec]) -> type[BaseModel]:
        return _create_model(name, dict(self._dynamic_definition(name, spec) for spec in fields))

    def _dynamic_definition(self, owner: str, spec: FieldSpec) -> tuple[str, FieldDefinition]:
        ref = _parse_type_ref(spec.type)
        item = self._dynamic_item(owner, spec, ref.type_id)
        return _definition(spec.name, shaped_annotation(item, ref, spec.max_items), spec.description)

    def _dynamic_item(self, owner: str, spec: FieldSpec, type_id: TypeId) -> object:
        if type_id == RECORD_LABEL:
            return self.dynamic_record(f"{owner}{_pascal(spec.name)}", spec.fields or ())
        problem = field_spec_type_problem(type_id, self.specs)
        if problem is not None:
            raise TypeModelError(f"field {spec.name}: {problem.message}")
        return item_annotation(type_id, self.resolve(type_id), spec)


@dataclass(slots=True)
class _RegistryBuilder:
    types: Mapping[TypeId, TypeSpec]
    built: dict[TypeId, object] = field(default_factory=dict[TypeId, object])
    failures: dict[TypeId, str] = field(default_factory=dict[TypeId, str])
    pending: set[TypeId] = field(default_factory=set[TypeId])

    def resolve(self, type_id: TypeId) -> object:
        builtin = BUILTIN_ANNOTATIONS.get(type_id)
        if builtin is not None:
            return builtin
        if type_id in self.built:
            return self.built[type_id]
        if type_id in self.failures:
            raise TypeModelError(self.failures[type_id])
        spec = self.types.get(type_id)
        if spec is None:
            raise TypeModelError(f"type {type_id} is not declared")
        if type_id in self.pending:
            raise TypeModelError(f"type {type_id} references itself")
        return self._build_tracked(type_id, spec)

    def _build_tracked(self, type_id: TypeId, spec: TypeSpec) -> object:
        self.pending.add(type_id)
        try:
            annotation = self._build(type_id, spec)
        except TypeModelError as error:
            self.failures[type_id] = f"type {type_id}: {error}"
            raise
        finally:
            self.pending.discard(type_id)
        self.built[type_id] = annotation
        return annotation

    def _build(self, type_id: TypeId, spec: TypeSpec) -> object:
        match spec:
            case RecordType():
                return record_model(type_id, spec.fields, self.resolve)
            case EnumType():
                return LITERAL_FORM[tuple(value.value for value in spec.values)]
            case UnionType():
                return self._union(type_id, spec)
            case IdType():
                return _id_annotation(spec)
            case ValueType():
                return item_annotation(TypeId(spec.base), BUILTIN_ANNOTATIONS[TypeId(spec.base)], spec)
            case _:
                assert_never(spec)

    def _union(self, type_id: TypeId, spec: UnionType) -> object:
        variants = [self._variant(type_id, spec.discriminator, variant) for variant in spec.variants]
        if len(variants) == 1:
            return variants[0]
        union: object = UNION_FORM[tuple(variants)]
        return ANNOTATED_FORM[union, Field(discriminator=spec.discriminator)]

    def _variant(self, type_id: TypeId, discriminator: str, variant: UnionVariant) -> type[BaseModel]:
        tag: dict[str, FieldDefinition] = {
            discriminator: (LITERAL_FORM[variant.name], Field(description=variant.description)),
        }
        body = dict(_field_definition(decl, self.resolve) for decl in variant.fields)
        return _create_model(f"{type_id}{_pascal(variant.name)}", {**tag, **body})


def build_type_models(types: Mapping[TypeId, TypeSpec]) -> TypeModels:
    builder = _RegistryBuilder(types)
    for type_id in types:
        with contextlib.suppress(TypeModelError):
            builder.resolve(type_id)
    return TypeModels(annotations=dict(builder.built), failures=dict(builder.failures), specs=dict(types))


def field_spec_type_problem(type_id: TypeId, types: Mapping[TypeId, TypeSpec]) -> FieldSpecTypeProblem | None:
    if type_id == RECORD_LABEL:
        return None
    if type_id not in BUILTIN_ANNOTATIONS and type_id not in types:
        return FieldSpecTypeProblem(
            FieldSpecTypeIssue.UNKNOWN, f"type {type_id} is neither built in nor declared in the project"
        )
    blocked = sorted(inner for inner in _reachable_types(type_id, types) if _field_spec_blocked(inner, types))
    if not blocked:
        return None
    contained = [inner for inner in blocked if inner != type_id]
    through = f" (contains {', '.join(contained)})" if contained else ""
    message = (
        f"type {type_id}{through} is not allowed in FieldSpec: media types, Dynamic, FieldSpec and unions are forbidden"
    )
    return FieldSpecTypeProblem(FieldSpecTypeIssue.FORBIDDEN, message)


def item_annotation(type_id: TypeId, base: object, constraints: ItemConstraints) -> object:
    constrainer = ITEM_CONSTRAINERS.get(type_id)
    if constrainer is None:
        return base
    return constrainer(base, constraints)


def shaped_annotation(item: object, ref: TypeRef, max_items: int | None) -> object:
    listed = _list_annotation(item, max_items) if ref.is_list else item
    if not ref.is_optional:
        return listed
    optional: object = UNION_FORM[listed, None]
    return optional


def overridden_model(base: type[BaseModel], overrides: Mapping[str, FieldDefinition]) -> type[BaseModel]:
    arguments: dict[str, Any] = dict(overrides)
    return create_model(base.__name__, __base__=base, **arguments)


def dynamic_record(name: str, fields: Sequence[FieldSpec], resolve: Resolver) -> type[BaseModel]:
    return _create_model(name, dict(_dynamic_field(name, spec, resolve) for spec in fields))


def _dynamic_field(owner: str, spec: FieldSpec, resolve: Resolver) -> tuple[str, FieldDefinition]:
    ref = _parse_type_ref(spec.type)
    nested = f"{owner}{_pascal(spec.name)}"
    item = (
        dynamic_record(nested, spec.fields or (), resolve)
        if ref.type_id == RECORD_LABEL
        else item_annotation(ref.type_id, resolve(ref.type_id), spec)
    )
    return _definition(spec.name, shaped_annotation(item, ref, spec.max_items), spec.description)


def field_annotation(decl: FieldDecl, resolve: Resolver) -> object:
    ref = _parse_type_ref(decl.type)
    item = item_annotation(ref.type_id, resolve(ref.type_id), decl)
    return shaped_annotation(item, ref, decl.max_items)


def record_model(name: str, fields: Sequence[FieldDecl], resolve: Resolver) -> type[BaseModel]:
    return _create_model(name, dict(_field_definition(decl, resolve) for decl in fields))


def annotated_record(name: str, fields: Mapping[str, object]) -> type[BaseModel]:
    return _create_model(name, dict(_definition(key, annotation, None) for key, annotation in fields.items()))


def normalized_schema(annotation: object) -> JsonValue:
    document = JSON_OBJECT.validate_python(TypeAdapter[object](annotation).json_schema())
    definitions = document.get("$defs")
    named = definitions if isinstance(definitions, dict) else {}
    return _normalize_object(document, named, frozenset())


def _list_annotation(item: object, max_items: int | None) -> object:
    listed = types.GenericAlias(list, (item,))
    if max_items is None:
        return listed
    return ANNOTATED_FORM[listed, Field(max_length=max_items)]


def _parse_type_ref(text: str) -> TypeRef:
    try:
        return parse_type_ref(text)
    except TypeRefSyntaxError as error:
        raise TypeModelError(str(error)) from error


def _reachable_types(type_id: TypeId, types: Mapping[TypeId, TypeSpec]) -> frozenset[TypeId]:
    seen: set[TypeId] = set()
    frontier = [type_id]
    while frontier:
        current = frontier.pop()
        if current in seen:
            continue
        seen.add(current)
        frontier.extend(_field_type_ids(types.get(current)))
    return frozenset(seen)


def _field_type_ids(spec: TypeSpec | None) -> list[TypeId]:
    record = spec.fields if isinstance(spec, RecordType) else ()
    variants = spec.variants if isinstance(spec, UnionType) else ()
    decls = [*record, *(decl for variant in variants for decl in variant.fields)]
    return [type_id for decl in decls if (type_id := _declared_type_id(decl)) is not None]


def _declared_type_id(decl: FieldDecl) -> TypeId | None:
    try:
        return parse_type_ref(decl.type).type_id
    except TypeRefSyntaxError:
        return None


def _field_spec_blocked(type_id: TypeId, types: Mapping[TypeId, TypeSpec]) -> bool:
    return type_id in FIELD_SPEC_FORBIDDEN_TYPES or isinstance(types.get(type_id), UnionType)


def _id_annotation(spec: IdType) -> object:
    if spec.max_length is None and spec.pattern is None:
        return str
    return ANNOTATED_FORM[str, Field(max_length=spec.max_length, pattern=spec.pattern)]


def _field_definition(decl: FieldDecl, resolve: Resolver) -> tuple[str, FieldDefinition]:
    return _definition(decl.name, field_annotation(decl, resolve), decl.description)


def _definition(name: str, annotation: object, description: str | None) -> tuple[str, FieldDefinition]:
    if name not in RESERVED_ATTRIBUTE_NAMES:
        return name, (annotation, Field(description=description))
    return f"{name}_", (annotation, Field(description=description, alias=name))


def _create_model(name: str, definitions: Mapping[str, FieldDefinition]) -> type[BaseModel]:
    arguments: dict[str, Any] = dict(definitions)
    return create_model(name, __config__=GENERATED_CONFIG, **arguments)


def _pascal(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))


def _normalize_object(
    node: dict[str, JsonValue], definitions: dict[str, JsonValue], expanding: frozenset[str]
) -> JsonValue:
    reference = node.get("$ref")
    if isinstance(reference, str):
        return _expand_reference(reference, node, definitions, expanding)
    return {
        key: _normalize_member(key, value, definitions, expanding)
        for key, value in node.items()
        if key not in REMOVED_SCHEMA_KEYS
    }


def _expand_reference(
    reference: str,
    node: dict[str, JsonValue],
    definitions: dict[str, JsonValue],
    expanding: frozenset[str],
) -> JsonValue:
    name = reference.removeprefix(DEFINITIONS_PREFIX)
    target = definitions.get(name)
    if name in expanding or not isinstance(target, dict):
        return {"$ref": name}
    siblings = {key: value for key, value in node.items() if key != "$ref"}
    return _normalize_object({**target, **siblings}, definitions, expanding | {name})


def _normalize_member(
    key: str, value: JsonValue, definitions: dict[str, JsonValue], expanding: frozenset[str]
) -> JsonValue:
    if key in NAMED_SCHEMA_MAPS and isinstance(value, dict):
        return {name: _normalize_value(child, definitions, expanding) for name, child in value.items()}
    return _normalize_value(value, definitions, expanding)


def _normalize_value(value: JsonValue, definitions: dict[str, JsonValue], expanding: frozenset[str]) -> JsonValue:
    match value:
        case dict():
            return _normalize_object(value, definitions, expanding)
        case list():
            return [_normalize_value(item, definitions, expanding) for item in value]
        case _:
            return value
