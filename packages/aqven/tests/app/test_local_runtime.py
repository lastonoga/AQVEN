import asyncio
import os
import socket
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import httpx2
import pytest
from local_stubs import (
    ENGINE_LOG,
    EchoApplicationFactory,
    RecordingAnnouncer,
    RecordingBrowser,
    RecordingEngineHost,
    make_project,
)

from aqven.app.access import access_cookie_name
from aqven.app.engine_host import EngineLaunch
from aqven.app.health import HEALTH_PATH, HealthReport
from aqven.app.host_os import OWNER_PERMISSIONS, permission_bits
from aqven.app.instance import bind_loopback, bound_port
from aqven.app.locations import ProjectState
from aqven.app.options import ServerOptions
from aqven.app.runtime import DOCS_URL, LocalServer, Reused, ServeOutcome, Started, startup_message
from aqven.app.runtime_file import ServerRecord, read_server_record
from aqven.ports.engine import EngineFacade

WAIT_SECONDS: Final = 10.0
POLL_SECONDS: Final = 0.02


def free_port() -> int:
    listener = bind_loopback("127.0.0.1", 0)
    port = bound_port(listener)
    listener.close()
    return port


@dataclass(slots=True)
class RunningServer:
    server: LocalServer
    task: asyncio.Task[ServeOutcome]
    state: ProjectState
    record: ServerRecord
    browser: RecordingBrowser
    engine: RecordingEngineHost
    application: EchoApplicationFactory


async def wait_ready(server: LocalServer, task: asyncio.Task[ServeOutcome]) -> None:
    async with asyncio.timeout(WAIT_SECONDS):
        while not server.readiness.ready and not task.done():
            await asyncio.sleep(POLL_SECONDS)
    if task.done():
        task.result()


@asynccontextmanager
async def running(
    root: Path, data_dir: Path, *, headless: bool = False, require_auth: bool = True
) -> AsyncGenerator[RunningServer]:
    browser = RecordingBrowser()
    engine = RecordingEngineHost()
    application = EchoApplicationFactory()
    server = LocalServer(application=application, engine=engine, browser=browser, announcer=RecordingAnnouncer())
    options = ServerOptions(
        root=root, port=free_port(), data_dir=data_dir, headless=headless, require_auth=require_auth
    )
    task = asyncio.create_task(server.serve(options))
    await wait_ready(server, task)
    state = ProjectState(root)
    record = read_server_record(state)
    assert record is not None
    try:
        yield RunningServer(server, task, state, record, browser, engine, application)
    finally:
        server.request_stop()
        async with asyncio.timeout(WAIT_SECONDS):
            await task


def http_client(record: ServerRecord) -> httpx2.AsyncClient:
    return httpx2.AsyncClient(base_url=record.url, trust_env=False, timeout=5.0)


MINIMAL_PROJECT: Final = """apiVersion: "aqven/v1"
kind: "Project"
description: "minimal test project"
package: "demo"
"""

PROVIDER_BLOCK: Final = """providers:
- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
"""


def loadable_project(folder: Path, extra: str = "") -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "aqven.yaml").write_text(MINIMAL_PROJECT + extra, encoding="utf-8")
    return folder.resolve()


def test_startup_message_shows_the_server_mcp_and_docs_urls(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from aqven.console import style

    monkeypatch.setattr(style.sys.stderr, "isatty", lambda: False)
    root = loadable_project(tmp_path / "project")

    message = startup_message("studio", "http://127.0.0.1:5180/", "http://127.0.0.1:5180/mcp/", root, 12)

    assert "http://127.0.0.1:5180/" in message
    assert "http://127.0.0.1:5180/mcp/" in message
    assert DOCS_URL in message
    assert "provider" not in message
    assert "ready in 12ms" in message


def test_startup_message_shows_provider_key_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from aqven.console import style

    monkeypatch.setattr(style.sys.stderr, "isatty", lambda: False)
    root = loadable_project(tmp_path / "project", PROVIDER_BLOCK)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    missing = startup_message("studio", "http://127.0.0.1:5180/", "http://127.0.0.1:5180/mcp/", root, 5)
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-123")
    present = startup_message("studio", "http://127.0.0.1:5180/", "http://127.0.0.1:5180/mcp/", root, 5)

    assert "openrouter" in missing and "key missing" in missing
    assert "openrouter" in present and "key set" in present


@pytest.mark.asyncio
async def test_default_local_server_allows_anonymous_requests_and_keeps_host_origin_checks(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    async with running(root, tmp_path / "data", require_auth=False) as live:
        async with http_client(live.record) as http:
            api_response = await http.get("/api/echo")
            health_response = await http.get(HEALTH_PATH)
            mcp_response = await http.post("/mcp/")
            foreign_host = await http.get("/api/echo", headers={"Host": "rebind.example"})
            foreign_origin = await http.post("/api/echo", headers={"Origin": "https://attacker.example"})
        assert (api_response.status_code, health_response.status_code, mcp_response.status_code) == (200, 200, 200)
        assert (foreign_host.status_code, foreign_origin.status_code) == (400, 403)
        assert live.browser.opened == [f"{live.record.url}/"]
        assert live.application.launches[0].access.require_token is False


@pytest.mark.asyncio
async def test_server_starts_serves_guarded_app_and_cleans_up(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    async with running(root, tmp_path / "data") as live:
        record = live.record
        async with http_client(record) as http:
            anonymous = await http.get("/api/echo")
            health = await http.get(HEALTH_PATH, headers=record.authorization())
            ready = await http.get("/api/ready")
            page = await http.get("/", params={"access_token": record.token})
            with_cookie = await http.get(
                "/api/echo", headers={"Cookie": f"{access_cookie_name(record.port)}={record.token}"}
            )
            mcp = await http.post("/mcp/", headers=record.authorization())
            foreign = await http.get("/api/echo", headers={**record.authorization(), "Host": "rebind.example"})
        assert anonymous.status_code == 401
        assert health.status_code == 200
        assert HealthReport.model_validate_json(health.content).pid == os.getpid()
        assert ready.status_code == 200
        assert page.status_code == 303
        assert page.headers["set-cookie"].startswith(access_cookie_name(record.port))
        assert with_cookie.json() == {"root": str(root), "headless": False}
        assert mcp.status_code == 200
        assert foreign.status_code == 400
        assert live.browser.opened == [record.browser_url()]
        assert live.engine.events == ["start"]
        assert (tmp_path / "data" / "studio.sqlite").is_file()
        assert (root / ".aqven" / "aqven.sqlite").is_file()
        assert ".aqven/server.json" in (root / ".gitignore").read_text(encoding="utf-8")
        if OWNER_PERMISSIONS:
            assert permission_bits(live.state.server_record) == 0o600
            assert permission_bits(tmp_path / "data" / "studio.sqlite") == 0o600
    outcome = live.task.result()
    assert isinstance(outcome, Started)
    assert outcome.record == record
    assert read_server_record(live.state) is None
    assert live.engine.events == ["start", "stop"]
    assert (root / ENGINE_LOG).read_text(encoding="utf-8") == "start\nstop\n"
    assert live.server.readiness.phase == "stopping"


@pytest.mark.asyncio
async def test_application_launch_carries_runtime_wiring(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    async with running(root, tmp_path / "data", headless=True) as live:
        launch = live.application.launches[0]
        engine_launch: EngineLaunch = live.engine.launches[0]
        assert launch.project_root == root
        assert launch.data_dir == (tmp_path / "data").resolve()
        assert launch.headless is True
        assert launch.access.token == live.record.token
        assert launch.record == live.record
        assert engine_launch.settings is launch.settings
        assert live.browser.opened == []


@pytest.mark.asyncio
async def test_second_start_for_same_project_reuses_live_server(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    async with running(root, tmp_path / "data") as live:
        browser = RecordingBrowser()
        engine = RecordingEngineHost()
        second = LocalServer(
            application=EchoApplicationFactory(),
            engine=engine,
            browser=browser,
            announcer=RecordingAnnouncer(),
        )
        outcome = await second.serve(ServerOptions(root=root / ".", port=free_port(), data_dir=tmp_path / "data"))
        assert isinstance(outcome, Reused)
        assert outcome.record == live.record
        assert engine.events == []
        assert browser.opened == [live.record.browser_url()]


@pytest.mark.asyncio
async def test_default_port_busy_picks_next_port(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    occupied = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    occupied.bind(("127.0.0.1", 0))
    occupied.listen()
    busy = bound_port(occupied)
    server = LocalServer(
        application=EchoApplicationFactory(),
        engine=RecordingEngineHost(),
        browser=RecordingBrowser(),
        announcer=RecordingAnnouncer(),
    )
    task = asyncio.create_task(server.serve(ServerOptions(root=root, port=busy, data_dir=tmp_path / "data")))
    try:
        await wait_ready(server, task)
        record = read_server_record(ProjectState(root))
        assert record is not None
        assert record.port != busy
    finally:
        occupied.close()
        server.request_stop()
        async with asyncio.timeout(WAIT_SECONDS):
            await task


@dataclass(slots=True)
class StopDuringStartHost:
    server: LocalServer | None = None
    stopped: bool = False

    async def start(self, launch: EngineLaunch) -> EngineFacade:
        assert self.server is not None
        self.server.request_stop()
        return await RecordingEngineHost(log_path=launch.project_root / ENGINE_LOG).start(launch)

    async def stop(self) -> None:
        self.stopped = True


@pytest.mark.asyncio
async def test_stop_requested_during_engine_start_skips_serving(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    host = StopDuringStartHost()
    application = EchoApplicationFactory()
    server = LocalServer(
        application=application,
        engine=host,
        browser=RecordingBrowser(),
        announcer=RecordingAnnouncer(),
    )
    host.server = server
    outcome = await server.serve(ServerOptions(root=root, port=free_port(), data_dir=tmp_path / "data"))
    assert isinstance(outcome, Started)
    assert host.stopped is True
    assert application.launches == []
    assert read_server_record(ProjectState(root)) is None
