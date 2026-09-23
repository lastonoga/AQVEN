import sys
from collections.abc import Generator
from pathlib import Path
from typing import Final

import httpx2
import pytest
from contract_engine import FLOW_ID
from contract_server import LiveServer, serving, shop_copy
from mcp.client import Client
from mcp.client.stdio import StdioServerParameters
from mcp.client.streamable_http import streamable_http_client
from mcp_types import CallToolResult
from pydantic import JsonValue, TypeAdapter

STDIO_MAIN: Final = Path(__file__).with_name("mcp_stdio_main.py")
JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])
TIMEOUT: Final = 60.0
EXPECTED_TOOLS: Final = frozenset(
    {"aqven_check", "prompt_preview", "flow_patch", "run_start", "pyright_check", "pytest_run"}
)
SERIES_TOOLS: Final = frozenset({"series_start", "series_get", "series_cancel"})
PROJECT_SERVER_TOOLS: Final = 16


def structured(result: CallToolResult) -> dict[str, JsonValue]:
    return JSON_OBJECT.validate_python(result.structured_content)


@pytest.fixture
def live(tmp_path: Path) -> Generator[LiveServer]:
    with serving(shop_copy(tmp_path), tmp_path / "data") as server:
        yield server


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


pytestmark = pytest.mark.anyio


async def test_any_mcp_client_uses_the_streamable_http_endpoint(live: LiveServer) -> None:
    async with (
        httpx2.AsyncClient(headers=live.authorization(), timeout=TIMEOUT) as http,
        Client(streamable_http_client(live.mcp_url, http_client=http), cache=None) as client,
    ):
        listed = await client.list_tools()
        checked = await client.call_tool("aqven_check", {})
        started = await client.call_tool("run_start", {"flow_id": FLOW_ID, "mode": "live", "input": {"text": "a note"}})

    assert {tool.name for tool in listed.tools} >= EXPECTED_TOOLS | SERIES_TOOLS
    assert len(listed.tools) == PROJECT_SERVER_TOOLS
    assert structured(checked)["errors"] == 0
    assert structured(started)["run_id"]
    assert live.engine.started[0].flow_id == FLOW_ID


async def test_any_mcp_client_uses_the_same_tools_over_stdio(tmp_path: Path) -> None:
    root = shop_copy(tmp_path)
    parameters = StdioServerParameters(command=sys.executable, args=[str(STDIO_MAIN), root.as_posix()])

    async with Client(parameters, cache=None) as client:
        listed = await client.list_tools()
        checked = await client.call_tool("aqven_check", {})
        started = await client.call_tool("run_start", {"flow_id": FLOW_ID, "mode": "live", "input": {"text": "a note"}})

    assert {tool.name for tool in listed.tools} >= EXPECTED_TOOLS
    assert {tool.name for tool in listed.tools}.isdisjoint(SERIES_TOOLS)
    assert structured(checked)["ok"] is True
    assert structured(started)["run_id"]
