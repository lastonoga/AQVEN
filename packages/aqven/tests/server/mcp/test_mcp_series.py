from datetime import timedelta
from pathlib import Path

import pytest
from mcp_support import call, mcp_client, shop_copy, structured
from series_fakes import DONE_ID, KNOWN_EXPERIMENT, MOMENT, SERIES_ID, FakeSeriesJobs

from aqven.series.views import SeriesEta, SeriesGetResult
from aqven.server.mcp.endpoint import INSTRUCTIONS
from aqven.server.mcp.series_tools import (
    SERIES_CANCEL_DESCRIPTION,
    SERIES_GET_DESCRIPTION,
    SERIES_START_DESCRIPTION,
)


@pytest.mark.asyncio
async def test_series_tools_carry_the_contract_descriptions_and_hints(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), series=FakeSeriesJobs()) as client:
        listed = await client.list_tools()
    tools = {tool.name: tool for tool in listed.tools}

    assert tools["series_start"].description == SERIES_START_DESCRIPTION
    assert tools["series_get"].description == SERIES_GET_DESCRIPTION
    assert tools["series_cancel"].description == SERIES_CANCEL_DESCRIPTION
    cancel = tools["series_cancel"].annotations
    get = tools["series_get"].annotations
    assert cancel is not None and cancel.destructive_hint is True and cancel.open_world_hint is True
    assert get is not None and get.read_only_hint is True
    assert "wait_seconds" in tools["series_get"].input_schema["properties"]
    assert "series_start and series_get with wait_seconds" in INSTRUCTIONS


@pytest.mark.asyncio
async def test_series_start_runs_as_the_mcp_agent(tmp_path: Path) -> None:
    jobs = FakeSeriesJobs()
    async with mcp_client(shop_copy(tmp_path), series=jobs) as client:
        result = await call(client, "series_start", {"experiment_id": KNOWN_EXPERIMENT, "on": "holdout"})

    assert result.is_error is False
    assert structured(result)["series_id"] == SERIES_ID
    request, actor = jobs.starts[0]
    assert (request.on, actor.kind, actor.id) == ("holdout", "agent", "mcp")


@pytest.mark.asyncio
async def test_series_get_passes_wait_seconds_and_case_rows(tmp_path: Path) -> None:
    jobs = FakeSeriesJobs()
    async with mcp_client(shop_copy(tmp_path), series=jobs) as client:
        result = await call(client, "series_get", {"series_id": SERIES_ID, "wait_seconds": 30, "include_cases": True})
        too_long = await call(client, "series_get", {"series_id": SERIES_ID, "wait_seconds": 99})

    assert structured(result)["cases"] == []
    assert (jobs.gets[0].wait_seconds, jobs.gets[0].include_cases) == (30, True)
    assert too_long.is_error is True
    assert "wait_seconds" in str(too_long.content)
    assert len(jobs.gets) == 1


@pytest.mark.asyncio
async def test_series_get_returns_the_estimate_to_finish_with_the_view(tmp_path: Path) -> None:
    jobs = FakeSeriesJobs()
    eta = SeriesEta(
        state="running",
        attempts_per_minute=4.0,
        remaining_seconds=180,
        finish_at=MOMENT + timedelta(minutes=3),
        window_seconds=120,
    )
    jobs.views[SERIES_ID] = jobs.views[SERIES_ID].model_copy(update={"eta": eta})
    async with mcp_client(shop_copy(tmp_path), series=jobs) as client:
        listed = await client.list_tools()
        running = await call(client, "series_get", {"series_id": SERIES_ID})
        done = await call(client, "series_get", {"series_id": DONE_ID})
    tools = {tool.name: tool for tool in listed.tools}

    assert SeriesGetResult.model_validate(structured(running)).series.eta == eta
    assert SeriesGetResult.model_validate(structured(done)).series.eta is None
    assert "eta estimates when an active series finishes" in SERIES_GET_DESCRIPTION
    assert tools["series_get"].output_schema is not None
    assert "SeriesEta" in tools["series_get"].output_schema["$defs"]


@pytest.mark.asyncio
async def test_series_errors_keep_their_codes(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), series=FakeSeriesJobs()) as client:
        unknown = await call(client, "series_start", {"experiment_id": "nothing"})
        both = await call(
            client,
            "series_start",
            {"experiment_id": KNOWN_EXPERIMENT, "look": {"flow_id": "f", "dataset_id": "d", "case_names": ["a"]}},
        )
        finished = await call(client, "series_cancel", {"series_id": DONE_ID, "reason": "late"})

    assert structured(unknown)["code"] == "NOT_FOUND"
    assert structured(both)["code"] == "REQUEST_INVALID"
    assert structured(finished)["code"] == "SERIES_STATE_CONFLICT"
    assert all(result.is_error for result in (unknown, both, finished))
