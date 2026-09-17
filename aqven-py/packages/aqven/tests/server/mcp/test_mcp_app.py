import asyncio
import socket
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Final

import httpx2
import pytest
import uvicorn
from mcp_support import FakeEngine, shop_copy, structured
from pydantic import JsonValue, SecretStr

from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.server.app import ServerExtensions, ServerOptions, create_app
from aqven.server.mcp import McpPorts, ProjectPaths, build_catalog, build_mcp_endpoint, open_upstream
from aqven.server.runtime_file import ServerRuntime
from aqven.server.security import AccessPolicy

TOKEN: Final = "app-token-0123456789"
LOOPBACK: Final = "127.0.0.1"


class NoSettings:
    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        return None

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        raise AssertionError("settings are not written")

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        raise AssertionError("settings are not written")

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return False

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return None


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind((LOOPBACK, 0))
        port: int = probe.getsockname()[1]
    return port


@asynccontextmanager
async def studio_server(root: Path, blobs: Path) -> AsyncGenerator[ServerRuntime]:
    engine = FakeEngine()
    ports = McpPorts(paths=ProjectPaths.of(root, root), engine=engine)
    endpoint = build_mcp_endpoint(build_catalog(ports), AccessPolicy(token=TOKEN))
    port = free_port()
    options = ServerOptions(access_token=TOKEN, port=port, watch=False, serve_studio=False, blob_directory=blobs)
    extensions = ServerExtensions(mounts=endpoint.mounts(), lifespans=(endpoint.lifespan,))
    app = create_app(root, engine, NoSettings(), options=options, extensions=extensions)
    server = uvicorn.Server(uvicorn.Config(app, host=LOOPBACK, port=port, log_level="warning"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)
    base = f"http://{LOOPBACK}:{port}"
    try:
        yield ServerRuntime(
            host=LOOPBACK,
            port=port,
            token=TOKEN,
            pid=1,
            url=base,
            mcp_url=f"{base}/mcp/",
            project_root=root.as_posix(),
        )
    finally:
        server.should_exit = True
        await task


@pytest.mark.asyncio
async def test_mcp_mounted_into_studio_app_shares_access_token(tmp_path: Path) -> None:
    root = shop_copy(tmp_path)
    async with studio_server(root, tmp_path / "blobs") as runtime:
        async with httpx2.AsyncClient() as http:
            anonymous = await http.post(runtime.mcp_url, json={}, headers={"Content-Type": "application/json"})
            cookie_only = await http.post(
                runtime.mcp_url,
                json={},
                headers={"Content-Type": "application/json", "Cookie": f"aqven_access_{runtime.port}={TOKEN}"},
            )
        async with open_upstream(runtime) as client:
            listed = await client.list_tools()
            events = await client.call_tool("run_events", {"run_id": "run-1", "limit": 2})
    assert anonymous.status_code == 401
    assert cookie_only.status_code == 401
    assert {"run_start", "run_resume", "aqven_check"} <= {tool.name for tool in listed.tools}
    page = structured(events)
    items = page["items"]
    assert isinstance(items, list)
    assert [item["seq"] for item in items if isinstance(item, dict)] == [29, 30]
