import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import httpx2
from claude_agent_sdk import PermissionResultDeny
from fastapi import FastAPI
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, JsonValue, SecretStr, TypeAdapter

from aqven.chat.backend_registry import BackendRegistry
from aqven.chat.backend_selection import BackendSelection
from aqven.chat.sqlite_journal import PROJECT_APP_DATABASE
from aqven.chat.testing import ApprovalStep, ScriptedClientFactory
from aqven.ports.chat import (
    CHAT_EVENT_ADAPTER,
    ChatApprovalRequested,
    ChatApprovalResolved,
    ChatEvent,
    ChatSession,
    ChatSessionId,
    ChatSessionOptions,
    ChatStatus,
    ChatToolCallFinished,
    ChatTurnFinished,
    ChatTurnStarted,
)
from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.runtime.runs import Page
from aqven.server.chat.extension import studio_chat_parts
from aqven.server.chat.router import ChatRouteContext, build_chat_router
from aqven.server.errors import install_error_handlers

from .fixtures import (
    MCP_URL,
    MODEL,
    ChatHarness,
    chat_harness,
    edit_and_check_turn,
    next_event,
    streamed_answer_turn,
    until_turn_finished,
)

BASE_URL: Final[str] = "http://127.0.0.1"


class OpenApiParameter(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    location: str = Field(alias="in")


OPENAPI_PATHS: Final[TypeAdapter[dict[str, dict[str, dict[str, JsonValue]]]]] = TypeAdapter(
    dict[str, dict[str, dict[str, JsonValue]]]
)
SESSION: Final[TypeAdapter[ChatSession]] = TypeAdapter(ChatSession)
PARAMETERS: Final[TypeAdapter[tuple[OpenApiParameter, ...]]] = TypeAdapter(tuple[OpenApiParameter, ...])
PAGE: Final[TypeAdapter[Page[ChatSession]]] = TypeAdapter(Page[ChatSession])


class MemoryBackendSettings:
    def __init__(self) -> None:
        self.value: JsonValue = None

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        if self.value is None:
            return None
        return SettingView(scope=scope, key=key, kind="value", value=self.value, updated_at=datetime.now(UTC))

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        self.value = value
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))


def chat_app(harness: ChatHarness) -> FastAPI:
    app = FastAPI(openapi_url="/api/openapi.json", docs_url=None, redoc_url=None)
    install_error_handlers(app)
    context = ChatRouteContext(harness.project_root, MCP_URL)
    registry = BackendRegistry({"claude": harness.backend}, BackendSelection(MemoryBackendSettings()))
    app.include_router(build_chat_router(registry, harness.journal, context))
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
    started, finished = events[0], events[-1]
    assert isinstance(started, ChatTurnStarted) and (started.backend, started.model) == ("claude", MODEL)
    assert isinstance(finished, ChatTurnFinished) and (finished.backend, finished.model) == ("claude", MODEL)
    sent = extras["sent"]
    assert isinstance(sent, dict) and sent["turn_id"] == events[0].turn_id
    status = extras["status"]
    assert isinstance(status, dict) and status["state"] == "logged_in"


def test_chat_backend_preference_routes_default_and_validate_choices(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())

    async def scenario() -> tuple[int, dict[str, object], int, dict[str, object], int]:
        async with client_for(chat_app(harness)) as client:
            initial = await client.get("/api/chat/backend")
            selected = await client.put("/api/chat/backend", json={"backend": "codex"})
            invalid = await client.put("/api/chat/backend", json={"backend": "other"})
            return initial.status_code, initial.json(), selected.status_code, selected.json(), invalid.status_code

    initial_code, initial, selected_code, selected, invalid_code = asyncio.run(scenario())

    assert (initial_code, initial) == (200, {"backend": "claude"})
    assert (selected_code, selected) == (200, {"backend": "codex"})
    assert invalid_code == 422


def test_resuming_claude_thread_ignores_new_codex_preference(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())

    async def scenario() -> tuple[int, dict[str, object]]:
        async with client_for(chat_app(harness)) as client:
            created = await client.post("/api/chat/sessions", json={"flow_id": "support_case"})
            session_id = created.json()["session_id"]
            await client.put("/api/chat/backend", json={"backend": "codex"})
            resumed = await client.post("/api/chat/sessions", json={"resume_session_id": session_id})
            return resumed.status_code, resumed.json()

    code, resumed = asyncio.run(scenario())
    assert code == 201
    assert resumed["backend"] == "claude"
    assert resumed["flow_id"] == "support_case"


def test_chat_routes_translate_failures_to_api_errors(tmp_path: Path) -> None:
    turn = [ApprovalStep(tool_name="Bash", tool_use_id="toolu_wait"), *streamed_answer_turn(tmp_path)]
    harness = chat_harness(tmp_path, ScriptedClientFactory([turn, streamed_answer_turn(tmp_path)]))

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
            during_turn = await client.post(
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
                "during_turn": during_turn,
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
        "during_turn": (202, ""),
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
        "chat_model_list",
        "chat_session_settings",
        "chat_backend_get",
        "chat_backend_put",
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
    listing = PARAMETERS.validate_python(operations["chat_session_list"]["parameters"])
    assert [(parameter.name, parameter.location) for parameter in listing] == [("flow_id", "query")]


def test_claude_chat_parts_wire_router_journal_and_shutdown(tmp_path: Path) -> None:
    parts = studio_chat_parts(tmp_path, MCP_URL, SecretStr("launch-token"), MemoryBackendSettings())
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


def test_chat_parts_create_codex_session_when_project_selects_codex(tmp_path: Path) -> None:
    settings = MemoryBackendSettings()
    settings.value = "codex"
    parts = studio_chat_parts(tmp_path, MCP_URL, SecretStr("launch-token"), settings)
    app = FastAPI()
    app.include_router(parts.router)

    async def scenario() -> tuple[int, str, str, tuple[str, ...]]:
        async with client_for(app) as client:
            response = await client.post("/api/chat/sessions", json={})
            session_id = response.json()["session_id"]
            await client.put("/api/chat/backend", json={"backend": "claude"})
            resumed = await client.post("/api/chat/sessions", json={"resume_session_id": session_id})
            await client.post("/api/chat/sessions", json={})
            listed = await client.get("/api/chat/sessions")
            return (
                response.status_code,
                response.json().get("backend", ""),
                resumed.json().get("backend", ""),
                tuple(item["backend"] for item in listed.json()["items"]),
            )

    assert asyncio.run(scenario()) == (201, "codex", "codex", ("claude", "codex"))
    asyncio.run(parts.codex.aclose())
    asyncio.run(parts.chat.aclose())


def test_chat_session_settings_change_the_open_thread(tmp_path: Path) -> None:
    settings = MemoryBackendSettings()
    settings.value = "codex"
    parts = studio_chat_parts(tmp_path, MCP_URL, SecretStr("launch-token"), settings)
    app = FastAPI()
    app.include_router(parts.router)

    async def scenario() -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
        async with client_for(app) as client:
            created = (await client.post("/api/chat/sessions", json={})).json()
            session_id = created["session_id"]
            patched = await client.patch(
                f"/api/chat/sessions/{session_id}",
                json={"model": "gpt-5.6-sol", "effort": "high", "permission_mode": "trust"},
            )
            fetched = await client.get(f"/api/chat/sessions/{session_id}")
            return created, patched.json(), fetched.json()

    created, patched, fetched = asyncio.run(scenario())
    assert (created["model"], created["effort"]) == (None, None)
    assert (patched["model"], patched["effort"], patched["permission_mode"]) == ("gpt-5.6-sol", "high", "trust")
    assert (fetched["model"], fetched["effort"], fetched["permission_mode"]) == ("gpt-5.6-sol", "high", "trust")
    asyncio.run(parts.codex.aclose())
    asyncio.run(parts.chat.aclose())


def test_chat_session_settings_leave_untouched_fields_alone(tmp_path: Path) -> None:
    settings = MemoryBackendSettings()
    settings.value = "codex"
    parts = studio_chat_parts(tmp_path, MCP_URL, SecretStr("launch-token"), settings)
    app = FastAPI()
    app.include_router(parts.router)

    async def scenario() -> dict[str, object]:
        async with client_for(app) as client:
            created = (await client.post("/api/chat/sessions", json={"model": "gpt-5.6-sol", "effort": "low"})).json()
            await client.patch(f"/api/chat/sessions/{created['session_id']}", json={"permission_mode": "plan"})
            return (await client.get(f"/api/chat/sessions/{created['session_id']}")).json()

    fetched = asyncio.run(scenario())
    assert (fetched["model"], fetched["effort"], fetched["permission_mode"]) == ("gpt-5.6-sol", "low", "plan")
    asyncio.run(parts.codex.aclose())
    asyncio.run(parts.chat.aclose())


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def test_chat_sessions_carry_a_flow_label_and_list_filters_by_it(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())

    async def scenario() -> tuple[JsonValue, JsonValue, JsonValue]:
        async with client_for(chat_app(harness)) as client:
            labelled = await client.post("/api/chat/sessions", json={"flow_id": "support_case"})
            await client.post("/api/chat/sessions", json={"flow_id": "weekly_digest"})
            await client.post("/api/chat/sessions", json={})
            session_id = ChatSessionId(labelled.json()["session_id"])
            fetched = await client.get(f"/api/chat/sessions/{session_id}")
            filtered = await client.get("/api/chat/sessions", params={"flow_id": "support_case"})
            everything = await client.get("/api/chat/sessions")
            return fetched.json(), filtered.json(), everything.json()

    fetched, filtered, everything = asyncio.run(scenario())
    filtered_page = PAGE.validate_python(filtered)
    everything_page = PAGE.validate_python(everything)
    created = SESSION.validate_python(fetched)

    assert created.flow_id == "support_case"
    assert [item.flow_id for item in filtered_page.items] == ["support_case"]
    assert filtered_page.total_estimate == 1
    assert [item.flow_id for item in everything_page.items] == [None, "weekly_digest", "support_case"]
    assert [item.session_id for item in filtered_page.items] == [created.session_id]


def test_chat_approvals_answered_over_http_allow_and_deny_the_tool_calls(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([edit_and_check_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        async with client_for(chat_app(harness)) as client:
            session_id = ChatSessionId((await client.post("/api/chat/sessions", json={})).json()["session_id"])
            events = harness.backend.events(session_id)
            await client.post(
                f"/api/chat/sessions/{session_id}/messages", json={"text": "edit", "client_op_id": "op-1"}
            )
            edit_request, before_edit = await next_event(events, ChatApprovalRequested)
            allowed = await client.post(
                f"/api/chat/sessions/{session_id}/approvals/{edit_request.approval_id}", json={"decision": "allow"}
            )
            check_request, before_check = await next_event(events, ChatApprovalRequested)
            denied = await client.post(
                f"/api/chat/sessions/{session_id}/approvals/{check_request.approval_id}",
                json={"decision": "deny", "message": "not now"},
            )
            _, rest = await until_turn_finished(events)
            await harness.backend.aclose()
            assert (allowed.status_code, denied.status_code) == (200, 200)
            return [*before_edit, *before_check, *rest]

    seen = asyncio.run(scenario())
    refusal = factory.clients[0].permissions[1]

    assert [(event.decision, event.resolved_by) for event in of_type(seen, ChatApprovalResolved)] == [
        ("allow", "user"),
        ("deny", "user"),
    ]
    assert isinstance(refusal, PermissionResultDeny) and refusal.message == "not now"
    assert {event.tool_call_id: event.status for event in of_type(seen, ChatToolCallFinished)} == {
        "toolu_edit": "ok",
        "toolu_check": "denied",
        "toolu_bash": "ok",
    }
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["end_turn"]


def test_chat_interrupt_over_http_resolves_the_pending_approval(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([edit_and_check_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[list[ChatEvent], JsonValue]:
        async with client_for(chat_app(harness)) as client:
            session_id = ChatSessionId((await client.post("/api/chat/sessions", json={})).json()["session_id"])
            events = harness.backend.events(session_id)
            await client.post(
                f"/api/chat/sessions/{session_id}/messages", json={"text": "edit", "client_op_id": "op-1"}
            )
            _, before = await next_event(events, ChatApprovalRequested)
            interrupted = await client.post(f"/api/chat/sessions/{session_id}/interrupt")
            _, after = await until_turn_finished(events)
            await harness.backend.aclose()
            return [*before, *after], interrupted.json()

    seen, interrupted = asyncio.run(scenario())
    session = SESSION.validate_python(interrupted)

    assert [(event.decision, event.resolved_by) for event in of_type(seen, ChatApprovalResolved)] == [
        ("deny", "interrupt")
    ]
    assert "interrupting" in [event.state for event in of_type(seen, ChatStatus)]
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["interrupted"]
    assert factory.clients[0].interrupts == 1
    assert session.session_id == seen[0].session_id
