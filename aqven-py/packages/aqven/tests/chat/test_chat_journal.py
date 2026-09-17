import asyncio
import stat
from pathlib import Path

import pytest

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

from .fixtures import FIXED_NOW, MCP_URL, fixed_clock


def new_session(session_id: str, project_root: Path) -> ChatSession:
    return ChatSession(
        session_id=ChatSessionId(session_id),
        backend="claude",
        project_root=str(project_root),
        model=None,
        permission_mode="accept_edits",
        created_at=FIXED_NOW,
        last_seq=0,
    )


def test_journal_persists_sessions_and_events_with_monotonic_seq(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    session_id = ChatSessionId("chat-1")
    journal.create_session(new_session(session_id, tmp_path), MCP_URL)
    turn = ChatTurnId("turn-1")

    first = journal.append(session_id, turn, turn_started(ClientOpId("op-1"), "hi"))
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
