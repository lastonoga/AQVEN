from pathlib import Path

import pytest
from mcp_support import call, mcp_client, shop_copy, structured


@pytest.mark.asyncio
async def test_prompt_preview_returns_the_messages_and_the_output_contract(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "prompt_preview", {"flow_id": "intake", "node_id": "reply"})
    assert result.is_error is False
    body = structured(result)
    output = body["output"]
    assert isinstance(output, dict)
    assert body["input_source"] == "sample"
    assert output["mode"] == "tool"
    assert output["tool_name"] == "final_result"
    messages = body["messages"]
    assert isinstance(messages, list)
    assert len(messages) == 1


@pytest.mark.asyncio
async def test_prompt_preview_forces_a_variant_and_takes_an_input(tmp_path: Path) -> None:
    arguments: dict[str, object] = {
        "flow_id": "intake",
        "node_id": "reply",
        "input": {"text": "Помялась коробка", "mood": "calm"},
        "variants": {"tone": "warm"},
    }
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "prompt_preview", arguments)
    body = structured(result)
    messages = body["messages"]
    assert isinstance(messages, list)
    last = messages[-1]
    assert isinstance(last, dict)
    assert "Добавь тепла." in str(last["text"])
    assert "Помялась коробка" in str(last["text"])


@pytest.mark.asyncio
async def test_prompt_preview_of_a_code_node_is_an_error(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "prompt_preview", {"flow_id": "intake", "node_id": "clean"})
    assert result.is_error is True
    body = structured(result)
    assert body["code"] == "NOT_FOUND"
    assert "only llm nodes" in str(body["message"])
