import asyncio
from pathlib import Path

from fastapi.testclient import TestClient
from server_fakes import FakeEngine, MemorySettings

from aqven.runtime.runs import RunStartRequest
from aqven.server import ServerOptions
from aqven.server.mcp.run_tools import RunTools
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
