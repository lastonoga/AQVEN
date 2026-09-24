import logging
from collections.abc import Callable, Mapping
from typing import Final

from aqven.app.console_log.events import ConsoleEvent, Tone
from aqven.app.console_log.text import joined, plural
from aqven.server.spec_channel import DiagnosticsChanged, FilesChanged, SpecEvent, SpecResync

type SpecLine = Callable[[SpecEvent], ConsoleEvent | None]

SPEC_GLYPH: Final = "✎"
LISTED_PATHS: Final = 5
STATUS_TEXT: Final[Mapping[str, str]] = {
    "ok": "compiles",
    "not_runnable": "not runnable",
    "invalid": "does not compile",
    "unreadable": "unreadable",
}
BROKEN_STATUSES: Final = frozenset({"invalid", "unreadable"})


def files_line(event: SpecEvent) -> ConsoleEvent | None:
    if not isinstance(event, FilesChanged) or not event.changes:
        return None
    changes = event.changes
    head = f"{changes[0].path} {changes[0].change}" if len(changes) == 1 else f"{plural(len(changes), 'file')} changed"
    listed = () if len(changes) == 1 else tuple(f"{item.change} {item.path}" for item in changes[:LISTED_PATHS])
    hidden = len(changes) - LISTED_PATHS
    more = (f"and {hidden} more",) if listed and hidden > 0 else ()
    return ConsoleEvent(
        kind="spec_changed",
        glyph=SPEC_GLYPH,
        tone="plain",
        text=joined(head, "reindexed"),
        details=(*listed, *more),
        fields={
            "paths": [item.path for item in changes],
            "summary": event.summary,
            "actor": event.actor.kind,
            "tree_hash": event.tree_hash,
        },
    )


def health_tone(event: DiagnosticsChanged) -> Tone:
    if event.problems.error or event.compile_status in BROKEN_STATUSES:
        return "bad"
    if event.problems.warning or event.compile_status != "ok":
        return "notice"
    return "good"


def diagnostics_line(event: SpecEvent) -> ConsoleEvent | None:
    if not isinstance(event, DiagnosticsChanged):
        return None
    problems = event.problems
    counts = joined(
        plural(problems.error, "error") if problems.error else None,
        plural(problems.warning, "warning") if problems.warning else None,
    )
    return ConsoleEvent(
        kind="flow_checked",
        glyph=SPEC_GLYPH,
        tone=health_tone(event),
        text=joined(
            f"flow {event.flow_id}",
            STATUS_TEXT.get(event.compile_status, event.compile_status),
            counts or "no problems",
        ),
        fields={
            "flow": event.flow_id,
            "compile_status": event.compile_status,
            "errors": problems.error,
            "warnings": problems.warning,
        },
        level=logging.WARNING if problems.error else logging.INFO,
    )


def resync_line(event: SpecEvent) -> ConsoleEvent | None:
    if not isinstance(event, SpecResync):
        return None
    return ConsoleEvent(
        kind="spec_resync",
        glyph=SPEC_GLYPH,
        tone="muted",
        text=f"project reindexed ({event.reason.replace('_', ' ')})",
        fields={"reason": event.reason, "tree_hash": event.tree_hash},
    )


SPEC_LINES: Final[Mapping[str, SpecLine]] = {
    "files_changed": files_line,
    "diagnostics_changed": diagnostics_line,
    "resync": resync_line,
}


def spec_line(event: SpecEvent) -> ConsoleEvent | None:
    render = SPEC_LINES.get(event.type)
    return None if render is None else render(event)
