import asyncio
import shutil
from pathlib import Path
from typing import Final

import httpx2
import pytest
from local_stubs import RecordingAnnouncer, RecordingBrowser, RecordingEngineHost

from aqven.app.access import access_cookie_name
from aqven.app.composition import ServerApplicationFactory, StudioFeatures
from aqven.app.engine_host import DbosEngineHost, EngineLaunch
from aqven.app.health import HEALTH_PATH, READY_PATH
from aqven.app.instance import bind_loopback, bound_port
from aqven.app.locations import ProjectState, StudioState
from aqven.app.options import ServerOptions
from aqven.app.runtime import LocalServer, Started
from aqven.app.runtime_file import read_server_record
from aqven.app.settings_store import open_settings_store
from aqven.engine.facade import DbosEngineFacade

FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures"
WAIT_SECONDS: Final = 15.0


def copy_project(name: str, target: Path) -> Path:
    destination = target / name
    shutil.copytree(FIXTURES / name, destination, ignore=shutil.ignore_patterns("__pycache__"))
    return destination.resolve()


def free_port() -> int:
    listener = bind_loopback("127.0.0.1", 0)
    port = bound_port(listener)
    listener.close()
    return port


@pytest.mark.asyncio
async def test_runtime_serves_studio_application_behind_the_access_guard(tmp_path: Path) -> None:
    root = copy_project("standard_shop", tmp_path)
    server = LocalServer(
        application=ServerApplicationFactory(StudioFeatures(watch=False)),
        engine=RecordingEngineHost(),
        browser=RecordingBrowser(),
        announcer=RecordingAnnouncer(),
    )
    options = ServerOptions(root=root, port=free_port(), data_dir=tmp_path / "data", headless=True)
    task = asyncio.create_task(server.serve(options))
    try:
        async with asyncio.timeout(WAIT_SECONDS):
            while not server.readiness.ready and not task.done():
                await asyncio.sleep(0.02)
        record = read_server_record(ProjectState(root))
        assert record is not None
        cookie = {"Cookie": f"{access_cookie_name(record.port)}={record.token}"}
        async with httpx2.AsyncClient(base_url=record.url, trust_env=False, timeout=10.0) as http:
            ready = await http.get(READY_PATH)
            health = await http.get(HEALTH_PATH, headers=record.authorization())
            anonymous = await http.get("/api/project")
            by_bearer = await http.get("/api/project", headers=record.authorization())
            by_cookie = await http.get("/api/project", headers=cookie)
        assert ready.status_code == 200
        assert health.status_code == 200
        assert anonymous.status_code == 401
        assert by_bearer.status_code == 200
        assert by_cookie.status_code == 200
    finally:
        server.request_stop()
        async with asyncio.timeout(WAIT_SECONDS):
            outcome = await task
    assert isinstance(outcome, Started)
    assert read_server_record(ProjectState(root)) is None


@pytest.mark.asyncio
async def test_dbos_engine_host_launches_sqlite_engine_and_stops(tmp_path: Path) -> None:
    root = (tmp_path / "project").resolve()
    root.mkdir()
    project, studio = ProjectState(root), StudioState(tmp_path / "data")
    project.ensure()
    studio.ensure()
    settings = open_settings_store(project, studio, {})
    host = DbosEngineHost()
    facade = await host.start(EngineLaunch(root, tmp_path / "data", settings))
    try:
        assert isinstance(facade, DbosEngineFacade)
        assert facade.runtime.services.settings is settings
        assert (root / ".aqven" / "dbos.sqlite").is_file()
    finally:
        await host.stop()
    assert host.lifecycle is None
    await host.stop()
