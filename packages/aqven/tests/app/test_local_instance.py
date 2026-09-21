import os
import socket
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import httpx2
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response
from starlette.routing import Route

from aqven.app.health import HEALTH_PATH, READY_PATH, HealthEndpoint, HealthReport, Readiness, ServerIdentity
from aqven.app.host_os import OWNER_PERMISSIONS, permission_bits, process_alive
from aqven.app.instance import (
    HttpServerProbe,
    InstanceLock,
    NoFreePort,
    await_live_server,
    bind_loopback,
    bound_port,
    live_server,
)
from aqven.app.locations import ProjectState
from aqven.app.runtime_file import (
    ServerRecord,
    read_server_record,
    remove_server_record,
    server_record,
    write_server_record,
)

TOKEN: Final = "record-token-0123456789abcdef"
STARTED_AT: Final = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)


def record_for(root: Path, pid: int | None = None, port: int = 5180) -> ServerRecord:
    return server_record(host="127.0.0.1", port=port, token=TOKEN, pid=pid or os.getpid(), root=root)


def report_json(record: ServerRecord, status: str = "ready", root: str | None = None) -> bytes:
    report = HealthReport(
        status="ready" if status == "ready" else "starting",
        pid=record.pid,
        project_root=root or record.project_root,
        version="0.0.0",
        headless=True,
        started_at=STARTED_AT,
    )
    return report.model_dump_json().encode()


def health_transport(body: bytes, status_code: int = 200) -> httpx2.MockTransport:
    def answer(request: httpx2.Request) -> httpx2.Response:
        authorized = request.headers.get("authorization") == f"Bearer {TOKEN}"
        if request.url.path != HEALTH_PATH or not authorized:
            return httpx2.Response(401)
        return httpx2.Response(status_code, content=body)

    return httpx2.MockTransport(answer)


def test_record_round_trip_is_owner_only_and_hides_token_in_repr(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)
    record = record_for(tmp_path)
    path = write_server_record(state, record)
    assert read_server_record(state) == record
    assert record.url == "http://127.0.0.1:5180"
    assert record.mcp_url == "http://127.0.0.1:5180/mcp/"
    assert record.browser_url() == f"http://127.0.0.1:5180/?access_token={TOKEN}"
    assert record.browser_url("http://localhost:5173/") == f"http://localhost:5173/?access_token={TOKEN}"
    assert TOKEN not in repr(record)
    if OWNER_PERMISSIONS:
        assert permission_bits(path) == 0o600


def test_record_removal_only_by_owner_pid(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)
    write_server_record(state, record_for(tmp_path))
    assert remove_server_record(state, os.getpid() + 1) is False
    assert state.server_record.is_file()
    assert remove_server_record(state, os.getpid()) is True
    assert not state.server_record.exists()


def test_corrupt_record_reads_as_absent(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)
    state.ensure()
    state.server_record.write_text("{not json", encoding="utf-8")
    assert read_server_record(state) is None


def test_lock_is_exclusive_until_released(tmp_path: Path) -> None:
    path = tmp_path / ".aqven" / "server.lock"
    first = InstanceLock(path)
    second = InstanceLock(path)
    assert first.acquire() is True
    assert second.acquire() is False
    first.release()
    assert second.acquire() is True
    second.release()


def test_lock_context_releases(tmp_path: Path) -> None:
    path = tmp_path / "server.lock"
    held = InstanceLock(path)
    assert held.acquire()
    with held:
        assert InstanceLock(path).acquire() is False
    probe = InstanceLock(path)
    assert probe.acquire() is True
    probe.release()


def test_busy_port_moves_to_next_free_port() -> None:
    occupied = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    occupied.bind(("127.0.0.1", 0))
    occupied.listen()
    busy = bound_port(occupied)
    try:
        listener = bind_loopback("127.0.0.1", busy, attempts=20)
    finally:
        occupied.close()
    chosen = bound_port(listener)
    listener.close()
    assert chosen != busy
    assert busy < chosen < busy + 20


def test_all_ports_busy_raises() -> None:
    occupied = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    occupied.bind(("127.0.0.1", 0))
    occupied.listen()
    try:
        with pytest.raises(NoFreePort):
            bind_loopback("127.0.0.1", bound_port(occupied), attempts=1)
    finally:
        occupied.close()


def test_ephemeral_port_is_supported() -> None:
    listener = bind_loopback("127.0.0.1", 0)
    assert bound_port(listener) > 0
    listener.close()


def test_process_liveness() -> None:
    assert process_alive(os.getpid()) is True
    assert process_alive(2**22 + 12345) is False


@pytest.mark.asyncio
async def test_probe_sends_bearer_and_parses_report(tmp_path: Path) -> None:
    record = record_for(tmp_path)
    probe = HttpServerProbe(transport=health_transport(report_json(record)))
    report = await probe.health(record)
    assert report is not None
    assert report.status == "ready"


@pytest.mark.asyncio
async def test_probe_treats_errors_as_unhealthy(tmp_path: Path) -> None:
    record = record_for(tmp_path)
    starting = HttpServerProbe(transport=health_transport(report_json(record, "starting"), 503))
    garbage = HttpServerProbe(transport=health_transport(b"<html>", 200))

    def refuse(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("refused", request=request)

    refused = HttpServerProbe(transport=httpx2.MockTransport(refuse))
    assert await starting.health(record) is None
    assert await garbage.health(record) is None
    assert await refused.health(record) is None


@pytest.mark.asyncio
async def test_live_server_requires_record_live_pid_and_matching_identity(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)
    record = record_for(tmp_path)
    healthy = HttpServerProbe(transport=health_transport(report_json(record)))
    other_project = HttpServerProbe(transport=health_transport(report_json(record, root="/elsewhere")))
    assert await live_server(state, healthy) is None
    write_server_record(state, record)
    assert await live_server(state, healthy) == record
    assert await live_server(state, other_project) is None
    write_server_record(state, record_for(tmp_path, pid=2**22 + 12345))
    assert await live_server(state, healthy) is None


@pytest.mark.asyncio
async def test_await_live_server_times_out(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)
    probe = HttpServerProbe(transport=health_transport(b"", 503))
    assert await await_live_server(state, probe, timeout_seconds=0.2, poll_seconds=0.05) is None


async def other_page(request: Request) -> Response:
    return PlainTextResponse("other")


def health_client(readiness: Readiness) -> httpx2.AsyncClient:
    identity = ServerIdentity(pid=os.getpid(), project_root="/project", headless=False, version="1.2.3")
    inner = Starlette(routes=[Route("/api/other", other_page)])
    app = HealthEndpoint(inner, readiness, identity)
    return httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url="http://127.0.0.1:5180")


@pytest.mark.asyncio
async def test_health_follows_readiness_phases() -> None:
    readiness = Readiness()
    async with health_client(readiness) as http:
        starting = await http.get(HEALTH_PATH)
        readiness.mark_ready()
        ready = await http.get(HEALTH_PATH)
        ready_probe = await http.get(READY_PATH)
        readiness.mark_stopping()
        stopping = await http.get(READY_PATH)
        passthrough = await http.get("/api/other")
    assert (starting.status_code, starting.json()["status"]) == (503, "starting")
    assert ready.status_code == 200
    assert HealthReport.model_validate_json(ready.content).project_root == "/project"
    assert ready_probe.json() == {"status": "ready", "engine_version": "1.2.3"}
    assert stopping.status_code == 503
    assert passthrough.text == "other"
