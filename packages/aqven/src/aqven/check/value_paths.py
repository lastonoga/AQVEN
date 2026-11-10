from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, replace
from math import prod
from typing import Literal

from aqven.loader import YamlPath
from aqven.spec import (
    BUILTIN_TYPE_IDS,
    DYNAMIC_TYPES,
    FieldDecl,
    InferenceSpec,
    RecordType,
    TypeId,
    TypeRefSyntaxError,
    TypeSpec,
    UnionType,
    parse_type_ref,
)

type Types = Mapping[TypeId, TypeSpec]
type Side = Literal["in", "out"]
type OccurrenceKey = tuple[Side, int, str, TypeId, str | None, str | None]


@dataclass(frozen=True, slots=True)
class ValuePath:
    side: Side
    index: int
    decl: FieldDecl
    path: str
    type_id: TypeId
    required: bool
    container_required: bool
    key_required: bool
    nested: bool
    list_count: int
    capacity_factors: tuple[int, ...] | None
    key_name: str | None
    list_path: str | None

    @property
    def capacity(self) -> int | None:
        return prod(self.capacity_factors) if self.capacity_factors is not None else None

    @property
    def type_anchor(self) -> YamlPath:
        return (self.side, self.index, "type")

    @property
    def capacity_anchor(self) -> YamlPath:
        ref = parse_type_ref(self.decl.type)
        factors = self.capacity_factors
        if (
            self.side == "out"
            and ref.is_list
            and self.decl.max_items is not None
            and factors
            and self.decl.max_items == min(factors)
        ):
            return ("out", self.index, "maxItems")
        return self.type_anchor


def walk_inference(types: Types, spec: InferenceSpec) -> tuple[ValuePath, ...]:
    found = (
        *_walk_fields(types, "in", spec.in_),
        *_walk_fields(types, "out", spec.out),
    )
    return tuple(
        sorted(
            found,
            key=lambda item: (item.side, item.index, item.path, item.type_id, item.key_name or ""),
        )
    )


def _walk_fields(types: Types, side: Side, fields: Sequence[FieldDecl]) -> Iterator[ValuePath]:
    for index, decl in enumerate(fields):
        occurrences = _walk_decl(
            types,
            side,
            index,
            decl,
            decl.name,
            required=True,
            container_required=True,
            nested=False,
            bounds=(),
            list_element=None,
            visiting=frozenset(),
        )
        for occurrence in occurrences:
            yield replace(occurrence, decl=decl)


def _walk_decl(
    types: Types,
    side: Side,
    index: int,
    decl: FieldDecl,
    path: str,
    *,
    required: bool,
    container_required: bool,
    nested: bool,
    bounds: tuple[int | None, ...],
    list_element: str | None,
    visiting: frozenset[TypeId],
) -> Iterator[ValuePath]:
    try:
        ref = parse_type_ref(decl.type)
    except TypeRefSyntaxError:
        return
    current_path = f"{path}[*]" if ref.is_list else path
    current_required = required and not ref.is_optional
    current_bounds = (*bounds, decl.max_items) if ref.is_list else bounds
    spec = types.get(ref.type_id)
    if spec is None:
        if ref.type_id in BUILTIN_TYPE_IDS and ref.type_id not in DYNAMIC_TYPES:
            yield _occurrence(
                side,
                index,
                decl,
                current_path,
                ref.type_id,
                current_required,
                container_required,
                not ref.is_optional,
                nested,
                current_bounds,
                list_element,
                ref.is_list,
            )
        return
    if ref.type_id in visiting:
        return
    if isinstance(spec, RecordType):
        element = current_path if ref.is_list else None
        yield from _walk_record(
            types,
            side,
            index,
            spec.fields,
            current_path,
            required=current_required,
            container_required=current_required if element is not None else container_required,
            nested=True,
            bounds=current_bounds,
            list_element=element,
            visiting=visiting | {ref.type_id},
        )
        return
    if isinstance(spec, UnionType):
        element = current_path if ref.is_list else None
        branches = [
            list(
                _walk_record(
                    types,
                    side,
                    index,
                    variant.fields,
                    current_path,
                    required=current_required,
                    container_required=current_required if element is not None else container_required,
                    nested=True,
                    bounds=current_bounds,
                    list_element=element,
                    visiting=visiting | {ref.type_id},
                )
            )
            for variant in spec.variants
        ]
        yield from _merge_branches(branches)
        return
    yield _occurrence(
        side,
        index,
        decl,
        current_path,
        ref.type_id,
        current_required,
        container_required,
        not ref.is_optional,
        nested,
        current_bounds,
        list_element,
        ref.is_list,
    )


def _walk_record(
    types: Types,
    side: Side,
    index: int,
    fields: Sequence[FieldDecl],
    path: str,
    *,
    required: bool,
    container_required: bool,
    nested: bool,
    bounds: tuple[int | None, ...],
    list_element: str | None,
    visiting: frozenset[TypeId],
) -> Iterator[ValuePath]:
    for decl in fields:
        yield from _walk_decl(
            types,
            side,
            index,
            decl,
            f"{path}.{decl.name}",
            required=required,
            container_required=container_required,
            nested=nested,
            bounds=bounds,
            list_element=list_element,
            visiting=visiting,
        )


def _occurrence(
    side: Side,
    index: int,
    decl: FieldDecl,
    path: str,
    type_id: TypeId,
    required: bool,
    container_required: bool,
    key_required: bool,
    nested: bool,
    bounds: tuple[int | None, ...],
    list_element: str | None,
    is_list: bool,
) -> ValuePath:
    factors = tuple(bound for bound in bounds if bound is not None)
    capacity = factors if len(factors) == len(bounds) else None
    return ValuePath(
        side,
        index,
        decl,
        path,
        type_id,
        required,
        container_required,
        key_required,
        nested,
        len(bounds),
        capacity,
        decl.name if list_element is not None and not is_list else None,
        list_element if not is_list else None,
    )


def _merge_branches(branches: Sequence[Sequence[ValuePath]]) -> Iterator[ValuePath]:
    grouped: dict[OccurrenceKey, list[ValuePath]] = {}
    for branch in branches:
        own: dict[OccurrenceKey, list[ValuePath]] = {}
        for item in branch:
            own.setdefault(_key(item), []).append(item)
        for key, occurrences in own.items():
            grouped.setdefault(key, []).append(_merge_occurrences(occurrences, universal=True))
    for key in sorted(grouped, key=lambda item: (item[0], item[1], item[2], item[3], item[4] or "", item[5] or "")):
        occurrences = grouped[key]
        yield _merge_occurrences(occurrences, universal=len(occurrences) == len(branches))


def _merge_occurrences(occurrences: Sequence[ValuePath], *, universal: bool) -> ValuePath:
    first = min(occurrences, key=lambda item: (item.path, item.type_id))
    known = universal and all(item.capacity_factors is not None for item in occurrences)
    factors = max(
        (item.capacity_factors for item in occurrences if item.capacity_factors is not None),
        key=prod,
        default=None,
    )
    return replace(
        first,
        required=universal and all(item.required for item in occurrences),
        container_required=universal and all(item.container_required for item in occurrences),
        key_required=universal and all(item.key_required for item in occurrences),
        nested=any(item.nested for item in occurrences),
        capacity_factors=factors if known else None,
    )


def _key(item: ValuePath) -> OccurrenceKey:
    return (item.side, item.index, item.path, item.type_id, item.key_name, item.list_path)
