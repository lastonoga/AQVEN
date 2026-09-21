from collections.abc import Callable
from typing import Final

from pydantic import TypeAdapter, ValidationError

from aqven.engine.selection import SelectionError, range_missing, range_order
from aqven.runtime.runs import WORKING_COPY, RunStartRequest
from aqven.server.errors import ApiFailure, diagnostic_problem, validation_problems
from aqven.server.views.common import SCHEMA_FAILURES, loaded_flow, loaded_project, type_models
from aqven.server.workspace import WorkspaceState
from aqven.spec import parse_type_ref

INPUT_FIELD: Final = "input"

type StartGuard = Callable[[WorkspaceState, RunStartRequest], None]


def require_flow(state: WorkspaceState, request: RunStartRequest) -> None:
    loaded_flow(state, request.flow_id)


def require_runnable(state: WorkspaceState, request: RunStartRequest) -> None:
    if request.at != WORKING_COPY or state.report.ok:
        return
    problems = tuple(diagnostic_problem(item) for item in state.report.errors)
    raise ApiFailure("NOT_RUNNABLE", "working copy has errors: run rejected until they are fixed", problems=problems)


def require_valid_input(state: WorkspaceState, request: RunStartRequest) -> None:
    source = loaded_flow(state, request.flow_id).source
    if request.at != WORKING_COPY or request.input is None or source is None or request.start_node is not None:
        return
    adapter = input_adapter(state, source.spec.input)
    try:
        adapter.validate_python(request.input)
    except ValidationError as error:
        problems = validation_problems(error.errors(), (INPUT_FIELD,))
        raise ApiFailure("INPUT_INVALID", "input failed the flow input schema", problems=problems) from error


def require_range_boundary(state: WorkspaceState, request: RunStartRequest) -> None:
    if request.start_node is None or request.end_node is None:
        return
    if state.compiled is None or request.flow_id not in state.compiled.flows:
        raise ApiFailure("NOT_RUNNABLE", f"flow {request.flow_id} has no compiled execution plan")
    flow = state.compiled.flow(request.flow_id)
    try:
        range_order(flow, request.start_node, request.end_node)
    except SelectionError as error:
        raise ApiFailure("INPUT_INVALID", str(error)) from error
    if not isinstance(request.input, dict):
        raise ApiFailure("INPUT_INVALID", "a node range needs an input record")
    context = request.context.model_dump(mode="json", exclude_none=True) if request.context else {}
    missing = range_missing(
        flow, request.start_node, request.end_node, request.input, context, request.node_outputs
    )
    if missing:
        details = "; ".join(f"{item.reference}: {item.reason}" for item in missing)
        raise ApiFailure("INPUT_INVALID", f"node range is missing boundary data: {details}")


def input_adapter(state: WorkspaceState, type_ref: str) -> TypeAdapter[object]:
    models = type_models(loaded_project(state))
    try:
        return TypeAdapter[object](models.annotation(parse_type_ref(type_ref)))
    except SCHEMA_FAILURES as error:
        raise ApiFailure("NOT_RUNNABLE", f"input type {type_ref} cannot be built into a model") from error


START_GUARDS: Final[tuple[StartGuard, ...]] = (
    require_flow,
    require_runnable,
    require_valid_input,
    require_range_boundary,
)


def check_start(state: WorkspaceState, request: RunStartRequest) -> None:
    for guard in START_GUARDS:
        guard(state, request)
