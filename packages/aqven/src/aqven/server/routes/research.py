from collections.abc import AsyncIterable, Awaitable, Callable
from typing import Annotated, Final

from fastapi import APIRouter, Depends, Query
from fastapi.sse import EventSourceResponse, ServerSentEvent

from aqven.runtime.runs import Page
from aqven.series.model import LaunchPlan, SeriesId
from aqven.series.protocol import MAX_WAIT_SECONDS
from aqven.series.views import (
    ExperimentDetailView,
    ExperimentListQuery,
    ExperimentSummaryView,
    LaunchRequest,
    SeriesCancelRequest,
    SeriesCaseRow,
    SeriesCasesQuery,
    SeriesEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesListQuery,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.server.context import ServerContext, operation, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.resources import ArmFlowView
from aqven.server.routes.runs import event_cursor
from aqven.server.views.research import (
    ExperimentCatalog,
    SeriesApproveBody,
    SeriesCancelBody,
    arm_flow,
    series_jobs,
)
from aqven.spec import ExperimentId

EXPERIMENT_CATALOGUE: Final = "experiment catalogue read from the project files"
ARM_FLOW: Final = "arm nodes and schemas for the Studio run view, read from the project files"
LAUNCH_PLAN_ON_MCP: Final = "the launch plan comes back from series_start on MCP"
SERIES_HISTORY: Final = "series history for Studio"
CASE_ROWS: Final = "per-case rows for Studio, holdout included"
SSE_TRANSPORT: Final = "sse transport"
HUMAN_APPROVAL: Final = "spend is approved by a human"
FINAL_EVENT: Final = "series_finished"


def series_frame(event: SeriesEvent) -> ServerSentEvent:
    return ServerSentEvent(data=event, event=event.type, id=str(event.seq))


def series_guard(context: ServerContext) -> Callable[[str], Awaitable[SeriesId]]:
    async def existing_series(series_id: str) -> SeriesId:
        known = SeriesId(series_id)
        await series_jobs(context.series).get(SeriesGetRequest(series_id=known))
        return known

    return existing_series


def build_research_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)
    catalog = ExperimentCatalog(context.series)
    existing_series = series_guard(context)

    @router.get("/experiments", operation_id="experiment_list", openapi_extra=rest_only(EXPERIMENT_CATALOGUE))
    async def list_experiments(query: Annotated[ExperimentListQuery, Query()]) -> Page[ExperimentSummaryView]:
        return await catalog.page(await context.workspace.state(), query)

    @router.get(
        "/experiments/{experiment_id}", operation_id="experiment_get", openapi_extra=rest_only(EXPERIMENT_CATALOGUE)
    )
    async def get_experiment(experiment_id: str) -> ExperimentDetailView:
        return await catalog.detail(await context.workspace.state(), experiment_id)

    @router.get(
        "/experiments/{experiment_id}/arms/{arm_id}",
        operation_id="experiment_arm",
        openapi_extra=rest_only(ARM_FLOW),
    )
    async def get_experiment_arm(experiment_id: str, arm_id: str) -> ArmFlowView:
        return arm_flow(await context.workspace.state(), experiment_id, arm_id)

    @router.post(
        "/experiments/{experiment_id}/launch-plan",
        operation_id="series_launch_plan",
        openapi_extra=rest_only(LAUNCH_PLAN_ON_MCP),
    )
    async def plan_series(experiment_id: str, request: LaunchRequest) -> LaunchPlan:
        return await series_jobs(context.series).launch_plan(ExperimentId(experiment_id), request)

    @router.post("/series", status_code=201, operation_id="series_start", openapi_extra=operation("series_start"))
    async def start_series(request: SeriesStartRequest) -> SeriesStarted:
        return await series_jobs(context.series).start(request, await context.human())

    @router.get("/series", operation_id="series_list", openapi_extra=rest_only(SERIES_HISTORY))
    async def list_series(query: Annotated[SeriesListQuery, Query()]) -> Page[SeriesSummaryView]:
        return await series_jobs(context.series).list(query)

    @router.get("/series/{series_id}", operation_id="series_get", openapi_extra=operation("series_get"))
    async def get_series(
        series_id: str,
        wait_seconds: Annotated[int, Query(ge=0, le=MAX_WAIT_SECONDS)] = 0,
        include_cases: bool = False,
    ) -> SeriesGetResult:
        request = SeriesGetRequest(
            series_id=SeriesId(series_id), wait_seconds=wait_seconds, include_cases=include_cases
        )
        return await series_jobs(context.series).get(request)

    @router.get("/series/{series_id}/cases", operation_id="series_cases", openapi_extra=rest_only(CASE_ROWS))
    async def list_series_cases(
        series_id: str, query: Annotated[SeriesCasesQuery, Query()]
    ) -> tuple[SeriesCaseRow, ...]:
        return await series_jobs(context.series).cases(SeriesId(series_id), query)

    @router.get(
        "/series/{series_id}/events",
        response_class=EventSourceResponse,
        operation_id="series_events",
        openapi_extra=rest_only(SSE_TRANSPORT),
    )
    async def series_events(
        series_id: Annotated[SeriesId, Depends(existing_series)],
        start: Annotated[int, Depends(event_cursor)],
    ) -> AsyncIterable[ServerSentEvent]:
        async for event in series_jobs(context.series).events(series_id, start):
            yield series_frame(event)
            if event.type == FINAL_EVENT:
                return

    @router.post("/series/{series_id}/approve", operation_id="series_approve", openapi_extra=rest_only(HUMAN_APPROVAL))
    async def approve_series(series_id: str, body: SeriesApproveBody | None = None) -> SeriesSummaryView:
        cap = None if body is None else body.cap_usd
        return await series_jobs(context.series).approve(SeriesId(series_id), await context.human(), cap)

    @router.post("/series/{series_id}/cancel", operation_id="series_cancel", openapi_extra=operation("series_cancel"))
    async def cancel_series(series_id: str, body: SeriesCancelBody | None = None) -> SeriesSummaryView:
        reason = None if body is None else body.reason
        return await series_jobs(context.series).cancel(
            SeriesCancelRequest(series_id=SeriesId(series_id), reason=reason)
        )

    return router
