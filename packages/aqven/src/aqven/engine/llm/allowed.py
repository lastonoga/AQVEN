import difflib
import types
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Annotated, Final, Literal, NewType, TypeAliasType, Union, get_args, get_origin

from pydantic import BaseModel, BeforeValidator, JsonValue
from pydantic.fields import FieldInfo

from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.ir import CompiledAllowedSet, CompiledInference
from aqven.spec import TypeId

DEFAULT_MAX_ENUM: Final = 50
NEAREST_COUNT: Final = 3
WILDCARD: Final = "*"
UNION_ORIGINS: Final = frozenset({Union, types.UnionType})
SEQUENCE_ORIGINS: Final = frozenset({list, tuple, set, frozenset})
CLASS_GETITEM: Final = "__class_getitem__"
GETITEM: Final = "__getitem__"
ANNOTATIONS: Final = "__annotations__"
MODULE: Final = "__module__"
MODEL_CONFIG: Final = "model_config"

type JsonPath = tuple[str, ...]
type RefReader = Callable[[str], JsonValue]


@dataclass(frozen=True, slots=True)
class AllowedSet:
    type_id: TypeId
    values: tuple[str, ...]
    labels: tuple[str | None, ...]

    @property
    def members(self) -> frozenset[str]:
        return frozenset(self.values)

    def nearest(self, value: str) -> tuple[str, ...]:
        return tuple(difflib.get_close_matches(value, self.values, n=NEAREST_COUNT, cutoff=0.0))


@dataclass(frozen=True, slots=True)
class TypeLocation:
    type_id: TypeId
    path: JsonPath


@dataclass(frozen=True, slots=True)
class CaseFolding:
    canonical: Mapping[str, str]

    def __call__(self, value: object) -> object:
        if not isinstance(value, str):
            return value
        return self.canonical.get(value.casefold(), value)


@dataclass(frozen=True, slots=True)
class ShapedOutput:
    model: type[BaseModel]
    locations: tuple[TypeLocation, ...]
    sets: Mapping[TypeId, AllowedSet]

    def violations(self, output: JsonValue) -> tuple[str, ...]:
        return tuple(
            _violation(location, value, self.sets[location.type_id])
            for location in self.locations
            for value in values_at(output, location.path)
            if isinstance(value, str) and value not in self.sets[location.type_id].members
        )


def resolve_allowed_sets(inference: CompiledInference, read: RefReader) -> tuple[AllowedSet, ...]:
    return tuple(_allowed_set(item, read) for item in inference.allowed_sets)


def shape_output(model: type[BaseModel], sets: Sequence[AllowedSet], max_enum: int = DEFAULT_MAX_ENUM) -> ShapedOutput:
    by_type = {item.type_id: item for item in sets}
    replacements = {type_id: _choice(item) for type_id, item in by_type.items() if 0 < len(item.values) <= max_enum}
    shaper = _Shaper(frozenset(by_type), replacements)
    shaped = shaper.model(model)
    return ShapedOutput(_base_model(shaped.annotation) or model, shaped.locations, by_type)


def values_at(document: JsonValue, path: JsonPath) -> Iterator[JsonValue]:
    if not path:
        yield document
        return
    head, rest = path[0], path[1:]
    if head == WILDCARD and isinstance(document, list):
        for item in document:
            yield from values_at(item, rest)
        return
    if isinstance(document, dict) and head in document:
        yield from values_at(document[head], rest)


def flatten(value: JsonValue) -> Iterator[JsonValue]:
    if not isinstance(value, list):
        yield value
        return
    for item in value:
        yield from flatten(item)


def _allowed_set(item: CompiledAllowedSet, read: RefReader) -> AllowedSet:
    values = [value for value in flatten(read(item.source)) if value is not None]
    strings = [value for value in values if isinstance(value, str)]
    if len(strings) != len(values):
        message = f"allowed-set {item.type_id} from {item.source}: values must be identifier strings"
        raise LlmNodeError(LlmFailureCode.ALLOWED_SET_INVALID, message)
    labels = _labels(item, read, len(strings))
    first_labels = dict(reversed(list(zip(strings, labels, strict=True))))
    ordered = tuple(dict.fromkeys(strings))
    return AllowedSet(item.type_id, ordered, tuple(first_labels[value] for value in ordered))


def _labels(item: CompiledAllowedSet, read: RefReader, count: int) -> list[str | None]:
    if item.labels_from is None:
        return [None] * count
    labels = [_label(value) for value in flatten(read(item.labels_from))]
    if len(labels) != count:
        message = f"allowed-set {item.type_id}: {len(labels)} labels from {item.labels_from} for {count} values"
        raise LlmNodeError(LlmFailureCode.ALLOWED_SET_INVALID, message)
    return labels


def _label(value: JsonValue) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else str(value)


def _choice(item: AllowedSet) -> object:
    folding = CaseFolding({value.casefold(): value for value in reversed(item.values)})
    return subscript(Annotated, (subscript(Literal, item.values), BeforeValidator(folding)))


def subscript(form: object, arguments: tuple[object, ...]) -> object:
    getter = getattr(form, CLASS_GETITEM, None) or getattr(form, GETITEM, None)
    if not callable(getter):
        raise TypeError(f"{form!r} cannot be parameterized")
    return getter(arguments)


def _violation(location: TypeLocation, value: str, allowed: AllowedSet) -> str:
    where = ".".join(location.path)
    nearest = ", ".join(allowed.nearest(value))
    return f"{where}: {value!r} is not an allowed {location.type_id}; closest: {nearest}"


@dataclass(frozen=True, slots=True)
class _Shaped:
    annotation: object
    locations: tuple[TypeLocation, ...] = ()
    changed: bool = False


type _Rule = Callable[["_Shaper", object], _Shaped]


def _prefixed(locations: Sequence[TypeLocation], prefix: JsonPath) -> tuple[TypeLocation, ...]:
    return tuple(TypeLocation(item.type_id, (*prefix, *item.path)) for item in locations)


def _is_new_type(annotation: object) -> bool:
    return isinstance(annotation, NewType)


def _is_alias(annotation: object) -> bool:
    return isinstance(annotation, TypeAliasType)


def _is_annotated(annotation: object) -> bool:
    return get_origin(annotation) is Annotated


def _is_union(annotation: object) -> bool:
    return get_origin(annotation) in UNION_ORIGINS


def _is_sequence(annotation: object) -> bool:
    return get_origin(annotation) in SEQUENCE_ORIGINS


def _is_model(annotation: object) -> bool:
    return _base_model(annotation) is not None


def _base_model(annotation: object) -> type[BaseModel] | None:
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation
    return None


@dataclass(slots=True)
class _Shaper:
    tracked: frozenset[TypeId]
    replacements: Mapping[TypeId, object]
    memo: dict[type, _Shaped] = field(default_factory=dict[type, _Shaped])

    def shape(self, annotation: object) -> _Shaped:
        rule = next((handle for matches, handle in SHAPE_RULES if matches(annotation)), None)
        return rule(self, annotation) if rule is not None else _Shaped(annotation)

    def new_type(self, annotation: object) -> _Shaped:
        type_id = TypeId(str(getattr(annotation, "__name__", "")))
        if type_id not in self.tracked:
            return _Shaped(annotation)
        replacement = self.replacements.get(type_id)
        location = (TypeLocation(type_id, ()),)
        return _Shaped(replacement if replacement is not None else annotation, location, replacement is not None)

    def alias(self, annotation: object) -> _Shaped:
        inner = self.shape(getattr(annotation, "__value__", None))
        return _Shaped(inner.annotation if inner.changed else annotation, inner.locations, inner.changed)

    def annotated(self, annotation: object) -> _Shaped:
        base, *metadata = get_args(annotation)
        inner = self.shape(base)
        if not inner.changed:
            return _Shaped(annotation, inner.locations)
        if _is_new_type(base):
            return inner
        return _Shaped(subscript(Annotated, (inner.annotation, *metadata)), inner.locations, True)

    def union(self, annotation: object) -> _Shaped:
        members = [self.shape(member) for member in get_args(annotation)]
        locations = tuple(dict.fromkeys(location for member in members for location in member.locations))
        if not any(member.changed for member in members):
            return _Shaped(annotation, locations)
        return _Shaped(subscript(Union, tuple(member.annotation for member in members)), locations, True)

    def sequence(self, annotation: object) -> _Shaped:
        origin = get_origin(annotation)
        arguments = get_args(annotation)
        items = [self.shape(argument) for argument in arguments]
        locations = tuple(
            dict.fromkeys(location for item in items for location in _prefixed(item.locations, (WILDCARD,)))
        )
        if not isinstance(origin, type) or not any(item.changed for item in items):
            return _Shaped(annotation, locations)
        return _Shaped(types.GenericAlias(origin, tuple(item.annotation for item in items)), locations, True)

    def model(self, annotation: object) -> _Shaped:
        model = _base_model(annotation)
        if model is None:
            return _Shaped(annotation)
        cached = self.memo.get(model)
        if cached is not None:
            return cached
        self.memo[model] = _Shaped(model)
        shaped = self._model(model)
        self.memo[model] = shaped
        return shaped

    def _model(self, model: type[BaseModel]) -> _Shaped:
        fields = {name: (info, self.shape(info.annotation)) for name, info in model.model_fields.items()}
        locations = tuple(
            location
            for name, (info, shaped) in fields.items()
            for location in _prefixed(shaped.locations, (_json_name(name, info),))
        )
        if not any(shaped.changed for _, shaped in fields.values()):
            return _Shaped(model, locations)
        namespace: dict[str, object] = {
            ANNOTATIONS: {name: shaped.annotation for name, (_, shaped) in fields.items()},
            MODEL_CONFIG: model.model_config,
            MODULE: model.__module__,
            **{name: info for name, (info, _) in fields.items()},
        }
        rebuilt = type(model.__name__, model.__bases__, namespace)
        return _Shaped(rebuilt, locations, True)


def _json_name(name: str, info: FieldInfo) -> str:
    return info.serialization_alias or info.alias or name


SHAPE_RULES: Final[tuple[tuple[Callable[[object], bool], _Rule], ...]] = (
    (_is_new_type, _Shaper.new_type),
    (_is_alias, _Shaper.alias),
    (_is_annotated, _Shaper.annotated),
    (_is_union, _Shaper.union),
    (_is_sequence, _Shaper.sequence),
    (_is_model, _Shaper.model),
)
