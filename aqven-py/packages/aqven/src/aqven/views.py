from collections.abc import Callable, Iterable, Mapping, Sequence
from types import MappingProxyType
from typing import Final

from aqven.diagnostics import render_path
from aqven.loader import EntityKey, EntityKind, ProjectIndex, Reference

UNDEFINED: Final = "—"
IMPLICIT: Final = "by convention"
INDENT: Final = "  "
GAP: Final = "  "
NO_NOTES: Final[Mapping[EntityKey, str]] = MappingProxyType({})


def render_tree(index: ProjectIndex, notes: Mapping[EntityKey, str] = NO_NOTES) -> str:
    groups = ((kind, sorted(key for key in index.definitions if key.kind is kind)) for kind in EntityKind)
    return "\n".join(_group(index, kind, keys, notes) for kind, keys in groups if keys)


def render_refs(index: ProjectIndex, key: EntityKey) -> str:
    incoming = _rows(index.incoming(key), _source)
    outgoing = _rows(index.outgoing(key), _target)
    return "\n".join(
        (
            str(key),
            f"definition: {index.definitions.get(key, UNDEFINED)}",
            f"referenced by ({len(incoming)}):",
            *incoming,
            f"references ({len(outgoing)}):",
            *outgoing,
        )
    )


def _group(index: ProjectIndex, kind: EntityKind, keys: Sequence[EntityKey], notes: Mapping[EntityKey, str]) -> str:
    width = max(len(index.definitions[key]) for key in keys)
    rows = _table([(key.id, _noted(index.definitions[key], notes.get(key), width)) for key in keys])
    return "\n".join((f"{kind.value} ({len(keys)})", *rows))


def _noted(path: str, note: str | None, width: int) -> str:
    return path if note is None else f"{path.ljust(width)}{GAP}{note}"


def _rows(references: Iterable[Reference], other: Callable[[Reference], EntityKey]) -> list[str]:
    ordered = sorted(references, key=lambda reference: (reference.file, reference.line or 0, str(other(reference))))
    return _table([(str(other(reference)), _location(reference)) for reference in ordered])


def _table(cells: Sequence[tuple[str, str]]) -> list[str]:
    width = max((len(name) for name, _ in cells), default=0)
    return [f"{INDENT}{name.ljust(width)}{GAP}{detail}" for name, detail in cells]


def _location(reference: Reference) -> str:
    field = render_path(reference.field)
    if reference.line is None:
        return f"{reference.file} {field} ({IMPLICIT})"
    return f"{reference.file}:{reference.line} {field}"


def _source(reference: Reference) -> EntityKey:
    return reference.source


def _target(reference: Reference) -> EntityKey:
    return reference.target
