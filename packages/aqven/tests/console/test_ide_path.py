import asyncio
from pathlib import Path
from typing import Final

import httpx2
import pytest
from console_support import bridge_parameters, copy_fixture, server_record, stopping_background_server, structured
from mcp.client import Client

from aqven.app.runtime_file import ServerRecord

NOTE: Final = {"text": "note from the IDE"}
RUN_SETTLE_SECONDS: Final = 30.0
SPEC_EVENT_SECONDS: Final = 20.0


async def settled_run(client: Client, run_id: str) -> dict[str, object]:
    async with asyncio.timeout(RUN_SETTLE_SECONDS):
        while True:
            snapshot = structured(await client.call_tool("run_get", {"run_id": run_id}))
            if snapshot.get("status") in ("completed", "failed", "cancelled"):
                return dict(snapshot)
            await asyncio.sleep(0.2)


async def external_edit_event(record: ServerRecord, prompt: Path) -> tuple[str | None, str]:
    async with (
        httpx2.AsyncClient(headers=record.authorization(), timeout=SPEC_EVENT_SECONDS) as http,
        http.sse(f"{record.url}/api/events/spec") as source,
    ):
        await asyncio.sleep(0.5)
        prompt.write_text(prompt.read_text(encoding="utf-8") + "\nEdit from an external editor.\n", encoding="utf-8")
        async with asyncio.timeout(SPEC_EVENT_SECONDS):
            async for frame in source:
                if frame.event == "files_changed":
                    return frame.event, frame.data
    return None, ""


@pytest.mark.asyncio
async def test_mcp_stdio_only_lists_checks_runs_and_sees_external_edits(tmp_path: Path) -> None:
    root = copy_fixture("alias_shop", tmp_path)
    prompt = root / "prompts" / "writer.md"
    with stopping_background_server(root):
        async with Client(bridge_parameters(root, tmp_path / "data"), cache=None) as client:
            tools = {tool.name for tool in (await client.list_tools()).tools}
            check = structured(await client.call_tool("aqven_check", {}))
            started = structured(
                await client.call_tool("run_start", {"flow_id": "audit", "mode": "live", "input": NOTE})
            )
            run = await settled_run(client, str(started["run_id"]))
            record = server_record(root)
            assert record is not None
            event, data = await external_edit_event(record, prompt)
    assert {"prompt_preview", "aqven_check", "run_start", "run_get", "flow_patch"} <= tools
    assert check["ok"] is True
    assert run["status"] == "completed"
    assert event == "files_changed"
    assert "prompts/writer.md" in data
