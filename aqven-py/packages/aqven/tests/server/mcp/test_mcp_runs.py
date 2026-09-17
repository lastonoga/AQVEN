from pathlib import Path
from typing import Final

import pytest
from mcp_support import RUN_ID, FakeEngine, call, mcp_client, shop_copy, structured
from pydantic import JsonValue

from aqven.ports.engine import EngineError
from aqven.runtime.address import node_address

ADDRESS: Final[dict[str, JsonValue]] = {"node_id": "review", "branch_key": None, "iteration": 2, "item_index": None}
CLIENT_OP_ID: Final = "01JB8Q3XK2M4N6P8R0S2T4V6W8"


def seqs(page: dict[str, JsonValue]) -> list[JsonValue]:
    items = page["items"]
    assert isinstance(items, list)
    return [item["seq"] for item in items if isinstance(item, dict)]


@pytest.mark.asyncio
async def test_run_start_passes_request_to_engine(tmp_path: Path) -> None:
    engine = FakeEngine()
    async with mcp_client(shop_copy(tmp_path), engine=engine) as client:
        result = await call(client, "run_start", {"flow_id": "intake", "mode": "live", "input": {"text": "hi"}})
    assert result.is_error is False
    assert structured(result)["run_id"] == RUN_ID
    assert [(request.flow_id, request.input) for request in engine.starts] == [("intake", {"text": "hi"})]


@pytest.mark.asyncio
async def test_run_get_returns_snapshot(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_get", {"run_id": RUN_ID})
    snapshot = structured(result)
    assert snapshot["status"] == "running"
    assert snapshot["last_seq"] == 30


@pytest.mark.asyncio
async def test_run_get_unknown_run_translates_engine_error(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_get", {"run_id": "nope"})
    assert result.is_error is True
    error = structured(result)
    assert (error["code"], error["op"]) == ("NOT_FOUND", "run_get")


@pytest.mark.asyncio
async def test_run_list_returns_page(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_list", {"status": "suspended", "limit": 5})
    page = structured(result)
    assert page == {"items": [], "next_cursor": None, "total_estimate": 0}


@pytest.mark.asyncio
async def test_run_events_without_after_seq_returns_tail(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_events", {"run_id": RUN_ID, "limit": 3})
    assert seqs(structured(result)) == [28, 29, 30]


@pytest.mark.asyncio
async def test_run_events_after_seq_reads_forward(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_events", {"run_id": RUN_ID, "after_seq": 0, "limit": 2})
    page = structured(result)
    assert seqs(page) == [1, 2]
    items = page["items"]
    assert isinstance(items, list)
    first = items[0]
    assert isinstance(first, dict)
    assert first["type"] == "run_started"


@pytest.mark.asyncio
async def test_run_get_node_builds_address(tmp_path: Path) -> None:
    engine = FakeEngine()
    async with mcp_client(shop_copy(tmp_path), engine=engine) as client:
        result = await call(
            client, "run_get_node", {"run_id": RUN_ID, "node_id": "review", "iteration": 2, "include_payloads": "none"}
        )
    assert structured(result)["address"] == ADDRESS
    assert engine.addresses == [(node_address("review", iteration=2), "none")]


@pytest.mark.asyncio
async def test_run_resume_sends_answer(tmp_path: Path) -> None:
    engine = FakeEngine()
    arguments: dict[str, object] = {
        "run_id": RUN_ID,
        "address": ADDRESS,
        "attempt": 1,
        "payload": {"approve": True},
        "client_op_id": CLIENT_OP_ID,
    }
    async with mcp_client(shop_copy(tmp_path), engine=engine) as client:
        result = await call(client, "run_resume", arguments)
    assert structured(result)["outcome"] == "accepted"
    ((run_id, request),) = engine.resumes
    assert (run_id, request.attempt, request.payload, request.client_op_id) == (
        RUN_ID,
        1,
        {"approve": True},
        CLIENT_OP_ID,
    )


@pytest.mark.asyncio
async def test_run_resume_engine_conflict_is_api_error(tmp_path: Path) -> None:
    engine = FakeEngine(resume_error=EngineError("WAIT_ATTEMPT_STALE", "attempt is stale", details={"attempt": 2}))
    arguments: dict[str, object] = {
        "run_id": RUN_ID,
        "address": ADDRESS,
        "attempt": 1,
        "payload": {},
        "client_op_id": CLIENT_OP_ID,
    }
    async with mcp_client(shop_copy(tmp_path), engine=engine) as client:
        result = await call(client, "run_resume", arguments)
    assert result.is_error is True
    error = structured(result)
    assert (error["code"], error["message"]) == ("WAIT_ATTEMPT_STALE", "attempt is stale")
    assert error["conflict"] == {"attempt": 2}


@pytest.mark.asyncio
async def test_run_cancel_returns_status(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_cancel", {"run_id": RUN_ID, "reason": "stop"})
    assert structured(result) == {"status": "cancelled"}


@pytest.mark.asyncio
async def test_run_fork_passes_the_address_to_the_engine(tmp_path: Path) -> None:
    arguments: dict[str, object] = {
        "run_id": RUN_ID,
        "address": {"node_id": "review", "branch_key": None, "iteration": None, "item_index": None},
    }
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine()) as client:
        result = await call(client, "run_fork", arguments)
    assert result.is_error is False
    assert structured(result) == {"run_id": "run-2", "lineage_parent": RUN_ID}
