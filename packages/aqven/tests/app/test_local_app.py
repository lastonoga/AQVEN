import asyncio
import shutil
from collections.abc import AsyncGenerator, Iterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import Final, cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from local_stubs import RecordingEngineHost
from mcp.server import MCPServer
from starlette.types import ASGIApp, Receive, Scope, Send

from aqven.app import (
    AQVEN_HOST,
    AQVEN_PORT,
    AQVEN_STUDIO,
    InvalidRuntimeSetting,
    LocalAppOptions,
    LocalTokenAccess,
    create_local_app,
    create_mcp_server,
    local_app_lifespan,
    runtime_settings,
)
from aqven.app.local_app import DeferredEngine
from aqven.ports.engine import EngineError, EngineFacade
from aqven.runtime.address import RunId, node_address
from aqven.runtime.presentation import PresentationRequest, PresentationResponse, PresentationResult, PresentationTarget
from aqven.server.app import server_context

FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures"
TOKEN: Final = "local-app-token-0123456789"
BASE: Final = "http://127.0.0.1:5180"
AUTH: Final = {"Authorization": f"Bearer {TOKEN}"}
MCP_INITIALIZE: Final = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
}
MCP_HEADERS: Final = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
JSON_TYPE: Final = "application/json"


@pytest.fixture
def project(tmp_path: Path) -> Path:
    target = tmp_path / "standard_shop"
    shutil.copytree(FIXTURES / "standard_shop", target, ignore=shutil.ignore_patterns("__pycache__"))
    return target.resolve()


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


def local_app(root: Path, options: LocalAppOptions, environ: dict[str, str] | None = None) -> FastAPI:
    return create_local_app(root, options, {} if environ is None else environ)


def offline_options(
    data_dir: Path,
    *,
    api: bool = True,
    port: int | None = None,
    access: LocalTokenAccess | None = None,
) -> LocalAppOptions:
    return LocalAppOptions(
        api=api,
        port=port,
        watch=False,
        access=LocalTokenAccess(token=TOKEN) if access is None else access,
        data_dir=data_dir,
        engine=RecordingEngineHost(),
    )


@pytest.fixture
def studio_client(project: Path, data_dir: Path) -> Iterator[TestClient]:
    with TestClient(local_app(project, offline_options(data_dir)), base_url=BASE) as client:
        yield client


def test_local_app_serves_api_behind_the_token_guard(studio_client: TestClient) -> None:
    anonymous = studio_client.get("/api/project")
    allowed = studio_client.get("/api/project", headers=AUTH)
    contract = studio_client.get("/api/openapi.json", headers=AUTH)

    assert anonymous.status_code == 401
    assert allowed.status_code == 200
    assert contract.json()["paths"]["/api/runs"]["post"]["operationId"] == "run_start"


def test_local_app_mounts_mcp_with_the_same_token(studio_client: TestClient) -> None:
    anonymous = studio_client.post("/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)
    allowed = studio_client.post("/mcp/", json=MCP_INITIALIZE, headers={**MCP_HEADERS, **AUTH})

    assert anonymous.status_code == 401
    assert allowed.status_code == 200


def test_studio_on_serves_the_studio_page(studio_client: TestClient) -> None:
    page = studio_client.get("/")

    assert page.headers["content-type"].startswith("text/")


def test_studio_off_keeps_api_and_mcp_without_the_studio_page(project: Path, data_dir: Path) -> None:
    app = local_app(project, offline_options(data_dir), {AQVEN_STUDIO: "false"})

    with TestClient(app, base_url=BASE, headers=AUTH) as client:
        project_view = client.get("/api/project")
        mcp = client.post("/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)
        page = client.get("/")

    assert (project_view.status_code, mcp.status_code) == (200, 200)
    assert page.status_code == 404
    assert page.headers["content-type"].startswith(JSON_TYPE)


def test_api_off_leaves_the_mcp_mount(project: Path, data_dir: Path) -> None:
    app = local_app(project, offline_options(data_dir, api=False))

    with TestClient(app, base_url=BASE, headers=AUTH) as client:
        project_view = client.get("/api/project")
        mcp = client.post("/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)

    assert project_view.status_code == 404
    assert mcp.status_code == 200


def test_access_none_opens_api_and_mcp_for_a_host_with_its_own_auth(project: Path, data_dir: Path) -> None:
    options = LocalAppOptions(watch=False, access=None, data_dir=data_dir, engine=RecordingEngineHost())
    app = local_app(project, options)

    with TestClient(app, base_url=BASE) as client:
        project_view = client.get("/api/project")
        mcp = client.post("/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)

    assert (project_view.status_code, mcp.status_code) == (200, 200)


class PassThroughGuard:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.app(scope, receive, send)


@dataclass(slots=True)
class HostAccess:
    token: str | None = None
    guarded: list[ASGIApp] = field(default_factory=list[ASGIApp])

    def guard(self, app: ASGIApp) -> ASGIApp:
        self.guarded.append(app)
        return PassThroughGuard(app)


def test_custom_access_replaces_the_local_token_guard(project: Path, data_dir: Path) -> None:
    access = HostAccess()
    options = LocalAppOptions(watch=False, access=access, data_dir=data_dir, engine=RecordingEngineHost())
    app = local_app(project, options)

    with TestClient(app, base_url=BASE) as client:
        project_view = client.get("/api/project")

    assert project_view.status_code == 200
    assert len(access.guarded) == 1


def mounted_host(aqven_app: FastAPI, prefix: str) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        async with local_app_lifespan(aqven_app):
            yield

    host = FastAPI(lifespan=lifespan)
    host.mount(prefix, aqven_app)
    return host


def test_host_application_can_mount_the_app_under_a_prefix(project: Path, data_dir: Path) -> None:
    aqven_app = local_app(project, offline_options(data_dir))
    host = mounted_host(aqven_app, "/aqven")

    with TestClient(host, base_url=BASE, headers=AUTH) as client:
        project_view = client.get("/aqven/api/project")
        mcp = client.post("/aqven/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)
        asyncio.run(server_context(aqven_app).hub.close())
        stream = client.get("/aqven/api/events/spec", headers={"Last-Event-ID": "5"})

    assert project_view.status_code == 200
    assert mcp.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    assert "event: resync" in stream.text


def test_environment_settings_fill_host_port_and_studio() -> None:
    settings = runtime_settings({AQVEN_HOST: "0.0.0.0", AQVEN_PORT: "7777", AQVEN_STUDIO: "no"})

    assert (settings.host, settings.port, settings.studio) == ("0.0.0.0", 7777, False)


def test_explicit_options_win_over_the_environment(project: Path, data_dir: Path) -> None:
    app = local_app(project, offline_options(data_dir, port=6001), {AQVEN_PORT: "7777"})

    assert server_context(app).mcp_url == "http://127.0.0.1:6001/mcp/"


def test_environment_port_is_used_when_the_caller_passes_none(project: Path, data_dir: Path) -> None:
    app = local_app(project, offline_options(data_dir), {AQVEN_PORT: "7777"})

    assert server_context(app).mcp_url == "http://127.0.0.1:7777/mcp/"


def test_invalid_environment_value_names_the_variable() -> None:
    with pytest.raises(InvalidRuntimeSetting) as failure:
        runtime_settings({AQVEN_PORT: "many"})

    assert failure.value.variable == AQVEN_PORT
    assert "AQVEN_PORT='many'" in str(failure.value)


def test_mcp_server_factory_returns_the_mcp_server_object(project: Path) -> None:
    assert isinstance(create_mcp_server(project), MCPServer)


@pytest.mark.asyncio
async def test_mcp_server_factory_lists_the_project_tools(project: Path) -> None:
    tools = {tool.name for tool in await create_mcp_server(project).list_tools()}

    assert {"aqven_check", "flow_list", "flow_patch"} <= tools


@pytest.mark.asyncio
async def test_deferred_engine_reports_a_clear_error_before_startup() -> None:
    engine = DeferredEngine()

    with pytest.raises(EngineError) as failure:
        await engine.get_run(RunId("01a0aa21-b9a7-74fb-b1f3-f735bf7d04bd"))

    assert failure.value.code == "INTERNAL"
    assert "not started" in failure.value.message


def test_deferred_engine_delegates_presentation_batch() -> None:
    engine = DeferredEngine()
    address = node_address("reply")
    target = PresentationTarget(address=address, side="output")
    request = PresentationRequest(locale="en", targets=(target,))

    async def present(run_id: RunId, selected: PresentationRequest) -> PresentationResponse:
        assert run_id == RunId("run-1")
        assert selected is request
        return PresentationResponse(results=(PresentationResult(target=target, status="unavailable"),))

    engine.bind(cast(EngineFacade, SimpleNamespace(present_run=present)))
    response = asyncio.run(engine.present_run(RunId("run-1"), request))
    assert response.results[0].status == "unavailable"
