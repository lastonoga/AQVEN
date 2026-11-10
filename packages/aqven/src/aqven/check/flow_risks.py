from collections.abc import Iterable, Iterator

from aqven.check.context import CheckContext
from aqven.check.graph import NodeEntry
from aqven.check.nodes import typed_entries
from aqven.check.scopes import Resolved
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import MapNodeSpec, RefRoot, RefSyntaxError, parse_ref

HINT = (
    "expose MapItemError[] from $failed with an appropriate bound when the node contract requires failure visibility"
)


def check_flow_risks(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for entry, spec in typed_entries(context.graph, MapNodeSpec)
        for item in _map_failure(context, entry, spec)
    )


def _map_failure(context: CheckContext, entry: NodeEntry, spec: MapNodeSpec) -> Iterator[Diagnostic]:
    policy = spec.on_item_error.use
    if spec.on_item_error.run is not None or policy not in {"skip", "default"}:
        return
    if context.graph.inner(entry, spec.body) is None:
        return
    over = context.refs.resolve(context.graph.scope_of(entry), spec.over)
    if not isinstance(over, Resolved) or over.annotation is None:
        return
    exposed = False
    for output in spec.out:
        try:
            ref = parse_ref(output.from_)
        except RefSyntaxError:
            return
        resolution = context.refs.resolve(context.graph.own_scope(entry), output.from_)
        if not isinstance(resolution, Resolved) or resolution.annotation is None:
            return
        exposed = exposed or ref.root is RefRoot.FAILED
    if exposed:
        return
    if policy == "skip":
        message = (
            f"Map `{entry.local_id}` recovers item failures with `skip`, but no output field exposes `$failed`; "
            "failed items can disappear from the node output. Expose failures or verify that downstream code "
            "reconstructs coverage from `$ok` and the input."
        )
    else:
        message = (
            f"Map `{entry.local_id}` replaces failed items with defaults, but no output field exposes `$failed`; "
            "failure records are absent from the node output even though defaulted items count as successful. "
            "Expose failures if downstream must distinguish them."
        )
    yield diagnostic(
        DiagnosticCode.W_MAP_ITEM_FAILURE_HIDDEN,
        entry.file,
        ("on_item_error", "use"),
        message,
        hint=HINT,
    )
