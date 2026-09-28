from typing import Annotated, Final

from fastapi import APIRouter, Query

from aqven.ports.engine import RunListQuery
from aqven.series.model import SeriesId
from aqven.series.read_views import (
    SeriesBriefResult,
    SeriesOutputsPage,
    SeriesOutputsQuery,
    SeriesRowsPage,
    SeriesRowsQuery,
)
from aqven.series.views import SeriesGetRequest, SeriesReadQuery
from aqven.server.context import ServerContext, operation, rest_only_parameters
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.views.research import series_jobs
from aqven.server.views.run_list import RunListPage, RunListService, RunRow

OUTPUTS_OPERATION: Final = {
    **operation("series_outputs"),
    **rest_only_parameters({"include_holdout": "the owner's review of held-out outputs, never for tuning"}),
}


def build_reads_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)
    listing = RunListService(context.facade)

    @router.get("/run-rows", operation_id="run_rows", openapi_extra=operation("run_list"))
    async def list_run_rows(query: Annotated[RunListQuery, Query()]) -> RunListPage[RunRow]:
        return await listing.rows(query)

    @router.get("/series-rows", operation_id="series_rows", openapi_extra=operation("series_list"))
    async def list_series_rows(query: Annotated[SeriesRowsQuery, Query()]) -> SeriesRowsPage:
        return await series_jobs(context.series).rows(query)

    @router.get("/series/{series_id}/summary", operation_id="series_summary", openapi_extra=operation("series_get"))
    async def get_series_summary(series_id: str, query: Annotated[SeriesReadQuery, Query()]) -> SeriesBriefResult:
        request = SeriesGetRequest(series_id=SeriesId(series_id), view="summary", **query.model_dump())
        return await series_jobs(context.series).brief(request)

    @router.get("/series/{series_id}/outputs", operation_id="series_outputs", openapi_extra=OUTPUTS_OPERATION)
    async def list_series_outputs(series_id: str, query: Annotated[SeriesOutputsQuery, Query()]) -> SeriesOutputsPage:
        request = query.request(SeriesId(series_id))
        return await series_jobs(context.series).outputs(request, include_holdout=query.include_holdout)

    return router
