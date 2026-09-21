import asyncio
import contextlib
import subprocess
import sys
from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

import httpx2
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server
from mcp_types import CallToolRequestParams, CallToolResult, ListToolsResult, PaginatedRequestParams
from pydantic import ValidationError

from aqven.server.mcp.endpoint import SERVER_NAME
from aqven.server.runtime_file import ServerRuntime, read_runtime, runtime_path

PROBE_TIMEOUT_SECONDS: Final = 1.0
STARTUP_TIMEOUT_SECONDS: Final = 30.0
POLL_INTERVAL_SECONDS: Final = 0.2
CONNECT_TIMEOUT_SECONDS: Final = 30.0
READ_TIMEOUT_SECONDS: Final = 1900.0
HEADLESS_SERVER_ARGUMENTS: Final = ("-P", "-m", "aqven", "serve", "--headless", "--no-browser")


class ServerUnavailable(Exception):
    def __init__(self, project: Path) -> None:
        super().__init__(f"aqven server for {project} did not start in time")
        self.project = project


def authorization(runtime: ServerRuntime) -> dict[str, str]:
    return {"Authorization": f"Bearer {runtime.token}"}


def runtime_root(start: Path) -> Path | None:
    resolved = start.resolve()
    return next((folder for folder in (resolved, *resolved.parents) if runtime_path(folder).is_file()), None)


def current_runtime(root: Path) -> ServerRuntime | None:
    try:
        return read_runtime(root)
    except OSError, ValidationError:
        return None


async def reachable(runtime: ServerRuntime, timeout_seconds: float = PROBE_TIMEOUT_SECONDS) -> bool:
    try:
        async with asyncio.timeout(timeout_seconds):
            _, writer = await asyncio.open_connection(runtime.host, runtime.port)
    except OSError, TimeoutError:
        return False
    writer.close()
    with contextlib.suppress(OSError):
        await writer.wait_closed()
    return True


class ServerLauncher(Protocol):
    def launch(self, project: Path) -> None: ...


@dataclass(frozen=True, slots=True)
class HeadlessServerLauncher:
    command: tuple[str, ...] = (sys.executable, *HEADLESS_SERVER_ARGUMENTS)

    def launch(self, project: Path) -> None:
        subprocess.Popen(
            (*self.command, "--root", str(project)),
            cwd=project,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )


@dataclass(frozen=True, slots=True)
class ServerLocator:
    launcher: ServerLauncher
    startup_timeout_seconds: float = STARTUP_TIMEOUT_SECONDS
    poll_interval_seconds: float = POLL_INTERVAL_SECONDS

    async def locate(self, project: Path) -> ServerRuntime:
        running = await running_server(project)
        if running is not None:
            return running
        self.launcher.launch(project)
        return await self._started(project)

    async def _started(self, project: Path) -> ServerRuntime:
        try:
            async with asyncio.timeout(self.startup_timeout_seconds):
                return await self._poll(project)
        except TimeoutError as error:
            raise ServerUnavailable(project) from error

    async def _poll(self, project: Path) -> ServerRuntime:
        while (runtime := await running_server(project)) is None:
            await asyncio.sleep(self.poll_interval_seconds)
        return runtime


async def running_server(project: Path) -> ServerRuntime | None:
    root = runtime_root(project)
    runtime = current_runtime(root) if root is not None else None
    if runtime is None or not await reachable(runtime):
        return None
    return runtime


class ToolUpstream(Protocol):
    async def list_tools(self, *, cursor: str | None = None) -> ListToolsResult: ...

    async def call_tool(self, name: str, arguments: dict[str, object] | None = None) -> CallToolResult: ...


@dataclass(frozen=True, slots=True)
class ToolProxy:
    upstream: ToolUpstream

    async def list_tools(self, context: ServerRequestContext, params: PaginatedRequestParams | None) -> ListToolsResult:
        return await self.upstream.list_tools(cursor=params.cursor if params is not None else None)

    async def call_tool(self, context: ServerRequestContext, params: CallToolRequestParams) -> CallToolResult:
        return await self.upstream.call_tool(params.name, params.arguments)


def build_bridge_server(upstream: ToolUpstream) -> Server:
    proxy = ToolProxy(upstream)
    return Server(SERVER_NAME, on_list_tools=proxy.list_tools, on_call_tool=proxy.call_tool)


@asynccontextmanager
async def open_upstream(runtime: ServerRuntime) -> AsyncGenerator[Client]:
    timeout = httpx2.Timeout(CONNECT_TIMEOUT_SECONDS, read=READ_TIMEOUT_SECONDS)
    async with (
        httpx2.AsyncClient(headers=authorization(runtime), timeout=timeout) as http,
        Client(streamable_http_client(runtime.mcp_url, http_client=http), cache=None) as client,
    ):
        yield client


async def bridge_to(runtime: ServerRuntime) -> None:
    async with open_upstream(runtime) as upstream, stdio_server() as (read_stream, write_stream):
        server = build_bridge_server(upstream)
        await server.run(read_stream, write_stream, server.create_initialization_options())


async def serve_bridge(project: Path, locator: ServerLocator) -> None:
    await bridge_to(await locator.locate(project))


def run_bridge(project: Path, command: Sequence[str] | None = None) -> None:
    launcher = HeadlessServerLauncher() if command is None else HeadlessServerLauncher(tuple(command))
    asyncio.run(serve_bridge(project, ServerLocator(launcher)))
