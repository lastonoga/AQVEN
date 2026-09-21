from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from aqven.check.graph import NodeEntry, ProjectGraph
from aqven.loader import YamlPath
from aqven.spec import (
    CodeNodeSpec,
    FieldDecl,
    HumanNodeSpec,
    LoopNodeSpec,
    MapNodeSpec,
    NodeSpec,
    ParallelNodeSpec,
    RecordType,
    SwitchNodeSpec,
    TypeSpec,
    UnionType,
)


class FieldRole(StrEnum):
    INPUT = "input"
    OUTPUT = "output"
    TYPE_FIELD = "type_field"


@dataclass(frozen=True, slots=True)
class FieldSite:
    file: str
    path: YamlPath
    decl: FieldDecl
    role: FieldRole
    entry: NodeEntry | None


def typed_entries[S: NodeSpec](graph: ProjectGraph, kind: type[S]) -> Iterator[tuple[NodeEntry, S]]:
    for entry in graph.all_entries():
        spec = entry.spec
        if isinstance(spec, kind):
            yield entry, spec


def field_sites(graph: ProjectGraph) -> Iterator[FieldSite]:
    yield from _type_field_sites(graph)
    yield from _registry_field_sites(graph)
    for entry in graph.all_entries():
        yield from node_field_sites(entry)


def node_field_sites(entry: NodeEntry) -> Iterator[FieldSite]:
    for key, role, reader in NODE_FIELD_READERS:
        for index, decl in enumerate(reader(entry.spec)):
            yield FieldSite(entry.file, (key, index), decl, role, entry)


def _type_field_sites(graph: ProjectGraph) -> Iterator[FieldSite]:
    for source in graph.project.types.values():
        yield from _type_spec_fields(source.path, source.spec)


def _type_spec_fields(file: str, spec: TypeSpec) -> Iterator[FieldSite]:
    if isinstance(spec, RecordType):
        yield from (
            FieldSite(file, ("fields", index), decl, FieldRole.TYPE_FIELD, None)
            for index, decl in enumerate(spec.fields)
        )
    variants = spec.variants if isinstance(spec, UnionType) else ()
    yield from (
        FieldSite(file, ("variants", variant_index, "fields", index), decl, FieldRole.TYPE_FIELD, None)
        for variant_index, variant in enumerate(variants)
        for index, decl in enumerate(variant.fields)
    )


def _registry_field_sites(graph: ProjectGraph) -> Iterator[FieldSite]:
    project = graph.project
    specs = (
        *(source for loaded in project.inferences.values() if (source := loaded.source) is not None),
        *project.tools.values(),
    )
    for source in specs:
        yield from _contract_sites(source.path, source.spec.in_, source.spec.out)


def _contract_sites(file: str, inputs: Sequence[FieldDecl], outputs: Sequence[FieldDecl]) -> Iterator[FieldSite]:
    yield from (FieldSite(file, ("in", index), decl, FieldRole.INPUT, None) for index, decl in enumerate(inputs))
    yield from (FieldSite(file, ("out", index), decl, FieldRole.OUTPUT, None) for index, decl in enumerate(outputs))


def _inputs(spec: NodeSpec) -> Sequence[FieldDecl]:
    return spec.in_ if isinstance(spec, INPUT_CLASSES) else ()


def _outputs(spec: NodeSpec) -> Sequence[FieldDecl]:
    return spec.out if isinstance(spec, OUTPUT_CLASSES) else ()


INPUT_CLASSES: Final = (CodeNodeSpec, HumanNodeSpec)
OUTPUT_CLASSES: Final = (
    CodeNodeSpec,
    ParallelNodeSpec,
    MapNodeSpec,
    SwitchNodeSpec,
    LoopNodeSpec,
)

NODE_FIELD_READERS: Final[tuple[tuple[str, FieldRole, Callable[[NodeSpec], Sequence[FieldDecl]]], ...]] = (
    ("in", FieldRole.INPUT, _inputs),
    ("out", FieldRole.OUTPUT, _outputs),
)
