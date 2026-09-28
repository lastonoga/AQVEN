from pathlib import Path

import pytest
from mcp_support import RUN_ID, FakeEngine, call, mcp_client, shop_copy, structured


@pytest.mark.asyncio
async def test_run_start_hands_agent_overrides_to_the_engine(tmp_path: Path) -> None:
    engine = FakeEngine()
    async with mcp_client(shop_copy(tmp_path), engine=engine) as client:
        result = await call(
            client,
            "run_start",
            {"flow_id": "intake", "mode": "live", "input": {"text": "hi"}, "agent_overrides": {"reply": "critic"}},
        )

    assert result.is_error is False
    assert [request.agent_overrides for request in engine.starts] == [{"reply": "critic"}]


@pytest.mark.asyncio
async def test_run_start_and_run_get_publish_agent_overrides(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        listed = await client.list_tools()
        snapshot = structured(await call(client, "run_get", {"run_id": RUN_ID}))
    tools = {tool.name: tool for tool in listed.tools}
    run_get_schema = tools["run_get"].output_schema

    assert "agent_overrides" in tools["run_start"].input_schema["properties"]
    assert run_get_schema is not None and "agent_overrides" in run_get_schema["properties"]
    assert snapshot["agent_overrides"] == {}
    assert "agent_overrides {llm node id: agent id}" in (tools["run_start"].description or "")
    assert "run_start with dataset_item_id or input and agent_overrides" in (tools["run_fork"].description or "")
