from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.nodes import FieldRole, FieldSite, field_sites
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import (
    ALWAYS_BOUNDED_TYPES,
    DYNAMIC,
    TEXT,
    Constraints,
    EnumType,
    FieldDecl,
    IdType,
    RecordType,
    TypeId,
    TypeRefSyntaxError,
    TypeSpec,
    UnionType,
    ValueType,
    parse_type_ref,
)

type Types = Mapping[TypeId, TypeSpec]
type TypeBound = Callable[[TypeSpec, Types, frozenset[TypeId]], Unbounded | None]

ALWAYS_BOUNDED: Final = frozenset({*ALWAYS_BOUNDED_TYPES, DYNAMIC})


@dataclass(frozen=True, slots=True)
class Unbounded:
    path: tuple[str, ...]
    reason: str

    def describe(self) -> str:
        return f"{'.'.join(self.path)}: {self.reason}"


def check_bounds(context: CheckContext) -> Iterable[Diagnostic]:
    types = {type_id: source.spec for type_id, source in context.project.types.items()}
    outputs = (site for site in field_sites(context.graph) if site.role is FieldRole.OUTPUT)
    return tuple(item for site in outputs for item in _site_bounds(site, types))


def unbounded_field(decl: FieldDecl, types: Types, visiting: frozenset[TypeId] = frozenset()) -> Unbounded | None:
    try:
        ref = parse_type_ref(decl.type)
    except TypeRefSyntaxError:
        return None
    if ref.is_list and decl.max_items is None:
        return Unbounded((decl.name,), "list without maxItems")
    inner = _item_unbounded(ref.type_id, decl, types, visiting)
    return Unbounded((decl.name, *inner.path), inner.reason) if inner is not None else None


def _site_bounds(site: FieldSite, types: Types) -> Iterator[Diagnostic]:
    found = unbounded_field(site.decl, types)
    if found is None:
        return
    message = f"output is unbounded (R-42): {found.describe()}"
    yield diagnostic(DiagnosticCode.E_OUTPUT_UNBOUNDED, site.file, site.path, message)


def _item_unbounded(
    type_id: TypeId,
    constraints: Constraints,
    types: Types,
    visiting: frozenset[TypeId],
) -> Unbounded | None:
    if type_id in ALWAYS_BOUNDED:
        return None
    if type_id == TEXT:
        return None if _text_bounded(constraints) else Unbounded((), "Text without maxLength or enum")
    spec = types.get(type_id)
    if spec is None or type_id in visiting:
        return None
    return TYPE_BOUNDS[type(spec)](spec, types, visiting | {type_id})


def _text_bounded(constraints: Constraints) -> bool:
    return constraints.max_length is not None or constraints.enum is not None


def _first_unbounded(fields: Iterable[FieldDecl], types: Types, visiting: frozenset[TypeId]) -> Unbounded | None:
    return next((found for decl in fields if (found := unbounded_field(decl, types, visiting)) is not None), None)


def _record(spec: TypeSpec, types: Types, visiting: frozenset[TypeId]) -> Unbounded | None:
    fields = spec.fields if isinstance(spec, RecordType) else ()
    return _first_unbounded(fields, types, visiting)


def _union(spec: TypeSpec, types: Types, visiting: frozenset[TypeId]) -> Unbounded | None:
    variants = spec.variants if isinstance(spec, UnionType) else ()
    return _first_unbounded((decl for variant in variants for decl in variant.fields), types, visiting)


def _enum(spec: TypeSpec, types: Types, visiting: frozenset[TypeId]) -> Unbounded | None:
    return None


def _id(spec: TypeSpec, types: Types, visiting: frozenset[TypeId]) -> Unbounded | None:
    if not isinstance(spec, IdType) or spec.pattern is not None or spec.max_length is not None:
        return None
    return Unbounded((), "id without pattern or maxLength")


def _value(spec: TypeSpec, types: Types, visiting: frozenset[TypeId]) -> Unbounded | None:
    if not isinstance(spec, ValueType) or spec.base != TEXT or _text_bounded(spec):
        return None
    return Unbounded((), "value Text without maxLength or enum")


TYPE_BOUNDS: Final[Mapping[type, TypeBound]] = {
    RecordType: _record,
    UnionType: _union,
    EnumType: _enum,
    IdType: _id,
    ValueType: _value,
}
