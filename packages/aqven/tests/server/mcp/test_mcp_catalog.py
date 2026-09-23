from pathlib import Path
from typing import Final

import pytest
from mcp_support import FakeEngine, call, mcp_client, shop_copy, structured
from series_fakes import FakeSeriesJobs

from aqven.write.model import FlowPatchRequest, WriteActor, WriteResult

PROJECT_TOOLS: Final = frozenset({"prompt_preview"})
RUNNER_TOOLS: Final = frozenset({"aqven_check", "pyright_check", "pytest_run"})
RUN_TOOLS: Final = frozenset(
    {"run_start", "run_get", "run_list", "run_get_node", "run_events", "run_resume", "run_fork", "run_cancel"}
)
SERIES_TOOLS: Final = frozenset({"series_start", "series_get", "series_cancel"})
SURFACE: Final = PROJECT_TOOLS | RUNNER_TOOLS | RUN_TOOLS | SERIES_TOOLS | {"flow_patch"}
FULL_SURFACE_SIZE: Final = 16


async def unused_patch(request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
    raise AssertionError("no edit expected")


@pytest.mark.asyncio
async def test_catalog_lists_every_tool_with_schemas(tmp_path: Path) -> None:
    async with mcp_client(
        shop_copy(tmp_path), engine=FakeEngine(), patch_flow=unused_patch, series=FakeSeriesJobs()
    ) as client:
        listed = await client.list_tools()
    tools = {tool.name: tool for tool in listed.tools}
    assert set(tools) == SURFACE
    assert len(tools) == FULL_SURFACE_SIZE
    assert all(tool.output_schema is not None for tool in tools.values())
    assert all(tool.annotations is not None and tool.title for tool in tools.values())
    patch_schema = tools["flow_patch"].input_schema
    assert set(patch_schema["required"]) >= {"flow_id", "expects", "ops", "client_op_id"}
    assert tools["run_get_node"].input_schema["required"] == ["run_id", "node_id"]


@pytest.mark.asyncio
async def test_catalog_without_engine_writer_and_series_omits_their_tools(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        listed = await client.list_tools()
    assert {tool.name for tool in listed.tools} == PROJECT_TOOLS | RUNNER_TOOLS


@pytest.mark.asyncio
async def test_the_surface_is_actions_and_leaves_reading_the_project_to_the_agent(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine(), patch_flow=unused_patch) as client:
        listed = await client.list_tools()
    assert {tool.name for tool in listed.tools}.isdisjoint({"flow_list", "flow_get", "catalog_list", "catalog_get"})
    assert all("flow_get" not in str(tool.description) for tool in listed.tools)


@pytest.mark.asyncio
async def test_project_without_aqven_yaml_is_not_runnable(tmp_path: Path) -> None:
    async with mcp_client(tmp_path) as client:
        result = await call(client, "prompt_preview", {"flow_id": "intake", "node_id": "reply"})
    assert result.is_error is True
    error = structured(result)
    assert error["code"] == "NOT_RUNNABLE"
    assert error["problems"]


@pytest.mark.asyncio
async def test_model_level_validation_becomes_request_invalid(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(
            client,
            "run_start",
            {"flow_id": "intake", "mode": "live", "input": {"text": "a"}, "dataset_item_id": "item-1"},
        )
    assert result.is_error is True
    error = structured(result)
    assert error["code"] == "REQUEST_INVALID"
    assert error["op"] == "run_start"
