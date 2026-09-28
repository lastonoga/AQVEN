import os
import shutil
import socket
import threading
import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import uvicorn
from contract_engine import ScriptedEngine, ScriptedEngineHost
from fastapi import FastAPI
from starlette.types import ASGIApp

from aqven.app import LocalAppOptions, LocalTokenAccess, create_local_app
from aqven.app.health import HealthEndpoint, Readiness, ServerIdentity
from aqven.app.runtime_file import ServerRecord, server_record

FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures"
LOOPBACK: Final = "127.0.0.1"
TOKEN: Final = "contract-token-0123456789"
STARTUP_SECONDS: Final = 15.0


def shop_copy(target: Path) -> Path:
    destination = target / "standard_shop"
    shutil.copytree(FIXTURES / "standard_shop", destination, ignore=shutil.ignore_patterns("__pycache__"))
    return destination.resolve()


@dataclass(frozen=True, slots=True)
class LiveServer:
    base_url: str
    mcp_url: str
    token: str
    engine: ScriptedEngine
    root: Path
    port: int

    def authorization(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def record(self) -> ServerRecord:
        return server_record(host=LOOPBACK, port=self.port, token=self.token, pid=os.getpid(), root=self.root)


def contract_app(root: Path, data_dir: Path, engine: ScriptedEngineHost, port: int) -> FastAPI:
    options = LocalAppOptions(
        port=port,
        watch=False,
        chat=False,
        access=LocalTokenAccess(token=TOKEN, port=port),
        data_dir=data_dir,
        engine=engine,
    )
    return create_local_app(root, options, {})


def with_health(app: FastAPI, root: Path) -> ASGIApp:
    readiness = Readiness()
    readiness.mark_ready()
    return HealthEndpoint(app, readiness, ServerIdentity(pid=os.getpid(), project_root=str(root), headless=True))


@contextmanager
def serving(root: Path, data_dir: Path, engine: ScriptedEngine | None = None) -> Generator[LiveServer]:
    listener = socket.socket()
    listener.bind((LOOPBACK, 0))
    port = int(listener.getsockname()[1])
    host = ScriptedEngineHost() if engine is None else ScriptedEngineHost(engine=engine)
    app = with_health(contract_app(root, data_dir, host, port), root)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", timeout_graceful_shutdown=1))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + STARTUP_SECONDS
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.02)
    base = f"http://{LOOPBACK}:{port}"
    try:
        yield LiveServer(base_url=base, mcp_url=f"{base}/mcp/", token=TOKEN, engine=host.engine, root=root, port=port)
    finally:
        server.should_exit = True
        thread.join(STARTUP_SECONDS)
        listener.close()
