import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.evals import EvalRunId
from aqven.runtime.runs import RunStartRequest
from aqven.server import ServerOptions, create_app
from aqven.server.errors import ApiFailure
from aqven.server.mcp.eval_tools import EvalRunLookup, EvalTools
from aqven.server.mcp.run_tools import RunTools
from aqven.server.views.dataset_batches import DatasetBatchStartRequest
from aqven.server.views.runs import RunStartService
from aqven.server.views.services import StudioServices
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
def eval_project(tmp_path: Path) -> Path:
    return copy_fixture("evals/eval_shop", tmp_path)


@pytest.fixture
def shared_services() -> StudioServices:
    return StudioServices()


@pytest.fixture
def shared_client(
    eval_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
    shared_services: StudioServices,
) -> Iterator[TestClient]:
    app = create_app(eval_project, server_engine, server_settings, options=server_options, services=shared_services)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_a_batch_started_over_mcp_is_the_batch_the_route_polls(
    shared_client: TestClient, shared_services: StudioServices
) -> None:
    created = shared_client.post(
        "/api/datasets",
        json={
            "dataset_id": "shared_cases",
            "flow_id": "intake",
            "cases": [{"name": "first", "inputs": {"text": "first input"}}],
        },
    )
    assert created.status_code == 200
    tools = EvalTools(shared_services)

    started = asyncio.run(
        tools.start_batch(
            DatasetBatchStartRequest.model_validate(
                {"flow_id": "intake", "dataset_id": "shared_cases", "case_names": ["first"], "mode": "dryrun"}
            )
        )
    )

    over_http = shared_client.get(f"/api/dataset-batches/{started.batch_id}")
    assert over_http.status_code == 200
    assert over_http.json()["batch_id"] == started.batch_id
    assert over_http.json()["cases_total"] == 1


def test_an_unknown_eval_run_fails_the_same_way_on_both_surfaces(
    shared_client: TestClient, shared_services: StudioServices
) -> None:
    missing = EvalRunId("01a0aa21-0000-0000-0000-000000000000")
    over_http = shared_client.get(f"/api/eval-runs/{missing}")
    with pytest.raises(ApiFailure) as failure:
        asyncio.run(EvalTools(shared_services).get_eval(EvalRunLookup(eval_run_id=missing)))

    assert over_http.status_code == 404
    assert failure.value.code == "NOT_FOUND"
    assert failure.value.message == over_http.json()["message"]


def test_the_services_holder_is_the_one_the_routes_filled(
    shared_client: TestClient, shared_services: StudioServices
) -> None:
    assert shared_services.eval_jobs().context.workspace.root == shared_services.batch_jobs().context.workspace.root
