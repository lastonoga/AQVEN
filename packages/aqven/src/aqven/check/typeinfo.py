from collections.abc import Iterable, Mapping, Sequence
from typing import Final

from aqven.spec import (
    BUILTIN_TYPE_IDS,
    FieldDecl,
    PiiClass,
    RecordType,
    TypeId,
    TypeRefSyntaxError,
    TypeSpec,
    UnionType,
    parse_type_ref,
)

type Types = Mapping[TypeId, TypeSpec]

PII_RANK: Final[Mapping[PiiClass, int]] = {PiiClass.NONE: 0, PiiClass.PII: 1, PiiClass.SENSITIVE: 2}


def decl_type_id(decl: FieldDecl) -> TypeId | None:
    try:
        return parse_type_ref(decl.type).type_id
    except TypeRefSyntaxError:
        return None


def type_fields(spec: TypeSpec) -> Sequence[FieldDecl]:
    if isinstance(spec, RecordType):
        return spec.fields
    if isinstance(spec, UnionType):
        return [decl for variant in spec.variants for decl in variant.fields]
    return ()


def contained_types(type_id: TypeId, types: Types) -> frozenset[TypeId]:
    seen: set[TypeId] = set()
    frontier = [type_id]
    while frontier:
        current = frontier.pop()
        if current in seen:
            continue
        seen.add(current)
        spec = types.get(current)
        frontier.extend(_field_types(type_fields(spec)) if spec is not None else ())
    return frozenset(seen)


def fields_contained_types(fields: Iterable[FieldDecl], types: Types) -> frozenset[TypeId]:
    return frozenset(item for type_id in _field_types(fields) for item in contained_types(type_id, types))


def pii_class(type_ids: Iterable[TypeId], types: Types) -> PiiClass:
    classes = [spec.pii for type_id in type_ids if type_id not in BUILTIN_TYPE_IDS and (spec := types.get(type_id))]
    return max(classes, key=PII_RANK.__getitem__, default=PiiClass.NONE)


def _field_types(fields: Iterable[FieldDecl]) -> list[TypeId]:
    return [type_id for decl in fields if (type_id := decl_type_id(decl)) is not None]
