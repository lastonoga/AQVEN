import types
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Annotated, Final, Literal, Union, get_args, get_origin

from annotated_types import MaxLen
from pydantic import BaseModel, Field
from pydantic.fields import FieldInfo

from aqven.spec import MediaValue
from aqven.spec.builtins import DynamicValue
from aqven.spec.modelgen import ANNOTATED_FORM, LITERAL_FORM, UNION_FORM

LIST_PROPERTIES: Final = frozenset({"size", "first", "last"})


@dataclass(frozen=True, slots=True)
class Unwrapped:
    core: object
    optional: bool
    metadata: tuple[object, ...]


@dataclass(frozen=True, slots=True)
class Missing:
    name: str


@dataclass(frozen=True, slots=True)
class Opaque:
    pass


@dataclass(frozen=True, slots=True)
class NotList:
    pass


type Step = object | Missing | Opaque | NotList

EMPTY: Final = Unwrapped(core=None, optional=False, metadata=())


def unwrap(annotation: object) -> Unwrapped:
    return _unwrap(annotation, EMPTY)


def _unwrap(annotation: object, acc: Unwrapped) -> Unwrapped:
    handler = UNWRAPPERS.get(get_origin(annotation))
    if handler is None:
        return replace(acc, core=annotation)
    return handler(annotation, acc)


def _unwrap_annotated(annotation: object, acc: Unwrapped) -> Unwrapped:
    base, *metadata = get_args(annotation)
    return _unwrap(base, replace(acc, metadata=(*acc.metadata, *metadata)))


def _unwrap_union(annotation: object, acc: Unwrapped) -> Unwrapped:
    members = get_args(annotation)
    present = tuple(member for member in members if member is not types.NoneType)
    if len(present) == len(members):
        return replace(acc, core=annotation)
    if len(present) != 1:
        return replace(acc, core=UNION_FORM[present], optional=True)
    return _unwrap(present[0], replace(acc, optional=True))


UNWRAPPERS: Final[Mapping[object, Callable[[object, Unwrapped], Unwrapped]]] = {
    Annotated: _unwrap_annotated,
    Union: _unwrap_union,
}


def model_class(core: object) -> type[BaseModel] | None:
    if isinstance(core, type) and issubclass(core, BaseModel):
        return core
    return None


def is_dynamic(annotation: object) -> bool:
    return unwrap(annotation).core is DynamicValue


def is_media(annotation: object) -> bool:
    core = unwrap(annotation).core
    return isinstance(core, type) and issubclass(core, MediaValue)


def is_list(annotation: object) -> bool:
    return get_origin(unwrap(annotation).core) is list


def is_optional(annotation: object) -> bool:
    return unwrap(annotation).optional


def enum_values(annotation: object) -> tuple[str, ...] | None:
    core = unwrap(annotation).core
    if get_origin(core) is not Literal:
        return None
    return tuple(str(value) for value in get_args(core))


def max_items(annotation: object) -> int | None:
    unwrapped = unwrap(annotation)
    if get_origin(unwrapped.core) is not list:
        return None
    return _max_length(unwrapped.metadata)


def _max_length(metadata: Sequence[object]) -> int | None:
    limits = [limit for item in metadata for limit in _limits(item)]
    return min(limits) if limits else None


def _limits(item: object) -> tuple[int, ...]:
    if isinstance(item, MaxLen):
        return (item.max_length,)
    if isinstance(item, FieldInfo):
        return tuple(limit for inner in item.metadata for limit in _limits(inner))
    return ()


def union_variants(annotation: object) -> Mapping[str, type[BaseModel]] | None:
    unwrapped = unwrap(annotation)
    discriminator = next(
        (item.discriminator for item in unwrapped.metadata if isinstance(item, FieldInfo) and item.discriminator),
        None,
    )
    if not isinstance(discriminator, str) or get_origin(unwrapped.core) is not Union:
        return None
    models = [model_class(member) for member in get_args(unwrapped.core)]
    return {name: model for model in models if model is not None for name in _variant_names(model, discriminator)}


def _variant_names(model: type[BaseModel], discriminator: str) -> tuple[str, ...]:
    info = model.model_fields.get(discriminator)
    if info is None or get_origin(info.annotation) is not Literal:
        return ()
    return tuple(str(value) for value in get_args(info.annotation))


def record_fields(annotation: object) -> Mapping[str, object] | None:
    core = unwrap(annotation).core
    model = model_class(core)
    if model is not None:
        return _model_fields(model)
    variants = union_variants(annotation)
    if variants is None:
        return None
    merged: dict[str, object] = {}
    for model in variants.values():
        for name, field in _model_fields(model).items():
            merged.setdefault(name, field)
    return merged


def _model_fields(model: type[BaseModel]) -> dict[str, object]:
    return {info.alias or name: _field_annotation(info) for name, info in model.model_fields.items()}


def _field_annotation(info: FieldInfo) -> object:
    rebuilt = info.rebuild_annotation()
    if not isinstance(info.discriminator, str):
        return rebuilt
    discriminated: object = ANNOTATED_FORM[rebuilt, Field(discriminator=info.discriminator)]
    return discriminated


def step_field(annotation: object, name: str) -> Step:
    unwrapped = unwrap(annotation)
    if unwrapped.core is DynamicValue:
        return Opaque()
    fields = record_fields(annotation)
    if fields is None or name not in fields:
        return Missing(name)
    found = fields[name]
    return optional_of(found) if unwrapped.optional else found


def step_element(annotation: object) -> Step:
    unwrapped = unwrap(annotation)
    if unwrapped.core is DynamicValue:
        return Opaque()
    if get_origin(unwrapped.core) is not list:
        return NotList()
    element = get_args(unwrapped.core)[0]
    return optional_of(element) if unwrapped.optional else element


def narrow_case(annotation: object, key: str) -> object | None:
    variants = union_variants(annotation)
    if variants is not None and key in variants:
        return variants[key]
    values = enum_values(annotation)
    if values is not None and key in values:
        narrowed: object = LITERAL_FORM[key]
        return narrowed
    return None


def optional_of(annotation: object) -> object:
    if is_optional(annotation):
        return annotation
    optional: object = UNION_FORM[annotation, None]
    return optional


def list_of(element: object, limit: int | None) -> object:
    listed = types.GenericAlias(list, (element,))
    if limit is None:
        return listed
    constrained: object = ANNOTATED_FORM[listed, Field(max_length=limit)]
    return constrained
