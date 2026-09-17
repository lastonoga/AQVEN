import asyncio
import json
from pathlib import Path
from typing import Final

import httpx2
from fastapi import FastAPI
from fastapi.routing import APIRoute
from pydantic import JsonValue, SecretStr, TypeAdapter

from aqven.chat.sqlite_journal import PROJECT_APP_DATABASE
from aqven.chat.testing import ApprovalStep, ScriptedClientFactory
from aqven.ports.chat import (
    CHAT_EVENT_ADAPTER,
    ChatApprovalRequested,
    ChatEvent,
    ChatSessionId,
    ChatSessionOptions,
    ChatTurnFinished,
)
from aqven.server.chat.extension import claude_chat_parts
from aqven.server.chat.router import ChatRouteContext, build_chat_router
from aqven.server.errors import install_error_handlers

from .fixtures import MCP_URL, ChatHarness, chat_harness, next_event, streamed_answer_turn

BASE_URL: Final[str] = "http://127.0.0.1"
OPENAPI_PATHS: Final[TypeAdapter[dict[str, dict[str, dict[str, JsonValue]]]]] = TypeAdapter(
    dict[str, dict[str, dict[str, JsonValue]]]
)


def chat_app(harness: ChatHarness) -> FastAPI:
    app = FastAPI(openapi_url="/api/openapi.json", docs_url=None, redoc_url=None)
    install_error_handlers(app)
    context = ChatRouteContext(harness.project_root, MCP_URL)
    app.include_router(build_chat_router(harness.backend, harness.journal, context))
    return app


def client_for(app: FastAPI) -> httpx2.AsyncClient:
    return httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE_URL)


def sse_frames(body: str) -> list[dict[str, str]]:
    blocks = [block for block in body.split("\n\n") if block.strip() and not block.startswith(":")]
    return [dict(line.split(": ", 1) for line in block.splitlines()) for block in blocks]


def test_chat_routes_create_send_stream_and_close(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[list[dict[str, str]], list[dict[str, str]], dict[str, object]]:
        async with client_for(chat_app(harness)) as client:
            status = (await client.get("/api/chat/status")).json()
            created = await client.post("/api/chat/sessions", json={"model": "claude-haiku-4-5"})
            assert created.status_code == 201
            session_id = ChatSessionId(created.json()["session_id"])
            assert created.json()["project_root"] == str(tmp_path)
            events = harness.backend.events(session_id)
            sent = await client.post(
                f"/api/chat/sessions/{session_id}/messages", json={"text": "hello", "client_op_id": "op-1"}
            )
            assert sent.status_code == 202
            await next_event(events, ChatTurnFinished)
            listed = (await client.get("/api/chat/sessions")).json()
            assert [item["session_id"] for item in listed["items"]] == [session_id]
            closed = await client.delete(f"/api/chat/sessions/{session_id}")
            assert closed.status_code == 200
            resumed = await client.get(f"/api/chat/sessions/{session_id}/events", headers={"Last-Event-ID": "2"})
            first_page = await client.get(f"/api/chat/sessions/{session_id}/events", params={"after_seq": 0})
            assert resumed.headers["content-type"].startswith("text/event-stream")
            return sse_frames(resumed.text), sse_frames(first_page.text), {"status": status, "sent": sent.json()}

    resumed, first_page, extras = asyncio.run(scenario())

    assert [int(frame["id"]) for frame in resumed] == list(range(3, len(first_page) + 1))
    assert [frame["id"] for frame in first_page][:2] == ["1", "2"]
    events: list[ChatEvent] = [CHAT_EVENT_ADAPTER.validate_json(frame["data"]) for frame in first_page]
    assert [frame["event"] for frame in first_page] == [event.type for event in events]
    assert events[0].type == "chat_turn_started"
    assert events[-1].type == "chat_turn_finished"
    sent = extras["sent"]
    assert isinstance(sent, dict) and sent["turn_id"] == events[0].turn_id
    status = extras["status"]
    assert isinstance(status, dict) and status["state"] == "logged_in"


def test_chat_routes_translate_failures_to_api_errors(tmp_path: Path) -> None:
    turn = [ApprovalStep(tool_name="Bash", tool_use_id="toolu_wait"), *streamed_answer_turn(tmp_path)]
    harness = chat_harness(tmp_path, ScriptedClientFactory([turn]))

    async def scenario() -> dict[str, tuple[int, str]]:
        async with client_for(chat_app(harness)) as client:
            missing = await client.get("/api/chat/sessions/nope")
            missing_events = await client.get("/api/chat/sessions/nope/events")
            session_id = ChatSessionId((await client.post("/api/chat/sessions", json={})).json()["session_id"])
            events = harness.backend.events(session_id)
            unknown_approval = await client.post(
                f"/api/chat/sessions/{session_id}/approvals/approval-x", json={"decision": "allow"}
            )
            await client.post(f"/api/chat/sessions/{session_id}/messages", json={"text": "go", "client_op_id": "a"})
            request, _ = await next_event(events, ChatApprovalRequested)
            busy = await client.post(
                f"/api/chat/sessions/{session_id}/messages", json={"text": "again", "client_op_id": "b"}
            )
            allowed = await client.post(
                f"/api/chat/sessions/{session_id}/approvals/{request.approval_id}", json={"decision": "allow"}
            )
            await next_event(events, ChatTurnFinished)
            interrupted = await client.post(f"/api/chat/sessions/{session_id}/interrupt")
            await client.delete(f"/api/chat/sessions/{session_id}")
            closed = await client.post(
                f"/api/chat/sessions/{session_id}/messages", json={"text": "late", "client_op_id": "c"}
            )
            await harness.backend.aclose()
            responses = {
                "missing": missing,
                "missing_events": missing_events,
                "unknown_approval": unknown_approval,
                "busy": busy,
                "allowed": allowed,
                "interrupted": interrupted,
                "closed": closed,
            }
            return {
                name: (response.status_code, response.json().get("code", "")) for name, response in responses.items()
            }

    results = asyncio.run(scenario())

    assert results == {
        "missing": (404, "NOT_FOUND"),
        "missing_events": (404, "NOT_FOUND"),
        "unknown_approval": (409, "NOT_WAITING"),
        "busy": (409, "CHAT_STATE_CONFLICT"),
        "allowed": (200, ""),
        "interrupted": (200, ""),
        "closed": (409, "CHAT_STATE_CONFLICT"),
    }


def test_chat_operations_are_rest_only_in_openapi(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())
    schema = chat_app(harness).openapi()
    paths = OPENAPI_PATHS.validate_python(schema["paths"])
    operations = {
        str(operation["operationId"]): operation
        for path_item in paths.values()
        for operation in path_item.values()
        if "operationId" in operation
    }

    assert set(operations) == {
        "chat_login_status",
        "chat_session_list",
        "chat_session_create",
        "chat_session_get",
        "chat_session_close",
        "chat_message_send",
        "chat_events",
        "chat_approval_answer",
        "chat_interrupt",
    }
    assert all("x-aqven-rest-only" in operation for operation in operations.values())
    assert json.dumps(schema).count("text/event-stream") >= 1


def test_claude_chat_parts_wire_router_journal_and_shutdown(tmp_path: Path) -> None:
    parts = claude_chat_parts(tmp_path, MCP_URL, SecretStr("launch-token"))
    app = FastAPI()
    paths = {route.path for route in parts.router.routes if isinstance(route, APIRoute)}

    async def lifecycle() -> None:
        async with parts.lifespan(app):
            session = await parts.chat.backend.start_session(
                ChatSessionOptions(project_root=str(tmp_path), mcp_url=MCP_URL)
            )
            assert parts.chat.journal.get_session(session.session_id) is not None

    asyncio.run(lifecycle())

    assert (tmp_path / PROJECT_APP_DATABASE).is_file()
    assert "/api/chat/sessions/{session_id}/events" in paths
