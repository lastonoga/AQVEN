from collections.abc import Mapping, Sequence
from contextlib import suppress
from dataclasses import dataclass

from aqven.spec.fields import FieldDecl
from aqven.spec.names import TypeId
from aqven.spec.typeref import TypeRefSyntaxError, parse_type_ref
from aqven.spec.types import EnumType, RecordType, TypeSpec, UnionType


@dataclass(frozen=True, slots=True)
class OutputEnumDefinition:
    type_id: TypeId
    spec: EnumType
    paths: tuple[str, ...]


def collect_output_enums(
    fields: Sequence[FieldDecl], types: Mapping[TypeId, TypeSpec]
) -> tuple[OutputEnumDefinition, ...]:
    collector = _Collector(types, _recursive_types(types))
    for decl in fields:
        collector.field(decl, decl.name)
    return collector.result()


def _recursive_types(types: Mapping[TypeId, TypeSpec]) -> frozenset[TypeId]:
    edges = {type_id: _references(spec) for type_id, spec in types.items()}
    recursive: set[TypeId] = set()
    for start in edges:
        seen: set[TypeId] = set()
        frontier = list(edges[start])
        while frontier:
            item = frontier.pop()
            if item in seen:
                continue
            seen.add(item)
            frontier.extend(edges.get(item, ()))
        if start in seen:
            recursive.add(start)
    return frozenset(recursive)


def _references(spec: TypeSpec) -> frozenset[TypeId]:
    if isinstance(spec, RecordType):
        fields = spec.fields
    elif isinstance(spec, UnionType):
        fields = tuple(decl for variant in spec.variants for decl in variant.fields)
    else:
        fields = ()
    found: set[TypeId] = set()
    for decl in fields:
        with suppress(TypeRefSyntaxError):
            found.add(parse_type_ref(decl.type).type_id)
    return frozenset(found)


class _Collector:
    def __init__(self, types: Mapping[TypeId, TypeSpec], recursive: frozenset[TypeId]) -> None:
        self.types = types
        self.recursive = recursive
        self.definitions: dict[TypeId, EnumType] = {}
        self.paths: dict[TypeId, set[str]] = {}
        self.active: set[TypeId] = set()

    def result(self) -> tuple[OutputEnumDefinition, ...]:
        return tuple(
            OutputEnumDefinition(type_id, spec, tuple(sorted(self.paths[type_id])))
            for type_id, spec in self.definitions.items()
        )

    def field(self, decl: FieldDecl, path: str) -> None:
        try:
            reference = parse_type_ref(decl.type)
        except TypeRefSyntaxError:
            return
        nested_path = f"{path}[*]" if reference.is_list else path
        self.type(reference.type_id, nested_path)

    def type(self, type_id: TypeId, path: str) -> None:
        if type_id in self.recursive:
            return
        spec = self.types.get(type_id)
        if isinstance(spec, EnumType):
            if type_id not in self.definitions:
                self.definitions[type_id] = spec
            self.paths.setdefault(type_id, set()).add(path)
            return
        if type_id in self.active:
            return
        self.active.add(type_id)
        if isinstance(spec, RecordType):
            self.fields(spec.fields, path)
        elif isinstance(spec, UnionType):
            for variant in spec.variants:
                self.fields(variant.fields, path)
        self.active.remove(type_id)

    def fields(self, fields: Sequence[FieldDecl], path: str) -> None:
        for decl in fields:
            self.field(decl, f"{path}.{decl.name}")
