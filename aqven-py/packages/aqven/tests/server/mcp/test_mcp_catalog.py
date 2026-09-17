from pathlib import Path
from typing import Final

import pytest
from mcp_support import FakeEngine, call, mcp_client, shop_copy, structured

from aqven.write.model import FlowPatchRequest, WriteActor, WriteResult

PROJECT_TOOLS: Final = frozenset({"flow_list", "flow_get", "catalog_list", "catalog_get"})
RUNNER_TOOLS: Final = frozenset({"aqven_check", "pyright_check", "pytest_run"})
RUN_TOOLS: Final = frozenset(
    {"run_start", "run_get", "run_list", "run_get_node", "run_events", "run_resume", "run_fork", "run_cancel"}
)


async def unused_patch(request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
    raise AssertionError("no edit expected")


@pytest.mark.asyncio
async def test_catalog_lists_every_tool_with_schemas(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine(), patch_flow=unused_patch) as client:
        listed = await client.list_tools()
    tools = {tool.name: tool for tool in listed.tools}
    assert set(tools) == PROJECT_TOOLS | RUNNER_TOOLS | RUN_TOOLS | {"flow_patch"}
    assert all(tool.output_schema is not None for tool in tools.values())
    assert all(tool.annotations is not None and tool.title for tool in tools.values())
    patch_schema = tools["flow_patch"].input_schema
    assert set(patch_schema["required"]) >= {"flow_id", "expects", "ops", "client_op_id"}
    assert tools["run_get_node"].input_schema["required"] == ["run_id", "node_id"]


@pytest.mark.asyncio
async def test_catalog_without_engine_and_writer_omits_their_tools(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        listed = await client.list_tools()
    assert {tool.name for tool in listed.tools} == PROJECT_TOOLS | RUNNER_TOOLS


@pytest.mark.asyncio
async def test_flow_list_reports_flows_with_file_hashes(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "flow_list", {})
    assert result.is_error is False
    items = structured(result)["items"]
    assert isinstance(items, list)
    assert [item["flow_id"] for item in items if isinstance(item, dict)] == ["intake"]
    flow = items[0]
    assert isinstance(flow, dict)
    assert flow["nodes"] == 6
    file = flow["file"]
    assert isinstance(file, dict)
    assert file["path"] == "flows/intake/flow.yaml"
    assert str(file["file_hash"]).startswith("sha256-")


@pytest.mark.asyncio
async def test_flow_get_focuses_node_with_neighbours_and_texts(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "flow_get", {"flow_id": "intake", "node_id": "reply"})
    detail = structured(result)
    focus = detail["focus"]
    assert isinstance(focus, dict)
    assert focus["node"] == "llm"
    assert focus["upstream"] == ["clean"]
    downstream = focus["downstream"]
    assert isinstance(downstream, list)
    assert "review" in downstream
    assert focus["text_files"] == [
        "flows/intake/nodes/reply/reply.prompt.md",
        "flows/intake/nodes/reply/reply.variants/tone/calm.md",
        "flows/intake/nodes/reply/reply.variants/tone/warm.md",
    ]
    nodes = detail["nodes"]
    assert isinstance(nodes, list)
    parents = {node["node_id"]: node["parent"] for node in nodes if isinstance(node, dict)}
    assert parents["review__recheck__trim"] == "review__recheck"


@pytest.mark.asyncio
async def test_flow_get_unknown_flow_is_domain_error(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "flow_get", {"flow_id": "missing"})
    assert result.is_error is True
    error = structured(result)
    assert error["ok"] is False
    assert error["op"] == "flow_get"
    assert error["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_project_without_aqven_yaml_is_not_runnable(tmp_path: Path) -> None:
    async with mcp_client(tmp_path) as client:
        result = await call(client, "flow_list", {})
    assert result.is_error is True
    error = structured(result)
    assert error["code"] == "NOT_RUNNABLE"
    assert error["problems"]


@pytest.mark.asyncio
async def test_catalog_list_filters_by_kind(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "catalog_list", {"kind": "agent"})
    items = structured(result)["items"]
    assert isinstance(items, list)
    assert [(item["id"], item["path"]) for item in items if isinstance(item, dict)] == [
        ("critic", "agents/critic.yaml"),
        ("writer", "agents/writer/writer.yaml"),
    ]


@pytest.mark.asyncio
async def test_catalog_get_returns_spec_and_references(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "catalog_get", {"kind": "type", "id": "Note"})
    entry = structured(result)
    assert entry["path"] == "types/records/note.yaml"
    spec = entry["spec"]
    assert isinstance(spec, dict)
    assert spec["kind"] == "Type"
    incoming = entry["incoming"]
    assert isinstance(incoming, list)
    assert "flow:intake" in [item["entity"] for item in incoming if isinstance(item, dict)]


@pytest.mark.asyncio
async def test_catalog_get_resolves_local_node_name(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "catalog_get", {"kind": "node", "id": "clean"})
    entry = structured(result)
    assert entry["id"] == "intake.clean"
    assert entry["path"] == "flows/intake/nodes/clean/clean.node.yaml"


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
