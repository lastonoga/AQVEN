import asyncio
import json
import sqlite3
import stat
from contextlib import closing
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.chat.agent import CLAUDE_AGENT
from aqven.chat.approvals import ApprovalRegistry, await_verdict
from aqven.chat.builders import status_changed, text_delta, turn_started
from aqven.chat.errors import ChatFailure
from aqven.chat.feed import ChatEmitter, ChatSignals, follow_chat_events
from aqven.chat.sqlite_journal import PROJECT_APP_DATABASE, SqliteChatJournal
from aqven.ports.chat import (
    ApprovalAnswer,
    ChatApprovalId,
    ChatEvent,
    ChatMessageId,
    ChatSession,
    ChatSessionId,
    ChatStatus,
    ChatTextDelta,
    ChatTurnId,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId
from aqven.spec import FlowId

from .fixtures import FIXED_NOW, MCP_URL, chat_session, fixed_clock


def new_session(session_id: str, project_root: Path, flow_id: FlowId | None = None) -> ChatSession:
    return chat_session(session_id, project_root, flow_id, model=None, permission_mode="accept_edits")


def test_journal_persists_sessions_and_events_with_monotonic_seq(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    session_id = ChatSessionId("chat-1")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)
    turn = ChatTurnId("turn-1")

    first = journal.append(session_id, turn, turn_started(ClientOpId("op-1"), "hi", CLAUDE_AGENT))
    second = journal.append(session_id, turn, text_delta(ChatMessageId("msg"), 0, "Hello"))
    journal.remember_backend_session(session_id, "sdk-session")
    journal.close()

    assert (tmp_path / PROJECT_APP_DATABASE).is_file()
    reopened = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    stored = reopened.get_session(session_id)
    assert stored is not None
    assert (first.seq, second.seq) == (1, 2)
    assert stored.session.last_seq == 2
    assert stored.backend_session_id == "sdk-session"
    assert stored.mcp_url == MCP_URL
    assert not stored.closed
    events = reopened.read(session_id, 0, 10)
    assert [type(event) for event in events] == [ChatTurnStarted, ChatTextDelta]
    assert [event.turn_id for event in events] == [turn, turn]
    assert reopened.read(session_id, 1, 10) == (second,)
    assert reopened.turn_of_operation(session_id, ClientOpId("op-1")) == turn
    assert reopened.turn_of_operation(session_id, ClientOpId("op-2")) is None
    assert [session.session_id for session in reopened.list_sessions()] == [session_id]


def test_journal_closes_and_reopens_sessions(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    session_id = ChatSessionId("chat-closed")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)

    journal.set_closed(session_id, FIXED_NOW)
    closed = journal.get_session(session_id)
    journal.set_closed(session_id, None)
    reopened = journal.get_session(session_id)

    assert closed is not None and closed.closed_at == FIXED_NOW
    assert reopened is not None and not reopened.closed


def test_journal_refuses_events_of_unknown_session(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)

    with pytest.raises(ChatFailure) as failure:
        journal.append(ChatSessionId("missing"), None, status_changed("idle"))

    assert failure.value.code == "NOT_FOUND"
    assert journal.get_session(ChatSessionId("missing")) is None


def test_follow_replays_history_streams_live_events_and_stops_on_close(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    signals = ChatSignals()
    session_id = ChatSessionId("chat-live")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)
    emitter = ChatEmitter(journal, signals, session_id)
    emitter.emit((status_changed("thinking"), status_changed("streaming")))

    async def scenario() -> list[ChatEvent]:
        received: list[ChatEvent] = []

        async def consume() -> None:
            async for event in follow_chat_events(journal, signals, session_id, 1, idle_seconds=5.0):
                received.append(event)

        consumer = asyncio.create_task(consume())
        await asyncio.sleep(0.05)
        emitter.emit((status_changed("idle"),))
        await asyncio.sleep(0.05)
        journal.set_closed(session_id, FIXED_NOW)
        signals.notify(session_id)
        async with asyncio.timeout(2.0):
            await consumer
        return received

    received = asyncio.run(scenario())

    assert [event.seq for event in received] == [2, 3]
    assert [event.state for event in received if isinstance(event, ChatStatus)] == ["streaming", "idle"]


def test_follow_stops_promptly_on_shutdown_signal_without_closing_the_session(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    signals = ChatSignals()
    session_id = ChatSessionId("chat-shutdown")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)
    shutdown = asyncio.Event()

    async def scenario() -> None:
        async def consume() -> None:
            events = follow_chat_events(journal, signals, session_id, 0, idle_seconds=30.0, shutdown=shutdown)
            async for _event in events:
                pass

        consumer = asyncio.create_task(consume())
        await asyncio.sleep(0.05)
        assert not consumer.done()
        shutdown.set()
        async with asyncio.timeout(1.0):
            await consumer

    asyncio.run(scenario())
    stored = journal.get_session(session_id)
    assert stored is not None
    assert not stored.closed


def test_approval_registry_answers_only_matching_session() -> None:
    async def scenario() -> tuple[bool, bool, str, int, str]:
        registry = ApprovalRegistry()
        session = ChatSessionId("chat-a")
        approval = ChatApprovalId("approval-1")
        future = registry.open(session, approval)
        wrong = registry.answer(ChatSessionId("chat-b"), ApprovalAnswer(approval_id=approval, decision="allow"))
        right = registry.answer(session, ApprovalAnswer(approval_id=approval, decision="deny", message="no"))
        verdict = await await_verdict(future, 1.0)
        registry.discard(approval)
        other = registry.open(session, ChatApprovalId("approval-2"))
        forced = registry.resolve_session(session, "session_closed")
        closed = await await_verdict(other, 1.0)
        return wrong, right, f"{verdict.decision}:{verdict.message}:{verdict.resolved_by}", forced, closed.resolved_by

    wrong, right, verdict, forced, closed_by = asyncio.run(scenario())

    assert (wrong, right) == (False, True)
    assert verdict == "deny:no:user"
    assert (forced, closed_by) == (1, "session_closed")


def test_approval_wait_times_out_as_interrupt() -> None:
    async def scenario() -> str:
        registry = ApprovalRegistry()
        future = registry.open(ChatSessionId("chat"), ChatApprovalId("approval"))
        verdict = await await_verdict(future, 0.01)
        return f"{verdict.decision}:{verdict.resolved_by}"

    assert asyncio.run(scenario()) == "deny:interrupt"


def test_database_file_is_not_world_writable(tmp_path: Path) -> None:
    SqliteChatJournal.for_project(tmp_path, fixed_clock).close()

    mode = (tmp_path / PROJECT_APP_DATABASE).stat().st_mode

    assert not mode & stat.S_IWOTH


LEGACY_SESSIONS: Final = """
    CREATE TABLE chat_sessions (
        session_id TEXT PRIMARY KEY,
        backend TEXT NOT NULL,
        project_root TEXT NOT NULL,
        model TEXT,
        permission_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seq INTEGER NOT NULL DEFAULT 0,
        mcp_url TEXT NOT NULL,
        backend_session_id TEXT,
        closed_at TEXT
    )
"""
LEGACY_EVENTS: Final = """
    CREATE TABLE chat_events (
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        turn_id TEXT,
        client_op_id TEXT,
        at TEXT NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
    )
"""
LEGACY_TURN: Final[dict[str, JsonValue]] = {
    "type": "chat_turn_started",
    "seq": 1,
    "at": FIXED_NOW.isoformat(),
    "session_id": "chat-old",
    "turn_id": "turn-old",
    "client_op_id": "op-old",
    "text": "hi",
}


def test_journal_stores_the_flow_label_and_filters_sessions_by_it(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    journal.create_session(new_session("chat-support", tmp_path, FlowId("support_case")), MCP_URL)
    journal.create_session(new_session("chat-digest", tmp_path, FlowId("weekly_digest")), MCP_URL)
    journal.create_session(new_session("chat-plain", tmp_path), MCP_URL)
    journal.close()

    reopened = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    stored = reopened.get_session(ChatSessionId("chat-support"))
    labelled = reopened.list_sessions(FlowId("support_case"))
    everything = reopened.list_sessions()

    assert stored is not None and stored.session.flow_id == "support_case"
    assert [session.session_id for session in labelled] == ["chat-support"]
    assert [session.flow_id for session in everything] == ["support_case", None, "weekly_digest"]
    assert reopened.list_sessions(FlowId("unknown_flow")) == ()


def test_journal_upgrades_a_database_written_before_the_flow_label(tmp_path: Path) -> None:
    path = tmp_path / PROJECT_APP_DATABASE
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute(LEGACY_SESSIONS)
        connection.execute(LEGACY_EVENTS)
        connection.execute(
            "INSERT INTO chat_sessions (session_id, backend, project_root, model, permission_mode, created_at,"
            " last_seq, mcp_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("chat-old", "claude", str(tmp_path), None, "default", FIXED_NOW.isoformat(), 1, MCP_URL),
        )
        connection.execute(
            "INSERT INTO chat_events (session_id, seq, type, turn_id, client_op_id, at, body)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("chat-old", 1, "chat_turn_started", "turn-old", "op-old", FIXED_NOW.isoformat(), json.dumps(LEGACY_TURN)),
        )

    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    stored = journal.get_session(ChatSessionId("chat-old"))
    events = journal.read(ChatSessionId("chat-old"), 0, 10)
    appended = journal.append(ChatSessionId("chat-old"), ChatTurnId("turn-new"), status_changed("thinking"))
    journal.close()

    assert stored is not None and stored.session.flow_id is None
    assert len(events) == 1
    started = events[0]
    assert isinstance(started, ChatTurnStarted)
    assert (started.backend, started.model, started.text) == ("claude", None, "hi")
    assert appended.seq == 2


def _store_body(database: Path, session_id: str, seq: int, kind: str, body: JsonValue) -> None:
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute(
            "INSERT INTO chat_events (session_id, seq, type, turn_id, client_op_id, at, body)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_id, seq, kind, "turn-1", None, FIXED_NOW.isoformat(), json.dumps(body)),
        )
        connection.execute("UPDATE chat_sessions SET last_seq = ? WHERE session_id = ?", (seq, session_id))


def test_a_turn_written_before_the_backend_fields_still_reads(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    session_id = ChatSessionId("chat-legacy")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)
    journal.close()
    body: JsonValue = {
        "seq": 1,
        "at": FIXED_NOW.isoformat(),
        "session_id": session_id,
        "turn_id": "turn-1",
        "type": "chat_turn_started",
        "client_op_id": "op-1",
        "text": "hi",
    }
    _store_body(tmp_path / PROJECT_APP_DATABASE, session_id, 1, "chat_turn_started", body)

    events = SqliteChatJournal.for_project(tmp_path, fixed_clock).read(session_id, 0, 10)

    assert len(events) == 1
    started = events[0]
    assert isinstance(started, ChatTurnStarted)
    assert (started.backend, started.model) == ("claude", None)


def test_an_unreadable_event_is_skipped_and_the_rest_are_served(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    session_id = ChatSessionId("chat-broken")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)
    journal.append(session_id, ChatTurnId("turn-1"), text_delta(ChatMessageId("msg"), 0, "Hello"))
    journal.close()
    broken: JsonValue = {"seq": 2, "type": "chat_text_delta"}
    _store_body(tmp_path / PROJECT_APP_DATABASE, session_id, 2, "chat_text_delta", broken)

    events = SqliteChatJournal.for_project(tmp_path, fixed_clock).read(session_id, 0, 10)

    assert [event.type for event in events] == ["chat_text_delta"]
    assert isinstance(events[0], ChatTextDelta)
