from pathlib import Path

import pytest
from mcp.client import Client
from mcp_support import FakeEngine, mcp_client, shop_copy, structured

from aqven.server.mcp import build_bridge_server


@pytest.mark.asyncio
async def test_proxy_lists_and_calls_upstream_tools(tmp_path: Path) -> None:
    async with (
        mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as upstream,
        Client(build_bridge_server(upstream), cache=None) as bridged,
    ):
        direct = await upstream.list_tools()
        proxied = await bridged.list_tools()
        result = await bridged.call_tool("flow_get", {"flow_id": "intake"})
    assert [tool.name for tool in proxied.tools] == [tool.name for tool in direct.tools]
    assert [tool.output_schema for tool in proxied.tools] == [tool.output_schema for tool in direct.tools]
    assert result.is_error is False
    assert structured(result)["flow_id"] == "intake"


@pytest.mark.asyncio
async def test_proxy_passes_domain_errors_through(tmp_path: Path) -> None:
    async with (
        mcp_client(shop_copy(tmp_path)) as upstream,
        Client(build_bridge_server(upstream), cache=None) as bridged,
    ):
        result = await bridged.call_tool("catalog_get", {"kind": "agent", "id": "ghost"})
    assert result.is_error is True
    error = structured(result)
    assert (error["op"], error["code"]) == ("catalog_get", "NOT_FOUND")
