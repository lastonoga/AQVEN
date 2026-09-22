import asyncio
import socket
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import httpx2
import pytest
import uvicorn
from fastapi import FastAPI
from mcp.client import Client
from mcp.client.stdio import StdioServerParameters
from mcp_support import shop_copy, structured

from aqven.server.mcp import (
    McpEndpoint,
    McpPorts,
    ProjectPaths,
    ServerLocator,
    ServerUnavailable,
    build_catalog,
    build_mcp_endpoint,
    open_upstream,
)
from aqven.server.runtime_file import ServerRuntime, runtime_path, write_runtime
from aqven.server.security import AccessPolicy

TOKEN: Final = "test-token-0123456789"
LOOPBACK: Final = "127.0.0.1"
INITIALIZE: Final = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
}
MCP_HEADERS: Final = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
BRIDGE_SCRIPT: Final = (
    "import sys; from pathlib import Path; from aqven.server.mcp import run_bridge; run_bridge(Path(sys.argv[1]))"
)


def application(endpoint: McpEndpoint) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        async with endpoint.lifespan(app):
            yield

    app = FastAPI(lifespan=lifespan)
    endpoint.mount(app)
    return app


def runtime_for(root: Path, port: int) -> ServerRuntime:
    base = f"http://{LOOPBACK}:{port}"
    return ServerRuntime(
        host=LOOPBACK,
        port=port,
        token=TOKEN,
        pid=1,
        url=base,
        mcp_url=f"{base}/mcp/",
        project_root=root.as_posix(),
    )


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind((LOOPBACK, 0))
        port: int = probe.getsockname()[1]
    return port


@asynccontextmanager
async def serving(root: Path) -> AsyncGenerator[ServerRuntime]:
    endpoint = build_mcp_endpoint(build_catalog(McpPorts(paths=ProjectPaths.of(root, root))), AccessPolicy(token=TOKEN))
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(application(endpoint), host=LOOPBACK, port=port, log_level="warning"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)
    try:
        yield runtime_for(root, port)
    finally:
        server.should_exit = True
        await task


@dataclass(slots=True)
class RecordingLauncher:
    runtime: ServerRuntime | None = None
    launched: list[Path] = field(default_factory=list[Path])

    def launch(self, project: Path) -> None:
        self.launched.append(project)
        if self.runtime is not None:
            write_runtime(project, self.runtime)


@pytest.mark.asyncio
async def test_mcp_endpoint_requires_bearer_token(tmp_path: Path) -> None:
    async with serving(shop_copy(tmp_path)) as runtime, httpx2.AsyncClient() as http:
        anonymous = await http.post(runtime.mcp_url, json=INITIALIZE, headers=MCP_HEADERS)
        wrong = await http.post(
            runtime.mcp_url, json=INITIALIZE, headers={**MCP_HEADERS, "Authorization": "Bearer wrong"}
        )
        allowed = await http.post(
            runtime.mcp_url, json=INITIALIZE, headers={**MCP_HEADERS, "Authorization": f"Bearer {TOKEN}"}
        )
    assert (anonymous.status_code, anonymous.json()["code"]) == (401, "UNAUTHORIZED")
    assert wrong.status_code == 401
    assert allowed.status_code == 200


@pytest.mark.asyncio
async def test_http_client_with_token_calls_tools(tmp_path: Path) -> None:
    async with serving(shop_copy(tmp_path)) as runtime, open_upstream(runtime) as client:
        listed = await client.list_tools()
        result = await client.call_tool("prompt_preview", {"flow_id": "intake", "node_id": "reply"})
    assert "aqven_check" in {tool.name for tool in listed.tools}
    assert result.is_error is False
    assert structured(result)["messages"]


@pytest.mark.asyncio
async def test_locator_finds_running_server_from_subfolder(tmp_path: Path) -> None:
    root = shop_copy(tmp_path)
    launcher = RecordingLauncher()
    async with serving(root) as runtime:
        write_runtime(root, runtime)
        found = await ServerLocator(launcher).locate(root / "flows" / "intake")
    assert found.port == runtime.port
    assert launcher.launched == []


@pytest.mark.asyncio
async def test_locator_launches_server_when_runtime_is_stale(tmp_path: Path) -> None:
    root = shop_copy(tmp_path)
    write_runtime(root, runtime_for(root, free_port()))
    async with serving(root) as runtime:
        launcher = RecordingLauncher(runtime=runtime)
        found = await ServerLocator(launcher, startup_timeout_seconds=5).locate(root)
    assert found.port == runtime.port
    assert launcher.launched == [root]


@pytest.mark.asyncio
async def test_locator_gives_up_when_server_never_starts(tmp_path: Path) -> None:
    launcher = RecordingLauncher()
    with pytest.raises(ServerUnavailable):
        await ServerLocator(launcher, startup_timeout_seconds=0.5, poll_interval_seconds=0.05).locate(tmp_path)
    assert launcher.launched == [tmp_path]
    assert not runtime_path(tmp_path).exists()


@pytest.mark.asyncio
async def test_stdio_bridge_forwards_to_running_server(tmp_path: Path) -> None:
    root = shop_copy(tmp_path)
    async with serving(root) as runtime:
        write_runtime(root, runtime)
        parameters = StdioServerParameters(command=sys.executable, args=["-c", BRIDGE_SCRIPT, root.as_posix()])
        async with Client(parameters, cache=None) as client:
            listed = await client.list_tools()
            result = await client.call_tool("prompt_preview", {"flow_id": "intake", "node_id": "reply"})
    assert {"prompt_preview", "pytest_run", "pyright_check"} <= {tool.name for tool in listed.tools}
    output = structured(result)["output"]
    assert isinstance(output, dict)
    assert output["mode"] == "tool"
