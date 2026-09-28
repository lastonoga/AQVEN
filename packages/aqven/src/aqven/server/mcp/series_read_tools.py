from dataclasses import dataclass
from typing import Final

from aqven.series.ports import SeriesJobs
from aqven.series.read_views import SeriesOutputsPage, SeriesOutputsRequest, SeriesRowsPage, SeriesRowsQuery
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration

SERIES_OUTPUTS_DESCRIPTION: Final = (
    "Bulk read of what a series produced, one row per attempt in attempt order: case, variant, repeat, split, "
    "outcome (passed, failed, error, waiting, running), error_code, cost_usd of the attempt run, latency_ms, run_id, "
    "the flow output, node_outputs and checks {check_id: value}. The rows come from the engine's own run records, "
    "the same ones run_get reads. Filter by split, variant, case and outcome. Without fields each row carries the "
    "whole flow output and no node outputs; fields narrows it: a JSON pointer such as /label or /candidates/0/name "
    "puts {pointer: value} in output, a node id such as triage puts that node's whole output in node_outputs, and "
    "triage/summary a pointer into it; a missing path is null. page_size up to 200; pass next_cursor as cursor. "
    "Use it, or aqven series export, for offline analysis of outputs already paid for, never one run_get per run."
)
SERIES_LIST_DESCRIPTION: Final = (
    "Compact page of series, newest first, filtered by experiment_id and status: series_id, experiment_id, "
    "flow_id, status, verdict state, on, progress, spend_usd, started_at, finished_at and eta. stats totals every "
    "series of the experiment, or of the project without experiment_id: series, finished attempts, requests "
    "(attempt runs plus judge check runs), tokens of the attempt runs, spend_usd with checks, and wall_seconds in "
    "which at least one series was open. Cursor: next_cursor."
)


@dataclass(frozen=True, slots=True)
class SeriesReadTools:
    jobs: SeriesJobs

    async def outputs(self, request: SeriesOutputsRequest) -> SeriesOutputsPage:
        return await self.jobs.outputs(request)

    async def rows(self, query: SeriesRowsQuery) -> SeriesRowsPage:
        return await self.jobs.rows(query)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="series_outputs",
                description=SERIES_OUTPUTS_DESCRIPTION,
                input_model=SeriesOutputsRequest,
                output_model=SeriesOutputsPage,
                surface="rest_and_mcp",
                hints=ToolHints(title="Series outputs", read_only=True, idempotent=True),
                use_case=self.outputs,
            ),
            Operation(
                name="series_list",
                description=SERIES_LIST_DESCRIPTION,
                input_model=SeriesRowsQuery,
                output_model=SeriesRowsPage,
                surface="rest_and_mcp",
                hints=ToolHints(title="Series list", read_only=True, idempotent=True),
                use_case=self.rows,
            ),
        )
