import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from series_fakes import DONE_ID, SERIES_ID, FakeSeriesJobs
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings

from aqven.runtime.runs import RunStartRequest
from aqven.series import SeriesCancelRequest, SeriesStartRequest
from aqven.server import ServerOptions, create_app
from aqven.server.errors import ApiFailure
from aqven.server.mcp.catalog import tool_error
from aqven.server.mcp.run_tools import RunTools
from aqven.server.mcp.series_tools import SeriesTools
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace

BODY = {"flow_id": "intake", "mode": "live", "input": {"text": "parity"}}


def starting_service(
    project: Path, engine: FakeEngine, settings: MemorySettings, options: ServerOptions
) -> RunStartService:
    return RunStartService(
        facade=engine,
        settings=settings,
        workspace=ProjectWorkspace(project, compiler=options.compiler),
        environ=options.environ,
    )


def test_run_start_over_mcp_resolves_and_warns_exactly_like_the_route(
    server_client: TestClient,
    server_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> None:
    over_http = server_client.post("/api/runs", json=BODY)
    assert over_http.status_code == 201
    seen_by_route = len(server_engine.started)

    tools = RunTools(server_engine, starting_service(server_project, server_engine, server_settings, server_options))
    over_mcp = asyncio.run(tools.start(RunStartRequest.model_validate(BODY)))

    assert len(server_engine.started) == seen_by_route + 1
    assert server_engine.started[-1] == server_engine.started[-2]
    assert over_mcp.model_dump(mode="json") == over_http.json()


def test_run_start_without_the_shared_service_skips_what_the_route_does(server_engine: FakeEngine) -> None:
    over_mcp = asyncio.run(RunTools(server_engine).start(RunStartRequest.model_validate(BODY)))

    assert over_mcp.warnings == ()


def test_the_catalog_carries_the_shared_service_into_run_start(
    server_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> None:
    service = starting_service(server_project, server_engine, server_settings, server_options)

    assert RunTools(server_engine, service).starting is service
    assert RunTools(server_engine).starting is None


@pytest.fixture
def shared_jobs() -> FakeSeriesJobs:
    return FakeSeriesJobs()


@pytest.fixture
def series_client(
    server_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
    shared_jobs: FakeSeriesJobs,
) -> Iterator[TestClient]:
    app = create_app(server_project, server_engine, server_settings, options=server_options, series=shared_jobs)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def mcp_code(operation: str, error: Exception) -> str:
    return tool_error(error, operation).code


def rest_code(body: JsonValue) -> JsonValue:
    assert isinstance(body, dict)
    return body["code"]


def test_an_unknown_experiment_is_not_found_on_both_surfaces(
    series_client: TestClient, shared_jobs: FakeSeriesJobs
) -> None:
    over_http = series_client.post("/api/series", json={"experiment_id": "nothing"})
    tools = SeriesTools(shared_jobs)

    with pytest.raises(ApiFailure) as over_mcp:
        asyncio.run(tools.start(SeriesStartRequest.model_validate({"experiment_id": "nothing"})))

    assert over_http.status_code == 404
    assert rest_code(over_http.json()) == mcp_code("series_start", over_mcp.value) == "NOT_FOUND"


def test_cancelling_a_finished_series_conflicts_on_both_surfaces(
    series_client: TestClient, shared_jobs: FakeSeriesJobs
) -> None:
    over_http = series_client.post(f"/api/series/{DONE_ID}/cancel", json={"reason": "late"})
    tools = SeriesTools(shared_jobs)

    with pytest.raises(ApiFailure) as over_mcp:
        asyncio.run(tools.cancel(SeriesCancelRequest(series_id=DONE_ID, reason="late")))

    assert over_http.status_code == 409
    assert rest_code(over_http.json()) == mcp_code("series_cancel", over_mcp.value) == "SERIES_STATE_CONFLICT"


def test_series_start_answers_the_same_on_both_surfaces(series_client: TestClient, shared_jobs: FakeSeriesJobs) -> None:
    over_http = series_client.post("/api/series", json={"experiment_id": "reply_quality"})
    over_mcp = asyncio.run(
        SeriesTools(shared_jobs).start(SeriesStartRequest.model_validate({"experiment_id": "reply_quality"}))
    )

    assert over_http.status_code == 201
    assert over_mcp.model_dump(mode="json") == over_http.json()
    assert over_mcp.series_id == SERIES_ID
    assert [actor.kind for _, actor in shared_jobs.starts] == ["human", "agent"]
