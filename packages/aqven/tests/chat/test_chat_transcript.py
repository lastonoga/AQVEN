import asyncio
import sqlite3
from pathlib import Path
from typing import Final

import httpx2
from fastapi import FastAPI
from pydantic import JsonValue

from aqven.chat.agent import CLAUDE_AGENT
from aqven.chat.backend_registry import BackendRegistry
from aqven.chat.backend_selection import BackendSelection
from aqven.chat.builders import (
    Clip,
    approval_requested,
    error_raised,
    message_delivered,
    message_queued,
    reasoning_delta,
    status_changed,
    text_delta,
    tool_call_args_delta,
    tool_call_finished,
    tool_call_started,
    turn_finished,
    turn_started,
    usage_reported,
)
from aqven.chat.sqlite_journal import project_app_database
from aqven.chat.sqlite_transcripts import SNAPSHOT_TABLE, SqliteChatTranscripts
from aqven.chat.testing import ScriptedClientFactory
from aqven.chat.tool_names import ToolIdentity
from aqven.chat.transcript import TurnSpan, TurnStart, boundary_carry, turn_spans, turn_window
from aqven.chat.transcript_fold import (
    FOLD_VERSION,
    coalesce_delta_runs,
    drop_overwritten_args,
    drop_superseded_states,
    fold_turn,
    opened_messages,
)
from aqven.ports.chat import (
    ChatApprovalId,
    ChatEvent,
    ChatMessageId,
    ChatReasoningDelta,
    ChatTextDelta,
    ChatToolCallArgsDelta,
    ChatToolCallId,
    ChatTurnId,
    ChatUsage,
)
from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.runtime.address import ClientOpId
from aqven.server.chat.router import ChatRouteContext, build_chat_router
from aqven.server.errors import install_error_handlers

from .fixtures import chat_harness
from .transcript_parity import MCP_URL, STARTED_AT, ScriptedJournal
from .transcript_parity import PARITY_SESSION as SESSION

MESSAGE: Final[ChatMessageId] = ChatMessageId("msg_one")
ANSWER: Final[ChatMessageId] = ChatMessageId("msg_two")
TOOL: Final[ChatToolCallId] = ChatToolCallId("toolu_one")
BASH: Final[ToolIdentity] = ToolIdentity("Bash", None)
USAGE: Final[ChatUsage] = ChatUsage(
    model="claude-opus",
    tokens_in=3,
    tokens_out=40,
    thinking_tokens=12,
    cache_read_tokens=0,
    cache_write_tokens=0,
    cost_usd=None,
)
BASE_URL: Final[str] = "http://127.0.0.1"


def answered_turn(script: ScriptedJournal, turn: str, message: ChatMessageId) -> None:
    script.open_turn(turn, f"question {turn}")
    script.emit(
        status_changed("thinking"),
        reasoning_delta(message, 0, "weighing "),
        reasoning_delta(message, 0, "the flow"),
        status_changed("streaming"),
        text_delta(message, 1, "Two "),
        text_delta(message, 1, "flows."),
        usage_reported(USAGE, message),
        status_changed("idle"),
        turn_finished("end_turn", 10, USAGE, CLAUDE_AGENT),
    )


def stamped(events: tuple[ChatEvent, ...]) -> tuple[tuple[str, int], ...]:
    return tuple((event.type, event.seq) for event in events)


def test_a_run_of_deltas_folds_into_one_event_with_the_first_moment_and_the_last_seq(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    first, second, other, third = script.emit(
        text_delta(MESSAGE, 0, "Hel"),
        text_delta(MESSAGE, 0, "lo"),
        text_delta(MESSAGE, 1, "next part"),
        text_delta(MESSAGE, 0, " again"),
    )

    folded = coalesce_delta_runs((first, second, other, third))

    assert len(folded) == 3
    joined = folded[0]
    assert isinstance(joined, ChatTextDelta)
    assert (joined.delta, joined.seq, joined.at) == ("Hello", second.seq, first.at)
    assert folded[1:] == (other, third)


def test_reasoning_and_args_runs_fold_by_their_own_keys(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    events = script.emit(
        reasoning_delta(MESSAGE, 0, "a"),
        reasoning_delta(MESSAGE, 0, "b"),
        tool_call_started(MESSAGE, TOOL, BASH),
        tool_call_args_delta(TOOL, '{"command": '),
        tool_call_args_delta(TOOL, '"ls"}'),
    )

    folded = coalesce_delta_runs(events)

    reasoning, started, args = folded
    assert isinstance(reasoning, ChatReasoningDelta) and reasoning.delta == "ab"
    assert started == events[2]
    assert isinstance(args, ChatToolCallArgsDelta) and args.delta == '{"command": "ls"}'


def test_only_the_state_that_ends_a_turn_survives(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    script.open_turn("t1", "hello")
    events = script.emit(
        status_changed("thinking"),
        text_delta(MESSAGE, 0, "hi"),
        status_changed("idle"),
        turn_finished("end_turn", 5, None, CLAUDE_AGENT),
        status_changed("thinking"),
    )

    kept = drop_superseded_states(events)

    assert stamped(kept) == stamped((events[1], events[3], events[4]))


def test_args_streamed_before_the_recorded_input_are_dropped(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    events = script.emit(
        tool_call_started(MESSAGE, TOOL, BASH),
        tool_call_args_delta(TOOL, '{"command": "ls"}'),
        approval_requested(ChatApprovalId("ap-1"), TOOL, BASH, {"command": "ls"}, None),
        tool_call_args_delta(TOOL, "late"),
        tool_call_finished(TOOL, "ok", {"command": "ls"}, Clip("out", False)),
        tool_call_args_delta(TOOL, "after"),
    )

    kept = drop_overwritten_args(events)

    assert stamped(kept) == stamped((events[0], events[2], events[4], events[5]))


def test_fold_turn_applies_every_rule_and_names_the_messages_it_opens(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    answered_turn(script, "t1", MESSAGE)
    raw = script.journal.read(SESSION, 0, 100)

    folded = fold_turn(raw)

    assert [event.type for event in folded] == [
        "chat_turn_started",
        "chat_reasoning_delta",
        "chat_text_delta",
        "chat_usage",
        "chat_turn_finished",
    ]
    assert opened_messages(raw) == frozenset({MESSAGE})


def test_turn_spans_start_at_every_turn_and_keep_a_prelude() -> None:
    starts = (TurnStart(4, ChatTurnId("a")), TurnStart(9, ChatTurnId("b")))

    assert turn_spans(1, 12, starts) == (
        TurnSpan(1, 3, None),
        TurnSpan(4, 8, ChatTurnId("a")),
        TurnSpan(9, 12, ChatTurnId("b")),
    )
    assert turn_spans(4, 12, starts) == (TurnSpan(4, 8, ChatTurnId("a")), TurnSpan(9, 12, ChatTurnId("b")))


def test_the_window_reaches_back_to_the_turn_that_opened_a_continued_message() -> None:
    messages = (frozenset({"m1"}), frozenset({"m2"}), frozenset({"m3"}), frozenset({"m2", "m4"}), frozenset({"m5"}))

    assert turn_window(messages, 1).start == 4
    assert turn_window(messages, 2).start == 1
    assert turn_window(messages[:4], 1).start == 1
    assert turn_window(messages, 10).start == 0


def test_the_carry_holds_the_open_status_the_active_error_and_the_waiting_messages(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    script.open_turn("t1", "hello")
    queued_first, queued_update, queued_done, delivered, status, error = script.emit(
        message_queued(ClientOpId("op-a"), "first", "next_step"),
        message_queued(ClientOpId("op-a"), "first", "after_turn"),
        message_queued(ClientOpId("op-b"), "second", "next_step"),
        message_delivered(ClientOpId("op-b")),
        status_changed("running_tool"),
        error_raised("internal", "boom", False),
    )

    carry = boundary_carry(status, error, (queued_first, queued_update, queued_done, delivered))

    assert stamped(carry) == stamped((queued_first, queued_update, status, error))
    finished = script.emit(turn_finished("error", 5, None, CLAUDE_AGENT))[0]
    assert boundary_carry(finished, script.emit(turn_started(ClientOpId("op-a"), "first", CLAUDE_AGENT))[0], ()) == ()


def open_store(root: Path) -> SqliteChatTranscripts:
    return SqliteChatTranscripts.for_project(root)


def test_pages_walk_back_from_the_newest_turn_and_cover_the_journal_once(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    for index in range(5):
        answered_turn(script, f"t{index}", ChatMessageId(f"msg-{index}"))
    store = open_store(tmp_path)

    newest = store.page(SESSION, None, 2)
    middle = store.page(SESSION, newest.before_seq, 2)
    oldest = store.page(SESSION, middle.before_seq, 2)

    assert [turn.turn_id for turn in newest.turns] == ["t3", "t4"]
    assert [turn.turn_id for turn in middle.turns] == ["t1", "t2"]
    assert [turn.turn_id for turn in oldest.turns] == ["t0"]
    assert oldest.before_seq is None
    assert newest.last_seq == script.journal.read(SESSION, 0, 1000)[-1].seq
    spans = [(turn.first_seq, turn.last_seq) for page in (oldest, middle, newest) for turn in page.turns]
    assert spans[0][0] == 1
    assert all(left[1] + 1 == right[0] for left, right in zip(spans, spans[1:], strict=False))


def test_folded_turns_are_cached_by_fold_version_and_the_open_turn_refolds_as_it_grows(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    answered_turn(script, "t1", MESSAGE)
    script.open_turn("t2", "second")
    script.emit(text_delta(ANSWER, 0, "par"))
    store = open_store(tmp_path)
    before = store.page(SESSION, None, 20)
    script.emit(text_delta(ANSWER, 0, "tial"))

    after = store.page(SESSION, None, 20)

    growing = after.turns[-1].events[-1]
    assert isinstance(growing, ChatTextDelta) and growing.delta == "partial"
    assert before.turns[0] == after.turns[0]
    with sqlite3.connect(project_app_database(tmp_path)) as connection:
        rows = connection.execute(
            f"SELECT first_seq, last_seq, fold_version FROM {SNAPSHOT_TABLE} ORDER BY first_seq"
        ).fetchall()
    assert rows == [(1, 10, FOLD_VERSION), (11, after.last_seq, FOLD_VERSION)]


def test_snapshots_of_another_fold_version_are_dropped_and_folded_again(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    answered_turn(script, "t1", MESSAGE)
    first = open_store(tmp_path).page(SESSION, None, 20)
    with sqlite3.connect(project_app_database(tmp_path)) as connection:
        connection.execute(f"UPDATE {SNAPSHOT_TABLE} SET fold_version = ?, events = '[]'", (FOLD_VERSION + 1,))

    again = open_store(tmp_path).page(SESSION, None, 20)

    assert again == first


def test_a_page_carries_what_an_earlier_turn_left_waiting(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    script.open_turn("t1", "first")
    stale = script.emit(message_queued(ClientOpId("op-lost"), "never delivered", "after_turn"))[0]
    script.emit(turn_finished("interrupted", 5, None, CLAUDE_AGENT))
    answered_turn(script, "t2", ANSWER)
    script.open_turn("t3", "third")
    running = script.emit(status_changed("running_tool"))[0]

    page = open_store(tmp_path).page(SESSION, None, 1)

    assert page.carry == (stale,)
    assert page.turns[-1].events[-1] == running


def test_a_turn_that_continues_an_earlier_message_pulls_that_turn_into_the_page(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    answered_turn(script, "t1", MESSAGE)
    answered_turn(script, "t2", ANSWER)
    script.open_turn("t3", "third")
    script.emit(text_delta(ANSWER, 2, "continued"))

    page = open_store(tmp_path).page(SESSION, None, 1)

    assert [turn.turn_id for turn in page.turns] == ["t2", "t3"]


def test_an_empty_session_has_an_empty_page(tmp_path: Path) -> None:
    ScriptedJournal(tmp_path)

    page = open_store(tmp_path).page(SESSION, None, 20)

    assert (page.turns, page.carry, page.last_seq, page.before_seq) == ((), (), 0, None)


class UnsetBackendSettings:
    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        return None

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=STARTED_AT)


def transcript_app(root: Path) -> FastAPI:
    harness = chat_harness(root, ScriptedClientFactory())
    registry = BackendRegistry({"claude": harness.backend}, BackendSelection(UnsetBackendSettings()))
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(build_chat_router(registry, harness.journal, open_store(root), ChatRouteContext(root, MCP_URL)))
    return app


def test_the_transcript_route_serves_pages_of_folded_turns(tmp_path: Path) -> None:
    script = ScriptedJournal(tmp_path)
    for index in range(3):
        answered_turn(script, f"t{index}", ChatMessageId(f"msg-{index}"))
    app = transcript_app(tmp_path)
    path = f"/api/chat/sessions/{SESSION}/transcript"

    async def scenario() -> tuple[httpx2.Response, httpx2.Response, httpx2.Response, httpx2.Response]:
        async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE_URL) as client:
            newest = await client.get(path, params={"limit": 2})
            older = await client.get(path, params={"limit": 2, "before_seq": newest.json()["before_seq"]})
            unknown = await client.get("/api/chat/sessions/missing/transcript")
            invalid = await client.get(path, params={"limit": 0})
            return newest, older, unknown, invalid

    newest, older, unknown, invalid = asyncio.run(scenario())

    assert newest.status_code == 200
    assert [turn["turn_id"] for turn in newest.json()["turns"]] == ["t1", "t2"]
    assert [turn["turn_id"] for turn in older.json()["turns"]] == ["t0"]
    assert older.json()["before_seq"] is None
    assert unknown.status_code == 404
    assert invalid.status_code == 422
