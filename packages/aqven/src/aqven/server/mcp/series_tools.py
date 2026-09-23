from dataclasses import dataclass
from typing import Final

from aqven.series.ports import SeriesJobs
from aqven.series.views import (
    SeriesCancelRequest,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.write.model import WriteActor

MCP_ACTOR: Final = WriteActor(kind="agent", id="mcp")
SERIES_START_DESCRIPTION: Final = (
    "Starts a series of an experiment, or a look over named cases of a flow dataset, on dev or holdout cases, and "
    "returns at once with the estimate and the status: running, or awaiting_approval when the estimate is above the "
    "project spend cap and a human approves it in Studio. Every attempt calls the models live. Then call series_get "
    "with wait_seconds."
)
SERIES_GET_DESCRIPTION: Final = (
    "Status, spend, per-variant metrics with 95% CI and the verdict of a series. wait_seconds holds the answer until "
    "the series is done, cancelled, failed, awaiting approval or waiting for a human, or the time runs out. "
    "A series is failed when every attempt hit an infrastructure error, such as a missing provider key, and error "
    "names the first one; it stays done when at least one attempt was counted. "
    "include_cases adds per-case rows for dev cases only. Quote the verdict text as it is."
)
SERIES_CANCEL_DESCRIPTION: Final = (
    "Stops a series: queued attempts never start, model calls already running finish and are paid; no finding is "
    "written."
)


@dataclass(frozen=True, slots=True)
class SeriesTools:
    jobs: SeriesJobs

    async def start(self, request: SeriesStartRequest) -> SeriesStarted:
        return await self.jobs.start(request, MCP_ACTOR)

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult:
        return await self.jobs.get(request)

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView:
        return await self.jobs.cancel(request)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="series_start",
                description=SERIES_START_DESCRIPTION,
                input_model=SeriesStartRequest,
                output_model=SeriesStarted,
                surface="rest_and_mcp",
                hints=ToolHints(title="Start series", read_only=False, open_world=True),
                use_case=self.start,
            ),
            Operation(
                name="series_get",
                description=SERIES_GET_DESCRIPTION,
                input_model=SeriesGetRequest,
                output_model=SeriesGetResult,
                surface="rest_and_mcp",
                hints=ToolHints(title="Series", read_only=True, open_world=True),
                use_case=self.get,
            ),
            Operation(
                name="series_cancel",
                description=SERIES_CANCEL_DESCRIPTION,
                input_model=SeriesCancelRequest,
                output_model=SeriesSummaryView,
                surface="rest_and_mcp",
                hints=ToolHints(title="Cancel series", read_only=False, destructive=True, open_world=True),
                use_case=self.cancel,
            ),
        )
