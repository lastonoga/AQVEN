import asyncio
import threading
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from typing import Final

import pytest
from claude_agent_sdk import ClaudeAgentOptions, Message
from fastapi import FastAPI
from openai_codex.client import ApprovalHandler, CodexClient, CodexConfig
from openai_codex.generated.v2_all import Turn, TurnCompletedNotification, TurnInterruptResponse, TurnStatus
from openai_codex.models import Notification
from pydantic import SecretStr

from aqven.chat import claude_runner
from aqven.chat.agent import CLAUDE_AGENT
from aqven.chat.builders import status_changed, turn_finished, turn_started
from aqven.chat.codex_backend import CodexAgentBackend
from aqven.chat.feed import ChatSignals
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.chat.testing import ScriptedClaudeClient, ScriptedClientFactory, ScriptTurn, interrupted_result
from aqven.chat.turn_settling import TurnSettler, UnsettledTurn
from aqven.ports.chat import (
    ChatEvent,
    ChatMessageDelivered,
    ChatMessageQueued,
    ChatMessageRequest,
    ChatSessionId,
    ChatSessionOptions,
    ChatState,
    ChatStatus,
    ChatTurnFinished,
    ChatTurnId,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId
from aqven.server.chat import studio_chat_parts

from .fixtures import (
    EVENT_WAIT_SECONDS,
    MCP_URL,
    SDK_SESSION,
    ChatHarness,
    block_delta,
    block_start,
    block_stop,
    chat_harness,
    chat_session,
    fixed_clock,
    message_start,
    next_event,
    result,
    streamed_answer_turn,
    until_turn_finished,
)
from .test_chat_router import MemoryBackendSettings
from .test_codex_backend import FakeCodexClient

OPEN_TURN: Final = ChatTurnId("turn-open")
ENDED_TURN: Final = ChatTurnId("turn-ended")


def message(text: str, op: str) -> ChatMessageRequest:
    return ChatMessageRequest(text=text, client_op_id=ClientOpId(op))


def of_type[E](events: Sequence[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def states(events: Sequence[ChatEvent]) -> list[ChatState]:
    return [event.state for event in of_type(events, ChatStatus)]


def background_wakeup() -> list[Message]:
    return [
        message_start("msg_background"),
        block_start(0, {"type": "text", "text": ""}),
        block_delta(0, {"type": "text_delta", "text": "The background build finished."}),
        block_stop(0),
    ]


def wake(client: ScriptedClaudeClient) -> None:
    for step in background_wakeup():
        client.push(step)


def leave_working(journal: SqliteChatJournal, session_id: ChatSessionId, state: ChatState = "running_tool") -> None:
    journal.append(session_id, ENDED_TURN, turn_started(ClientOpId("op-ended"), "build it", CLAUDE_AGENT))
    journal.append(session_id, ENDED_TURN, status_changed("thinking"))
    journal.append(session_id, ENDED_TURN, status_changed("idle"))
    journal.append(session_id, ENDED_TURN, turn_finished("end_turn", 10, None, CLAUDE_AGENT))
    journal.append(session_id, None, status_changed("thinking"))
    journal.append(session_id, None, status_changed(state))


def leave_turn_open(journal: SqliteChatJournal, session_id: ChatSessionId) -> None:
    journal.append(session_id, OPEN_TURN, turn_started(ClientOpId("op-open"), "run the flow", CLAUDE_AGENT))
    journal.append(session_id, OPEN_TURN, status_changed("thinking"))
    journal.append(session_id, OPEN_TURN, status_changed("running_tool"))


def tail_after(journal: SqliteChatJournal, session_id: ChatSessionId, seq: int) -> tuple[ChatEvent, ...]:
    return journal.read(session_id, seq, 100)


def last_seq(journal: SqliteChatJournal, session_id: ChatSessionId) -> int:
    stored = journal.get_session(session_id)
    assert stored is not None
    return stored.session.last_seq


async def answered(harness: ChatHarness, events: AsyncIterator[ChatEvent], session_id: ChatSessionId) -> None:
    await harness.backend.send_message(session_id, message("hello", "op-1"))
    await until_turn_finished(events)


def test_agent_waking_after_its_turn_opens_a_continuation_turn_that_stop_interrupts(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[ChatTurnStarted, ChatTurnFinished, list[ChatEvent]]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await answered(harness, events, session.session_id)
        wake(factory.clients[0])
        started, _ = await next_event(events, ChatTurnStarted)
        await harness.backend.interrupt(session.session_id)
        factory.clients[0].push(interrupted_result())
        finished, tail = await until_turn_finished(events)
        await harness.backend.aclose()
        return started, finished, tail

    started, finished, tail = asyncio.run(scenario())

    assert (started.origin, started.text, started.turn_id is not None) == ("continuation", "", True)
    assert (finished.stop_reason, finished.turn_id, finished.reason) == ("interrupted", started.turn_id, None)
    assert all(event.turn_id == started.turn_id for event in tail)
    assert "interrupting" in states(tail) and states(tail)[-1] == "idle"
    assert factory.clients[0].interrupts == 1


def test_a_message_sent_while_the_agent_continues_on_its_own_is_read_inside_that_turn(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[ChatTurnStarted, ChatTurnId, list[ChatEvent], ChatTurnFinished]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await answered(harness, events, session.session_id)
        wake(factory.clients[0])
        started, _ = await next_event(events, ChatTurnStarted)
        accepted = await harness.backend.send_message(session.session_id, message("also run the tests", "op-2"))
        _, seen = await next_event(events, ChatMessageDelivered)
        factory.clients[0].push(result())
        finished, tail = await until_turn_finished(events)
        await harness.backend.aclose()
        return started, accepted, [*seen, *tail], finished

    started, accepted, seen, finished = asyncio.run(scenario())

    assert accepted == started.turn_id
    assert [(event.client_op_id, event.delivery, event.turn_id) for event in of_type(seen, ChatMessageQueued)] == [
        ("op-2", "next_step", started.turn_id)
    ]
    assert [(event.client_op_id, event.turn_id) for event in of_type(seen, ChatMessageDelivered)] == [
        ("op-2", started.turn_id)
    ]
    assert of_type(seen, ChatTurnStarted) == []
    assert (finished.turn_id, finished.stop_reason) == (started.turn_id, "end_turn")
    assert [prompt.text for prompt in factory.clients[0].queued] == ["also run the tests"]


def test_a_second_stop_closes_a_turn_the_agent_never_confirms_and_the_next_message_resumes(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)], [streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[ChatTurnFinished, list[ChatEvent], ChatTurnFinished]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await answered(harness, events, session.session_id)
        wake(factory.clients[0])
        await next_event(events, ChatTurnStarted)
        await harness.backend.interrupt(session.session_id)
        await harness.backend.interrupt(session.session_id)
        forced, tail = await until_turn_finished(events)
        await harness.backend.send_message(session.session_id, message("go on", "op-2"))
        resumed, _ = await until_turn_finished(events)
        await harness.backend.aclose()
        return forced, tail, resumed

    forced, tail, resumed = asyncio.run(scenario())
    first, second = factory.clients

    assert (forced.stop_reason, forced.reason) == ("interrupted", "stop_forced")
    assert states(tail)[-1] == "idle"
    assert (first.interrupts, first.disconnects) == (1, 1)
    assert (resumed.stop_reason, second.options.resume) == ("end_turn", SDK_SESSION)


class DeafClaudeClient(ScriptedClaudeClient):
    async def interrupt(self) -> None:
        await super().interrupt()
        await asyncio.Event().wait()


def test_a_stop_the_agent_never_acknowledges_closes_the_turn(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(claude_runner, "INTERRUPT_ACK_SECONDS", 0.05)
    clients: list[DeafClaudeClient] = []
    turns: list[ScriptTurn] = [streamed_answer_turn(tmp_path)]

    def factory(options: ClaudeAgentOptions) -> DeafClaudeClient:
        client = DeafClaudeClient(options, turns)
        clients.append(client)
        return client

    harness = chat_harness(tmp_path, factory)

    async def scenario() -> ChatTurnFinished:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await answered(harness, events, session.session_id)
        wake(clients[0])
        await next_event(events, ChatTurnStarted)
        await harness.backend.interrupt(session.session_id)
        finished, _ = await until_turn_finished(events)
        await harness.backend.aclose()
        return finished

    finished = asyncio.run(scenario())

    assert (finished.stop_reason, finished.reason) == ("interrupted", "stop_forced")
    assert (clients[0].interrupts, clients[0].disconnects) == (1, 1)


def test_stop_without_a_live_agent_settles_a_thread_left_working(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())

    async def scenario() -> tuple[tuple[ChatEvent, ...], UnsettledTurn | None]:
        session = await harness.backend.start_session(harness.options())
        leave_working(harness.journal, session.session_id)
        before = last_seq(harness.journal, session.session_id)
        await harness.backend.interrupt(session.session_id)
        await harness.backend.interrupt(session.session_id)
        tail = tail_after(harness.journal, session.session_id, before)
        return tail, harness.journal.unsettled_turn(session.session_id)

    tail, after = asyncio.run(scenario())

    assert states(tail) == ["idle"]
    finished = of_type(tail, ChatTurnFinished)
    assert [(event.stop_reason, event.reason, event.turn_id) for event in finished] == [
        ("interrupted", "agent_lost", None)
    ]
    assert after is None


def test_stop_on_an_idle_runner_settles_a_thread_it_lost_track_of(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory([streamed_answer_turn(tmp_path)]))

    async def scenario() -> tuple[ChatEvent, ...]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await answered(harness, events, session.session_id)
        leave_turn_open(harness.journal, session.session_id)
        before = last_seq(harness.journal, session.session_id)
        await harness.backend.interrupt(session.session_id)
        await harness.backend.aclose()
        return tail_after(harness.journal, session.session_id, before)

    tail = asyncio.run(scenario())

    assert states(tail) == ["idle"]
    assert [(event.reason, event.turn_id) for event in of_type(tail, ChatTurnFinished)] == [("agent_lost", OPEN_TURN)]


def test_closing_or_stopping_the_server_settles_threads_left_working(tmp_path: Path) -> None:
    harness = chat_harness(
        tmp_path, ScriptedClientFactory([streamed_answer_turn(tmp_path)], [streamed_answer_turn(tmp_path)])
    )

    async def scenario() -> tuple[tuple[ChatEvent, ...], tuple[ChatEvent, ...], bool]:
        closing = await harness.backend.start_session(harness.options())
        stopping = await harness.backend.start_session(harness.options())
        for session in (closing, stopping):
            await answered(harness, harness.backend.events(session.session_id), session.session_id)
            leave_working(harness.journal, session.session_id)
        closing_seq = last_seq(harness.journal, closing.session_id)
        stopping_seq = last_seq(harness.journal, stopping.session_id)
        await harness.backend.close_session(closing.session_id)
        await harness.backend.aclose()
        stored = harness.journal.get_session(closing.session_id)
        return (
            tail_after(harness.journal, closing.session_id, closing_seq),
            tail_after(harness.journal, stopping.session_id, stopping_seq),
            stored is not None and stored.closed,
        )

    closed_tail, stopped_tail, closed = asyncio.run(scenario())

    assert [event.reason for event in of_type(closed_tail, ChatTurnFinished)] == ["agent_lost"]
    assert [event.reason for event in of_type(stopped_tail, ChatTurnFinished)] == ["server_stopped"]
    assert states(closed_tail) == states(stopped_tail) == ["idle"]
    assert closed


def test_shutdown_stops_a_continuation_turn_as_server_stopped(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[ChatTurnStarted, tuple[ChatEvent, ...]]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await answered(harness, events, session.session_id)
        wake(factory.clients[0])
        started, _ = await next_event(events, ChatTurnStarted)
        await harness.backend.aclose()
        return started, tail_after(harness.journal, session.session_id, started.seq)

    started, tail = asyncio.run(scenario())
    finished = of_type(tail, ChatTurnFinished)

    assert [(event.turn_id, event.reason) for event in finished] == [(started.turn_id, "server_stopped")]
    assert states(tail)[-1] == "idle"


def test_server_start_settles_every_thread_a_dead_server_left_working(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    stuck = journal.create_session(chat_session("stuck", tmp_path), MCP_URL).session_id
    open_turn = journal.create_session(chat_session("open", tmp_path), MCP_URL).session_id
    calm = journal.create_session(chat_session("calm", tmp_path), MCP_URL).session_id
    leave_working(journal, stuck)
    leave_turn_open(journal, open_turn)
    leave_working(journal, calm, "idle")
    seqs = {session_id: last_seq(journal, session_id) for session_id in (stuck, open_turn, calm)}
    journal.close()
    parts = studio_chat_parts(tmp_path, MCP_URL, SecretStr("launch-token"), MemoryBackendSettings())

    async def lifecycle() -> None:
        async with parts.lifespan(FastAPI()):
            return

    asyncio.run(lifecycle())
    reopened = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    tails = {session_id: tail_after(reopened, session_id, seq) for session_id, seq in seqs.items()}
    reopened.close()

    assert [(event.reason, event.turn_id) for event in of_type(tails[stuck], ChatTurnFinished)] == [
        ("server_restarted", None)
    ]
    assert [(event.reason, event.turn_id) for event in of_type(tails[open_turn], ChatTurnFinished)] == [
        ("server_restarted", OPEN_TURN)
    ]
    assert tails[calm] == ()


def test_the_ledger_reads_the_state_studio_folds(tmp_path: Path) -> None:
    journal = SqliteChatJournal.for_project(tmp_path, fixed_clock)
    session = journal.create_session(chat_session("ledger", tmp_path), MCP_URL).session_id
    empty = journal.unsettled_turn(session)
    leave_turn_open(journal, session)
    working = journal.unsettled_turn(session)
    settled = TurnSettler(journal, ChatSignals(), fixed_clock).sweep("server_restarted")
    again = TurnSettler(journal, ChatSignals(), fixed_clock).sweep("server_restarted")
    journal.close()

    assert empty is None
    assert working == UnsettledTurn(state="running_tool", turn_id=OPEN_TURN, started_at=fixed_clock())
    assert (settled, again) == ((session,), ())


class StuckCodexClient(FakeCodexClient):
    def __init__(self, config: CodexConfig, approval_handler: ApprovalHandler, release: threading.Event) -> None:
        super().__init__(config, approval_handler)
        self.release = release

    def next_turn_notification(self, turn_id: str) -> Notification:
        self.calls.append("next")
        self.release.wait(EVENT_WAIT_SECONDS)
        completed = TurnCompletedNotification.model_construct(
            thread_id="codex-thread-1",
            turn=Turn.model_construct(id=turn_id, status=TurnStatus.interrupted, duration_ms=7, items=[]),
        )
        return Notification("turn/completed", completed)

    def turn_interrupt(self, thread_id: str, turn_id: str) -> TurnInterruptResponse:
        self.calls.append("turn/interrupt")
        self.release.wait(EVENT_WAIT_SECONDS)
        return TurnInterruptResponse.model_construct()


async def called(clients: Sequence[FakeCodexClient], call: str) -> None:
    async with asyncio.timeout(EVENT_WAIT_SECONDS):
        while not any(call in client.calls for client in clients):
            await asyncio.sleep(0.01)


def codex_options(project_root: Path) -> ChatSessionOptions:
    return ChatSessionOptions(project_root=str(project_root), mcp_url=MCP_URL, model=None)


def test_a_second_stop_closes_a_codex_turn_whose_interrupt_never_returns(tmp_path: Path) -> None:
    release = threading.Event()
    clients: list[StuckCodexClient] = []

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = StuckCodexClient(config, approval_handler, release)
        clients.append(client)
        return client

    journal = SqliteChatJournal(tmp_path / "chat.sqlite", fixed_clock)
    backend = CodexAgentBackend(journal, tmp_path, MCP_URL, SecretStr("token"), client_factory=factory)

    async def scenario() -> tuple[ChatEvent, ...]:
        session = await backend.start_session(codex_options(tmp_path))
        await backend.send_message(session.session_id, message("wait", "op-1"))
        await called(clients, "next")
        first = asyncio.create_task(backend.interrupt(session.session_id))
        await called(clients, "turn/interrupt")
        await backend.interrupt(session.session_id)
        events = journal.read(session.session_id, 0, 100)
        release.set()
        await first
        await backend.aclose()
        return events

    events = asyncio.run(scenario())
    journal.close()

    assert [(event.stop_reason, event.reason) for event in of_type(events, ChatTurnFinished)] == [
        ("interrupted", "stop_forced")
    ]
    assert states(events)[-1] == "idle"
    assert "close" in clients[0].calls


def test_codex_stop_after_a_restart_settles_a_thread_left_working(tmp_path: Path) -> None:
    journal = SqliteChatJournal(tmp_path / "chat.sqlite", fixed_clock)
    backend = CodexAgentBackend(journal, tmp_path, MCP_URL, SecretStr("token"), client_factory=FakeCodexClient)

    async def scenario() -> tuple[ChatEvent, ...]:
        session = await backend.start_session(codex_options(tmp_path))
        leave_turn_open(journal, session.session_id)
        before = last_seq(journal, session.session_id)
        await backend.interrupt(session.session_id)
        await backend.aclose()
        return tail_after(journal, session.session_id, before)

    tail = asyncio.run(scenario())
    journal.close()
    finished = of_type(tail, ChatTurnFinished)

    assert states(tail) == ["idle"]
    assert [(event.reason, event.turn_id, event.backend) for event in finished] == [("agent_lost", OPEN_TURN, "codex")]
