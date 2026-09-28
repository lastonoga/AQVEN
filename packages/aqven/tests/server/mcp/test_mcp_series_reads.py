from pathlib import Path
from typing import Final

import pytest
from mcp_support import call, mcp_client, shop_copy, structured
from series_fakes import DONE_ID, SERIES_ID, STATS, FakeSeriesJobs
from server_fakes import FakeEngine

from aqven.series.read_views import SeriesOutputsPage, SeriesReading, SeriesRowsPage
from aqven.server.mcp.series_read_tools import SERIES_LIST_DESCRIPTION, SERIES_OUTPUTS_DESCRIPTION
from aqven.server.mcp.series_tools import SERIES_GET_DESCRIPTION
from aqven.server.views.run_list import RunListPage, RunRow

COMPACT_KEYS: Final = frozenset(RunRow.model_fields)


@pytest.mark.asyncio
async def test_read_tools_are_listed_read_only_with_output_schemas(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), series=FakeSeriesJobs()) as client:
        listed = await client.list_tools()
    tools = {tool.name: tool for tool in listed.tools}

    assert tools["series_outputs"].description == SERIES_OUTPUTS_DESCRIPTION
    assert tools["series_list"].description == SERIES_LIST_DESCRIPTION
    for name in ("series_outputs", "series_list"):
        annotations = tools[name].annotations
        assert annotations is not None and annotations.read_only_hint is True
        assert tools[name].output_schema is not None
    assert {"fields", "outcome", "page_size", "cursor"} <= set(tools["series_outputs"].input_schema["properties"])
    assert {"view", "fields", "case_limit", "cursor"} <= set(tools["series_get"].input_schema["properties"])
    assert "view summary" in SERIES_GET_DESCRIPTION


@pytest.mark.asyncio
async def test_series_get_summary_view_passes_the_output_schema(tmp_path: Path) -> None:
    jobs = FakeSeriesJobs()
    async with mcp_client(shop_copy(tmp_path), series=jobs) as client:
        summary = await call(client, "series_get", {"series_id": DONE_ID, "view": "summary"})
        full = await call(client, "series_get", {"series_id": DONE_ID, "fields": ["success_rate"]})

    assert summary.is_error is False and full.is_error is False
    brief = SeriesReading.model_validate(structured(summary)).series
    summary_series = structured(summary)["series"]
    full_series = structured(full)["series"]
    assert isinstance(summary_series, dict) and "variant_briefs" in summary_series
    assert isinstance(full_series, dict) and "matrix" in full_series
    assert brief.series_id == DONE_ID
    assert [(request.view, request.fields) for request in jobs.gets] == [("summary", None), ("full", ("success_rate",))]


@pytest.mark.asyncio
async def test_series_outputs_passes_filters_and_pages(tmp_path: Path) -> None:
    jobs = FakeSeriesJobs()
    arguments: dict[str, object] = {
        "series_id": SERIES_ID,
        "variant": "alt",
        "outcome": "failed",
        "fields": ["/label", "triage"],
        "page_size": 200,
    }
    async with mcp_client(shop_copy(tmp_path), series=jobs) as client:
        result = await call(client, "series_outputs", arguments)
        too_big = await call(client, "series_outputs", {"series_id": SERIES_ID, "page_size": 201})
        missing = await call(client, "series_outputs", {"series_id": "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2f"})

    page = SeriesOutputsPage.model_validate(structured(result))
    request, unknown = jobs.output_reads
    assert [row.variant for row in page.rows] == ["alt"]
    assert (request.variant, request.outcome, request.fields, request.page_size) == (
        "alt",
        "failed",
        ("/label", "triage"),
        200,
    )
    assert too_big.is_error is True
    assert missing.is_error is True and structured(missing)["code"] == "NOT_FOUND"
    assert unknown.series_id != SERIES_ID


@pytest.mark.asyncio
async def test_series_list_answers_compact_rows_with_stats(tmp_path: Path) -> None:
    jobs = FakeSeriesJobs()
    async with mcp_client(shop_copy(tmp_path), series=jobs) as client:
        result = await call(client, "series_list", {"status": "done", "limit": 5})

    page = SeriesRowsPage.model_validate(structured(result))
    assert [row.series_id for row in page.items] == [DONE_ID]
    assert page.stats == STATS
    assert jobs.row_queries[0].limit == 5


@pytest.mark.asyncio
async def test_run_list_compact_view_drops_the_heavy_fields(tmp_path: Path) -> None:
    engine = FakeEngine()
    async with mcp_client(shop_copy(tmp_path), engine=engine) as client:
        compact = await call(client, "run_list", {"view": "compact", "series_id": "series-1"})
        full = await call(client, "run_list", {"flow_id": "intake"})

    compact_page = structured(compact)
    items = compact_page["items"]
    assert isinstance(items, list) and items
    assert all(isinstance(item, dict) and set(item) == COMPACT_KEYS for item in items)
    assert compact_page["hidden_experiment_runs"] is None
    assert engine.list_queries[0].series_id == "series-1"
    listed = RunListPage[RunRow].model_validate(compact_page)
    assert len(str(compact.structured_content)) < len(str(full.structured_content))
    assert listed.items[0].run_id
    assert structured(full)["hidden_experiment_runs"] == len(engine.runs)
