from collections.abc import Iterable, Iterator, Mapping, Sequence
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.nodes import FieldRole, field_sites, typed_entries
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import YamlPath
from aqven.spec import (
    BUILTIN_TYPE_IDS,
    FLOAT,
    INT,
    TEXT,
    BoundField,
    Constraints,
    FieldDecl,
    HumanNodeSpec,
    NarrowNodeSpec,
    OutputField,
    RecordType,
    TypeId,
    TypeRef,
    TypeRefSyntaxError,
    TypeSpec,
    UnionType,
    ValueType,
    parse_type_ref,
)

TEXT_CONSTRAINTS: Final = frozenset({"maxLength", "pattern", "enum"})
NUMBER_CONSTRAINTS: Final = frozenset({"minimum", "maximum"})
LIST_CONSTRAINTS: Final = frozenset({"maxItems"})
ITEM_CONSTRAINTS: Final[Mapping[TypeId, frozenset[str]]] = {
    TEXT: TEXT_CONSTRAINTS,
    INT: NUMBER_CONSTRAINTS,
    FLOAT: NUMBER_CONSTRAINTS,
}
CONSTRAINT_ATTRIBUTES: Final[tuple[tuple[str, str], ...]] = (
    ("max_length", "maxLength"),
    ("max_items", "maxItems"),
    ("minimum", "minimum"),
    ("maximum", "maximum"),
    ("pattern", "pattern"),
    ("enum", "enum"),
)


def check_types(context: CheckContext) -> Iterable[Diagnostic]:
    return (
        *_field_declarations(context),
        *_type_references(context),
        *_value_types(context),
        *_recursion(context),
    )


def present_constraints(constraints: Constraints) -> frozenset[str]:
    return frozenset(key for attribute, key in CONSTRAINT_ATTRIBUTES if getattr(constraints, attribute) is not None)


def _field_declarations(context: CheckContext) -> Iterator[Diagnostic]:
    for site in field_sites(context.graph):
        yield from _declaration(context, site.file, site.path, site.decl)


def _declaration(context: CheckContext, file: str, path: YamlPath, decl: FieldDecl) -> Iterator[Diagnostic]:
    ref = _parse(decl.type)
    if isinstance(ref, str):
        yield diagnostic(DiagnosticCode.E_TYPE_REF_SYNTAX, file, (*path, "type"), ref)
        return
    if not _known(context, ref.type_id):
        yield _unknown(file, (*path, "type"), ref.type_id)
        return
    allowed = ITEM_CONSTRAINTS.get(ref.type_id, frozenset[str]()) | (
        LIST_CONSTRAINTS if ref.is_list else frozenset[str]()
    )
    extra = sorted(present_constraints(decl) - allowed)
    if not extra:
        return
    yield diagnostic(
        DiagnosticCode.E_TYPE_CONSTRAINT_MISMATCH,
        file,
        (*path, extra[0]),
        f"constraints {', '.join(extra)} do not apply to type {decl.type}",
    )


def _type_references(context: CheckContext) -> Iterator[Diagnostic]:
    for file, path, text in _reference_sites(context):
        yield from _reference(context, file, path, text)


def _reference_sites(context: CheckContext) -> Iterator[tuple[str, YamlPath, str]]:
    sources = [flow.source for flow in context.project.flows.values() if flow.source is not None]
    yield from ((source.path, ("input",), source.spec.input) for source in sources)
    yield from ((source.path, ("output",), source.spec.output) for source in sources)
    yield from ((entry.file, ("form",), human.form) for entry, human in typed_entries(context.graph, HumanNodeSpec))
    yield from ((entry.file, ("to",), narrow.to) for entry, narrow in typed_entries(context.graph, NarrowNodeSpec))
    yield from (
        (site.file, (*site.path, "value_type"), site.decl.value_type)
        for site in field_sites(context.graph)
        if site.role is FieldRole.OUTPUT
        and isinstance(site.decl, OutputField | BoundField)
        and site.decl.value_type is not None
    )
    yield from (
        (source.path, ("allowed_sets", index, "type"), allowed.type)
        for loaded in context.project.inferences.values()
        if (source := loaded.source) is not None
        for index, allowed in enumerate(source.spec.allowed_sets or ())
    )


def _reference(context: CheckContext, file: str, path: YamlPath, text: str) -> Iterator[Diagnostic]:
    ref = _parse(text)
    if isinstance(ref, str):
        yield diagnostic(DiagnosticCode.E_TYPE_REF_SYNTAX, file, path, ref)
        return
    if not _known(context, ref.type_id):
        yield _unknown(file, path, ref.type_id)


def _value_types(context: CheckContext) -> Iterator[Diagnostic]:
    for source in context.project.types.values():
        spec = source.spec
        if not isinstance(spec, ValueType):
            continue
        extra = sorted(present_constraints(spec) - ITEM_CONSTRAINTS.get(TypeId(spec.base), frozenset()))
        if extra:
            yield diagnostic(
                DiagnosticCode.E_TYPE_CONSTRAINT_MISMATCH,
                source.path,
                (extra[0],),
                f"constraints {', '.join(extra)} do not apply to base {spec.base}",
            )


def _recursion(context: CheckContext) -> Iterator[Diagnostic]:
    specs = {type_id: source.spec for type_id, source in context.project.types.items()}
    edges = {type_id: _referenced_types(spec) for type_id, spec in specs.items()}
    for type_id, source in context.project.types.items():
        if type_id not in reachable(edges, type_id):
            continue
        yield diagnostic(
            DiagnosticCode.E_TYPE_RECURSIVE,
            source.path,
            (),
            f"type {type_id} references itself recursively: recursive types are not allowed",
        )


def _referenced_types(spec: TypeSpec) -> frozenset[TypeId]:
    return frozenset(ref.type_id for decl in _type_fields(spec) if not isinstance(ref := _parse(decl.type), str))


def _type_fields(spec: TypeSpec) -> Sequence[FieldDecl]:
    if isinstance(spec, RecordType):
        return spec.fields
    if isinstance(spec, UnionType):
        return [decl for variant in spec.variants for decl in variant.fields]
    return ()


def reachable[K](edges: Mapping[K, Iterable[K]], start: K) -> frozenset[K]:
    seen: set[K] = set()
    frontier = list(edges.get(start, ()))
    while frontier:
        item = frontier.pop()
        if item in seen:
            continue
        seen.add(item)
        frontier.extend(edges.get(item, ()))
    return frozenset(seen)


def _parse(text: str) -> TypeRef | str:
    try:
        return parse_type_ref(text)
    except TypeRefSyntaxError as error:
        return f"type reference {text!r}: {error.reason}"


def _known(context: CheckContext, type_id: TypeId) -> bool:
    return type_id in BUILTIN_TYPE_IDS or type_id in context.project.types


def _unknown(file: str, path: YamlPath, type_id: TypeId) -> Diagnostic:
    return diagnostic(
        DiagnosticCode.E_TYPE_UNKNOWN, file, path, f"type {type_id} is neither built in nor declared in the project"
    )
