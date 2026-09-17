from collections.abc import Iterable, Iterator, Mapping
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.scopes import Unresolved
from aqven.check.types import reachable
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import FlowId, LoopNodeSpec, MapNodeSpec, ParallelNodeSpec, SwitchNodeSpec, inner_nodes

INNER_KEYS: Final[Mapping[type, str]] = {
    ParallelNodeSpec: "body",
    MapNodeSpec: "body",
    SwitchNodeSpec: "cases",
    LoopNodeSpec: "body",
}


def check_refs(context: CheckContext) -> Iterable[Diagnostic]:
    return (
        *_binding_refs(context),
        *_order(context),
        *_inner_nodes(context),
        *_cycles(context),
    )


def _binding_refs(context: CheckContext) -> Iterator[Diagnostic]:
    for site in context.graph.binding_sites():
        resolution = context.refs.resolve(site.scope, site.text)
        if isinstance(resolution, Unresolved):
            yield diagnostic(resolution.code, site.file, site.path, resolution.message)


def _order(context: CheckContext) -> Iterator[Diagnostic]:
    for owner in context.graph.owners():
        path = context.graph.owner_source_path(owner)
        if path is None:
            continue
        yield from _order_of(context, owner, path)


def _order_of(context: CheckContext, owner: FlowId, path: str) -> Iterator[Diagnostic]:
    order = context.graph.order(owner)
    top = [entry for entry in context.graph.owner_entries(owner) if entry.parent is None]
    for index, node_id in enumerate(order):
        if context.graph.top(owner, node_id) is not None or context.graph.broken_node(node_id):
            continue
        message = f"node {node_id} from order is not among the top-level nodes of {owner}"
        yield diagnostic(DiagnosticCode.E_REF_MISSING, path, ("order", index), message)
    for entry in top:
        if entry.node_id in order or context.project.broken_ids:
            continue
        yield diagnostic(
            DiagnosticCode.E_NODE_UNORDERED,
            entry.file,
            (),
            f"top-level node {entry.node_id} is not listed in order",
        )
    duplicates = sorted({node_id for index, node_id in enumerate(order) if node_id in order[:index]})
    for node_id in duplicates:
        yield diagnostic(DiagnosticCode.E_SPEC_INVALID, path, ("order",), f"node {node_id} is repeated in order")


def _inner_nodes(context: CheckContext) -> Iterator[Diagnostic]:
    missing = (
        (entry, local)
        for entry in context.graph.all_entries()
        for local in inner_nodes(entry.spec)
        if context.graph.inner(entry, local) is None and not context.graph.broken_node(local)
    )
    for entry, local in missing:
        yield diagnostic(
            DiagnosticCode.E_REF_MISSING,
            entry.file,
            (INNER_KEYS[type(entry.spec)],),
            f"inner node {local} is not among the nodes of {entry.owner} or is already the body of another node",
        )


def _cycles(context: CheckContext) -> Iterator[Diagnostic]:
    entries = context.graph.all_entries()
    edges = {id(entry): [id(item) for item in context.refs.entry_dependencies(entry)] for entry in entries}
    for entry in entries:
        if id(entry) not in reachable(edges, id(entry)):
            continue
        yield diagnostic(
            DiagnosticCode.E_CYCLE,
            entry.file,
            (),
            f"node {entry.node_id} depends on itself through a chain of references",
        )
