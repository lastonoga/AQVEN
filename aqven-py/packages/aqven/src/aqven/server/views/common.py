import base64
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Final

from pydantic import JsonValue

from aqven.diagnostics import Diagnostic, Severity
from aqven.loader import LoadedFlow, LoadedProject, within
from aqven.runtime.project import registry_schema
from aqven.runtime.runs import Page
from aqven.server.errors import ApiFailure, not_found
from aqven.server.resources import ProblemCounts
from aqven.server.workspace import WorkspaceState
from aqven.spec import FlowId, TypeModelError, TypeModels, TypeRefSyntaxError, build_type_models

SCHEMA_FAILURES: Final = (TypeModelError, TypeRefSyntaxError, LookupError, ValueError, TypeError)
CURSOR_ENCODING: Final = "utf-8"
CURSOR_ALTCHARS: Final = b"-_"


def loaded_project(state: WorkspaceState) -> LoadedProject:
    project = state.report.project
    if project is None:
        raise ApiFailure("NOT_RUNNABLE", "project did not load: aqven.yaml is missing or could not be parsed")
    return project


def loaded_flow(state: WorkspaceState, flow_id: str) -> LoadedFlow:
    flow = loaded_project(state).flows.get(FlowId(flow_id))
    if flow is None:
        raise not_found(f"flow {flow_id} is not in the project")
    return flow


def type_models(project: LoadedProject) -> TypeModels:
    return build_type_models({type_id: source.spec for type_id, source in project.types.items()})


def ref_schema(models: TypeModels, type_ref: str | None) -> JsonValue:
    if type_ref is None:
        return None
    try:
        return registry_schema(models, type_ref)
    except SCHEMA_FAILURES:
        return None


def diagnostics_in(state: WorkspaceState, paths: Iterable[str]) -> tuple[Diagnostic, ...]:
    wanted = frozenset(paths)
    return tuple(item for item in state.report.diagnostics if item.file in wanted)


def diagnostics_within(state: WorkspaceState, folder: str) -> tuple[Diagnostic, ...]:
    return tuple(item for item in state.report.diagnostics if within(item.file, folder))


def diagnostics_by_file(state: WorkspaceState) -> Mapping[str, tuple[Diagnostic, ...]]:
    grouped: dict[str, list[Diagnostic]] = {}
    for item in state.report.diagnostics:
        grouped.setdefault(item.file, []).append(item)
    return {path: tuple(items) for path, items in grouped.items()}


def problem_counts(items: Sequence[Diagnostic]) -> ProblemCounts:
    errors = sum(1 for item in items if item.severity is Severity.ERROR)
    warnings = sum(1 for item in items if item.severity is Severity.WARNING)
    return ProblemCounts(error=errors, warning=warnings, info=len(items) - errors - warnings)


def encode_cursor(key: str) -> str:
    return base64.urlsafe_b64encode(key.encode(CURSOR_ENCODING)).decode("ascii")


def decode_cursor(cursor: str) -> str:
    try:
        return base64.b64decode(cursor.encode("ascii"), altchars=CURSOR_ALTCHARS, validate=True).decode(CURSOR_ENCODING)
    except ValueError as error:
        raise ApiFailure("REQUEST_INVALID", f"cursor {cursor!r} was not issued by the server") from error


def page_of[T](items: Sequence[T], key: Callable[[T], str], cursor: str | None, limit: int) -> Page[T]:
    after = decode_cursor(cursor) if cursor is not None else None
    remaining = [item for item in items if after is None or key(item) > after]
    chosen = remaining[:limit]
    more = len(remaining) > limit
    next_cursor = encode_cursor(key(chosen[-1])) if more and chosen else None
    return Page[T](items=tuple(chosen), next_cursor=next_cursor, total_estimate=len(items))
