import argparse
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
from aqven.app.options import ServerOptions, add_server_arguments, server_options
from aqven.app.runtime import TRUSTED_CHAT_WARNING, LocalServer, Started
from aqven.app.runtime_file import read_server_record
from aqven.app.settings_store import open_settings_store
from aqven.engine.facade import DbosEngineFacade

FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures"
WAIT_SECONDS: Final = 15.0
MCP_INITIALIZE: Final = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
}
MCP_HEADERS: Final = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


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
    options = ServerOptions(root=root, port=free_port(), data_dir=tmp_path / "data", headless=True, require_auth=True)
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
            anonymous_mcp = await http.post("/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)
            authenticated_mcp = await http.post(
                "/mcp/", json=MCP_INITIALIZE, headers={**MCP_HEADERS, **record.authorization()}
            )
        assert ready.status_code == 200
        assert health.status_code == 200
        assert anonymous.status_code == 401
        assert by_bearer.status_code == 200
        assert by_cookie.status_code == 200
        assert (anonymous_mcp.status_code, authenticated_mcp.status_code) == (401, 200)
    finally:
        server.request_stop()
        async with asyncio.timeout(WAIT_SECONDS):
            outcome = await task
    assert isinstance(outcome, Started)
    assert read_server_record(ProjectState(root)) is None


@pytest.mark.asyncio
async def test_runtime_studio_api_and_mcp_are_anonymous_by_default(tmp_path: Path) -> None:
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
        async with httpx2.AsyncClient(base_url=record.url, trust_env=False, timeout=10.0) as http:
            project = await http.get("/api/project")
            health = await http.get(HEALTH_PATH)
            mcp = await http.post("/mcp/", json=MCP_INITIALIZE, headers=MCP_HEADERS)
        assert (project.status_code, health.status_code, mcp.status_code) == (200, 200, 200)
    finally:
        server.request_stop()
        async with asyncio.timeout(WAIT_SECONDS):
            await task


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


def parsed_options(argv: list[str], root: Path) -> ServerOptions:
    parser = argparse.ArgumentParser(prog="chat-allow-tool")
    add_server_arguments(parser)
    return server_options(parser.parse_args([*argv, "--root", str(root)]), root)


def test_chat_allow_tool_is_empty_by_default(tmp_path: Path) -> None:
    (tmp_path / "aqven.yaml").write_text("apiVersion: aqven/v1\nkind: Project\n", encoding="utf-8")
    assert parsed_options([], tmp_path).chat_allowed_tools == ()


def test_chat_allow_tool_collects_every_rule_and_trims_blanks(tmp_path: Path) -> None:
    (tmp_path / "aqven.yaml").write_text("apiVersion: aqven/v1\nkind: Project\n", encoding="utf-8")
    argv = ["--chat-allow-tool", "Read", "--chat-allow-tool", " Bash(rg:*) ", "--chat-allow-tool", "  "]
    assert parsed_options(argv, tmp_path).chat_allowed_tools == ("Read", "Bash(rg:*)")


def test_chat_trust_project_is_off_by_default(tmp_path: Path) -> None:
    (tmp_path / "aqven.yaml").write_text("apiVersion: aqven/v1\nkind: Project\n", encoding="utf-8")
    assert parsed_options([], tmp_path).chat_trust_project is False


def test_chat_trust_project_needs_no_other_rules(tmp_path: Path) -> None:
    (tmp_path / "aqven.yaml").write_text("apiVersion: aqven/v1\nkind: Project\n", encoding="utf-8")
    options = parsed_options(["--chat-trust-project"], tmp_path)
    assert options.chat_trust_project is True
    assert options.chat_allowed_tools == ()


@pytest.mark.asyncio
async def test_trusted_chat_is_announced_so_it_cannot_start_quietly(tmp_path: Path) -> None:
    root = copy_project("standard_shop", tmp_path)
    announcer = RecordingAnnouncer()
    server = LocalServer(
        application=ServerApplicationFactory(StudioFeatures(watch=False, chat=False)),
        engine=RecordingEngineHost(),
        browser=RecordingBrowser(),
        announcer=announcer,
    )
    options = ServerOptions(
        root=root,
        port=free_port(),
        data_dir=tmp_path / "data",
        headless=True,
        chat_trust_project=True,
    )
    task = asyncio.create_task(server.serve(options))
    try:
        async with asyncio.timeout(WAIT_SECONDS):
            while not server.readiness.ready and not task.done():
                await asyncio.sleep(0.02)
        assert any(message == TRUSTED_CHAT_WARNING for message in announcer.messages)
    finally:
        server.request_stop()
        await task
