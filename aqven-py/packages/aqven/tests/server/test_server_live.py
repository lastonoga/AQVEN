import asyncio
import socket
import threading
import time
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Final

import httpx2
import uvicorn
from fastapi import FastAPI
from server_fakes import AUTH, RUN_ID, SERVER_TOKEN, FakeEngine, MemorySettings

from aqven.client import AqvenClient
from aqven.server import ServerOptions, create_app

STARTUP_SECONDS: Final = 10.0


@contextmanager
def running(app: FastAPI) -> Generator[str]:
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", timeout_graceful_shutdown=1))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + STARTUP_SECONDS
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.02)
    try:
        yield f"http://127.0.0.1:{listener.getsockname()[1]}"
    finally:
        server.should_exit = True
        thread.join(STARTUP_SECONDS)
        listener.close()


def live_app(project: Path, engine: FakeEngine, watch: bool) -> FastAPI:
    options = ServerOptions(
        access_token=SERVER_TOKEN,
        watch=watch,
        watch_debounce_ms=50,
        serve_studio=False,
        blob_directory=project.parent / "blobs",
    )
    return create_app(project, engine, MemorySettings(), options=options)


def test_client_reconnects_with_last_event_id(server_project: Path) -> None:
    engine = FakeEngine(first_stream_limit=2)

    async def scenario(base: str) -> list[int]:
        async with httpx2.AsyncClient(headers=AUTH, timeout=10) as http, AqvenClient(base, http=http) as client:
            return [event.seq async for event in client.run_events(RUN_ID)]

    with running(live_app(server_project, engine, watch=False)) as base:
        seqs = asyncio.run(scenario(base))
    assert seqs == [1, 2, 3]
    assert engine.event_reads == [0, 2]


def test_spec_channel_streams_external_edit(server_project: Path) -> None:
    prompt = server_project / "flows/intake/nodes/reply/reply.prompt.md"

    async def scenario(base: str) -> tuple[str, str]:
        async with (
            httpx2.AsyncClient(headers=AUTH, timeout=15) as http,
            http.sse(f"{base}/api/events/spec") as source,
        ):
            await asyncio.sleep(0.5)
            prompt.write_text(prompt.read_text(encoding="utf-8") + "\nEdit from the IDE.\n", encoding="utf-8")
            frame = await asyncio.wait_for(anext(aiter(source)), 15)
            return frame.event, frame.data

    with running(live_app(server_project, FakeEngine(), watch=True)) as base:
        event, data = asyncio.run(scenario(base))
    assert event == "files_changed"
    assert "reply.prompt.md" in data


def test_live_rejects_missing_token(server_project: Path) -> None:
    with running(live_app(server_project, FakeEngine(), watch=False)) as base:
        response = httpx2.get(f"{base}/api/project")
        ready = httpx2.get(f"{base}/api/ready", headers=AUTH)
    assert response.status_code == 401
    assert ready.status_code == 200
