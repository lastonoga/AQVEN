from collections.abc import Iterable, Iterator

from aqven.check.context import CheckContext
from aqven.check.graph import NodeEntry
from aqven.check.nodes import typed_entries
from aqven.check.scopes import Resolved
from aqven.check.shapes import enum_values, is_dynamic, union_variants
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import SwitchNodeSpec


def check_control(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(_switches(context))


def switch_keys(context: CheckContext, entry: NodeEntry, spec: SwitchNodeSpec) -> tuple[str, ...] | None:
    resolution = context.refs.resolve(context.graph.scope_of(entry), spec.on)
    if not isinstance(resolution, Resolved) or resolution.annotation is None:
        return None
    variants = union_variants(resolution.annotation)
    if variants is not None:
        return tuple(variants)
    return enum_values(resolution.annotation)


def _switches(context: CheckContext) -> Iterator[Diagnostic]:
    for entry, spec in typed_entries(context.graph, SwitchNodeSpec):
        yield from _switch(context, entry, spec)


def _switch(context: CheckContext, entry: NodeEntry, spec: SwitchNodeSpec) -> Iterator[Diagnostic]:
    resolution = context.refs.resolve(context.graph.scope_of(entry), spec.on)
    if not isinstance(resolution, Resolved) or resolution.annotation is None:
        return
    if is_dynamic(resolution.annotation):
        message = f"switch on {spec.on}: a Dynamic value is opaque, narrow it to a record or union first"
        yield diagnostic(DiagnosticCode.E_OPAQUE_ACCESS, entry.file, ("on",), message)
        return
    keys = switch_keys(context, entry, spec)
    if keys is None:
        message = f"switch on {spec.on}: the value must be an enum or a discriminated union"
        yield diagnostic(DiagnosticCode.E_SWITCH_ON_TYPE, entry.file, ("on",), message)
        return
    missing = [key for key in keys if key not in spec.cases]
    unknown = [key for key in spec.cases if key not in keys]
    if missing:
        message = f"cases do not cover values {', '.join(missing)}; there is no default case"
        yield diagnostic(DiagnosticCode.E_SWITCH_NOT_EXHAUSTIVE, entry.file, ("cases",), message)
    for key in unknown:
        message = f"case {key} does not match any value of {spec.on}: {', '.join(keys)}"
        yield diagnostic(DiagnosticCode.E_SWITCH_NOT_EXHAUSTIVE, entry.file, ("cases", key), message)
