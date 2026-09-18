from collections.abc import AsyncIterable, Awaitable, Callable
from typing import Annotated, Final

from fastapi import APIRouter, Depends, Header, Query
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import Field
from starlette.responses import Response

from aqven.ports.engine import EngineFacade, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, RequestModel, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import ResumeRequest, ResumeResult
from aqven.runtime.presentation import PresentationRequest, PresentationResponse
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkRequest,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
)
from aqven.runtime.vocabulary import IncludePayloads
from aqven.server.context import ServerContext, operation, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.run_inputs import check_start
from aqven.server.views.datasets import resolve_dataset_run
from aqven.server.views.secrets import missing_secret_warnings

ACCEPTED: Final = 202
UNCONFIRMED_OUTCOME: Final = "sent"
FINAL_EVENT: Final = "run_finished"


class ExecutionDetailQuery(RequestModel):
    node_id: str
    branch_key: str | None = None
    iteration: Annotated[int, Field(ge=0)] | None = None
    item_index: Annotated[int, Field(ge=0)] | None = None
    include_payloads: IncludePayloads = "truncated"

    def address(self) -> ExecutionAddress:
        return ExecutionAddress(
            node_id=self.node_id,
            branch_key=self.branch_key,
            iteration=self.iteration,
            item_index=self.item_index,
        )


def event_frame(event: RunEvent) -> ServerSentEvent:
    return ServerSentEvent(data=event, event=event.type, id=str(event.seq))


def event_cursor(
    after_seq: Annotated[int, Query(ge=0)] = 0,
    last_event_id: Annotated[int | None, Header(ge=0)] = None,
) -> int:
    return after_seq if last_event_id is None else last_event_id


def run_guard(facade: EngineFacade) -> Callable[[str], Awaitable[RunId]]:
    async def existing_run(run_id: str) -> RunId:
        await facade.get_run(RunId(run_id))
        return RunId(run_id)

    return existing_run


def build_runs_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)
    facade = context.facade
    existing_run = run_guard(facade)

    @router.post("/runs", status_code=201, operation_id="run_start", openapi_extra=operation("run_start"))
    async def start_run(request: RunStartRequest) -> RunStarted:
        state = await context.workspace.state()
        resolved = resolve_dataset_run(state, request)
        check_start(state, resolved)
        warnings = await missing_secret_warnings(context.settings, context.environ, state)
        started = await facade.start_run(resolved, dataset_item_id=request.dataset_item_id)
        return started.model_copy(update={"warnings": warnings})

    @router.get("/runs", operation_id="run_list", openapi_extra=operation("run_list"))
    async def list_runs(query: Annotated[RunListQuery, Query()]) -> Page[RunSummary]:
        return await facade.list_runs(query)

    @router.get("/runs/{run_id}", operation_id="run_get", openapi_extra=operation("run_get"))
    async def get_run(run_id: str) -> RunSnapshot:
        return await facade.get_run(RunId(run_id))

    @router.get(
        "/runs/{run_id}/events",
        response_class=EventSourceResponse,
        operation_id="run_events",
        openapi_extra=rest_only("sse transport"),
    )
    async def run_events(
        run_id: Annotated[RunId, Depends(existing_run)],
        start: Annotated[int, Depends(event_cursor)],
    ) -> AsyncIterable[ServerSentEvent]:
        async for event in facade.run_events(run_id, start):
            yield event_frame(event)
            if event.type == FINAL_EVENT:
                return

    @router.get("/runs/{run_id}/events/log", operation_id="run_event_log", openapi_extra=rest_only("event replay"))
    async def run_event_log(run_id: str, query: Annotated[EventLogQuery, Query()]) -> Page[RunEvent]:
        return await facade.event_log(RunId(run_id), query)

    @router.get("/runs/{run_id}/executions", operation_id="run_executions", openapi_extra=operation("run_get"))
    async def list_executions(run_id: str, query: Annotated[ExecutionQuery, Query()]) -> tuple[NodeExecution, ...]:
        return await facade.list_executions(RunId(run_id), query)

    @router.get(
        "/runs/{run_id}/executions/detail",
        operation_id="run_executions_detail",
        openapi_extra=operation("run_get_node"),
    )
    async def get_execution(run_id: str, query: Annotated[ExecutionDetailQuery, Query()]) -> ExecutionDetail:
        return await facade.get_execution(RunId(run_id), query.address(), query.include_payloads)

    @router.post(
        "/runs/{run_id}/presentation",
        operation_id="run_presentation",
        openapi_extra=operation("run_get_node"),
    )
    async def present_run(run_id: str, request: PresentationRequest) -> PresentationResponse:
        return await facade.present_run(RunId(run_id), request)

    @router.post("/runs/{run_id}/resume", operation_id="run_resume", openapi_extra=operation("run_resume"))
    async def resume_run(run_id: str, request: ResumeRequest, response: Response) -> ResumeResult:
        result = await facade.resume(RunId(run_id), request)
        if result.outcome == UNCONFIRMED_OUTCOME:
            response.status_code = ACCEPTED
        return result

    @router.post(
        "/runs/{run_id}/fork",
        status_code=201,
        operation_id="run_fork",
        openapi_extra=operation("run_fork"),
    )
    async def fork_run(run_id: str, request: ForkRequest) -> RunForked:
        return await facade.fork(RunId(run_id), request)

    @router.post("/runs/{run_id}/cancel", operation_id="run_cancel", openapi_extra=operation("run_cancel"))
    async def cancel_run(run_id: str, request: CancelRequest) -> CancelResult:
        return await facade.cancel(RunId(run_id), request)

    return router
