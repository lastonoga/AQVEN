import sqlite3
import sys
import tempfile
from collections.abc import Callable, Iterator, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import Random
from typing import Final

from pydantic import TypeAdapter

from aqven.chat.agent import CLAUDE_AGENT
from aqven.chat.builders import (
    ChatEventBuilder,
    Clip,
    approval_requested,
    approval_resolved,
    command_ran,
    error_raised,
    file_edit,
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
from aqven.chat.sqlite_journal import SqliteChatJournal, project_app_database
from aqven.chat.sqlite_transcripts import SqliteChatTranscripts
from aqven.chat.tool_names import ToolIdentity
from aqven.chat.transcript import ChatTranscriptPage
from aqven.ports.chat import (
    CHAT_EVENT_ADAPTER,
    ChatApprovalId,
    ChatDelivery,
    ChatEvent,
    ChatMessageId,
    ChatSession,
    ChatSessionId,
    ChatState,
    ChatToolCallId,
    ChatTurnId,
    ChatTurnOrigin,
    ChatUsage,
)
from aqven.runtime.address import ClientOpId, ResourceModel

PARITY_DIRECTORY: Final[Path] = Path(__file__).resolve().parents[4] / "apps/studio/src/features/chat/parity"
SYNTHETIC_FIXTURE: Final[Path] = PARITY_DIRECTORY / "synthetic.json"
OWNER_FIXTURE: Final[Path] = PARITY_DIRECTORY / "owner-journal.json"
PARITY_SESSION: Final[ChatSessionId] = ChatSessionId("01a0d2db-6d3b-75ef-ac50-d495772403a9")
STARTED_AT: Final[datetime] = datetime(2026, 9, 24, 10, 0, tzinfo=UTC)
MCP_URL: Final[str] = "http://127.0.0.1:5180/mcp/"
BASH: Final[ToolIdentity] = ToolIdentity("Bash", None)
READ: Final[ToolIdentity] = ToolIdentity("Read", None)
FLOW_TOOL: Final[ToolIdentity] = ToolIdentity("flow_check", "aqven")
TOOLS: Final[tuple[ToolIdentity, ...]] = (BASH, READ, FLOW_TOOL)
STATES: Final[tuple[ChatState, ...]] = ("thinking", "streaming", "running_tool", "waiting_approval", "idle")
DELIVERIES: Final[tuple[ChatDelivery, ...]] = ("next_step", "after_turn")
RANDOM_SEEDS: Final[tuple[int, ...]] = tuple(range(1, 17))
EVERY_EVENT_CUT_STEP: Final[int] = 4


def usage(thinking_tokens: int) -> ChatUsage:
    return ChatUsage(
        model="claude-opus",
        tokens_in=5,
        tokens_out=90,
        thinking_tokens=thinking_tokens,
        cache_read_tokens=1200,
        cache_write_tokens=300,
        cost_usd=None,
    )


class ParityCut(ResourceModel):
    at_seq: int
    pages: tuple[ChatTranscriptPage, ...]


class ParityJournal(ResourceModel):
    name: str
    limit: int
    events: tuple[ChatEvent, ...]
    cuts: tuple[ParityCut, ...]


class ParityFixture(ResourceModel):
    journals: tuple[ParityJournal, ...]


FIXTURE_JSON: Final[TypeAdapter[ParityFixture]] = TypeAdapter(ParityFixture)


def steady_ticks(step_ms: int = 250) -> Callable[[], datetime]:
    moments = (STARTED_AT + timedelta(milliseconds=step_ms * index) for index in range(1, sys.maxsize))
    return lambda: next(moments)


def random_ticks(rng: Random) -> Callable[[], datetime]:
    def moments() -> Iterator[datetime]:
        moment = STARTED_AT
        while True:
            moment += timedelta(milliseconds=rng.choice((0, 0, 3, 40, 900, 4200)))
            yield moment

    stream = moments()
    return lambda: next(stream)


class ScriptedJournal:
    def __init__(self, root: Path, clock: Callable[[], datetime] | None = None) -> None:
        self.journal = SqliteChatJournal.for_project(root, clock or steady_ticks())
        self.journal.create_session(
            ChatSession(
                session_id=PARITY_SESSION,
                backend="claude",
                project_root=str(root),
                flow_id=None,
                model=None,
                permission_mode="default",
                created_at=STARTED_AT,
                last_seq=0,
            ),
            MCP_URL,
        )
        self.turn: ChatTurnId | None = None

    def open_turn(self, turn: str, text: str, client_op_id: str | None = None, origin: ChatTurnOrigin = "user") -> None:
        self.turn = ChatTurnId(turn)
        self.emit(turn_started(ClientOpId(client_op_id or f"op-{turn}"), text, CLAUDE_AGENT, origin))

    def continue_without_turn(self) -> None:
        self.turn = None

    def emit(self, *builders: ChatEventBuilder) -> tuple[ChatEvent, ...]:
        return tuple(self.journal.append(PARITY_SESSION, self.turn, build) for build in builders)

    def events(self) -> tuple[ChatEvent, ...]:
        return self.journal.read(PARITY_SESSION, 0, sys.maxsize)

    def close(self) -> None:
        self.journal.close()


def replayed_transcripts(root: Path, events: Sequence[ChatEvent]) -> SqliteChatTranscripts:
    ScriptedJournal(root).close()
    rows = tuple(
        (
            PARITY_SESSION,
            event.seq,
            event.type,
            event.turn_id,
            event.at.isoformat(),
            CHAT_EVENT_ADAPTER.dump_json(event).decode(),
        )
        for event in events
    )
    with sqlite3.connect(project_app_database(root)) as connection:
        connection.executemany(
            "INSERT INTO chat_events (session_id, seq, type, turn_id, at, body) VALUES (?, ?, ?, ?, ?, ?)", rows
        )
    return SqliteChatTranscripts.for_project(root)


def walked_pages(transcripts: SqliteChatTranscripts, limit: int) -> tuple[ChatTranscriptPage, ...]:
    pages = [transcripts.page(PARITY_SESSION, None, limit)]
    while (before_seq := pages[-1].before_seq) is not None:
        pages.append(transcripts.page(PARITY_SESSION, before_seq, limit))
    return tuple(pages)


def parity_cut(workdir: Path, events: Sequence[ChatEvent], at_seq: int, limit: int) -> ParityCut:
    root = Path(tempfile.mkdtemp(dir=workdir))
    transcripts = replayed_transcripts(root, [event for event in events if event.seq <= at_seq])
    pages = walked_pages(transcripts, limit)
    transcripts.close()
    return ParityCut(at_seq=at_seq, pages=pages)


def parity_journal(
    workdir: Path, name: str, events: Sequence[ChatEvent], cuts: Sequence[int], limit: int
) -> ParityJournal:
    return ParityJournal(
        name=name,
        limit=limit,
        events=tuple(events),
        cuts=tuple(parity_cut(workdir, events, at_seq, limit) for at_seq in cuts),
    )


def every_event_turns(script: ScriptedJournal) -> None:
    first, second, third = ChatToolCallId("toolu_bash"), ChatToolCallId("toolu_read"), ChatToolCallId("toolu_ask")
    message, answer = ChatMessageId("msg_first"), ChatMessageId("msg_second")
    script.open_turn("turn-1", "List the flows and check one.")
    script.emit(
        status_changed("thinking"),
        reasoning_delta(message, 0, "The user wants "),
        reasoning_delta(message, 0, "the flow ids"),
        reasoning_delta(message, 0, " listed."),
        usage_reported(usage(30), message),
        status_changed("streaming"),
        text_delta(message, 1, "Let me "),
        text_delta(message, 1, "look."),
        reasoning_delta(message, 2, "Second thought."),
        text_delta(message, 3, "Running it now."),
        tool_call_started(message, first, BASH),
        status_changed("running_tool"),
        tool_call_args_delta(first, '{"command": '),
        tool_call_args_delta(first, '"ls flows"'),
        tool_call_started(message, second, READ),
        tool_call_args_delta(second, '{"file_path": '),
        tool_call_args_delta(first, "}"),
        tool_call_args_delta(second, '"flows/a/flow.yaml"}'),
        command_ran(first, "ls flows", "List flows", Clip("a\nb", False), 0),
        tool_call_finished(first, "ok", {"command": "ls flows"}, Clip("a\nb", False)),
        file_edit(second, "flows/a/flow.yaml", "modified", "@@ -1 +1 @@\n-a\n+b"),
        tool_call_finished(second, "error", {"file_path": "flows/a/flow.yaml"}, Clip("denied", True)),
        tool_call_args_delta(second, " late"),
        tool_call_started(answer, third, BASH),
        tool_call_args_delta(third, '{"command": "rm -rf build"}'),
        status_changed("waiting_approval"),
        approval_requested(ChatApprovalId("ap-1"), third, BASH, {"command": "rm -rf build"}, "Bash needs permission"),
        approval_resolved(ChatApprovalId("ap-1"), "allow", "user"),
        status_changed("running_tool"),
        tool_call_finished(third, "ok", {"command": "rm -rf build"}, None),
        message_queued(ClientOpId("op-soon"), "Also run the tests.", "next_step"),
        message_delivered(ClientOpId("op-soon")),
        message_queued(ClientOpId("op-next"), "Then summarise.", "next_step"),
        message_queued(ClientOpId("op-next"), "Then summarise.", "after_turn"),
        text_delta(answer, 0, "Two flows: "),
        text_delta(answer, 0, "`a` and `b`."),
        usage_reported(usage(0)),
        status_changed("idle"),
        turn_finished("end_turn", 4200, usage(30), CLAUDE_AGENT),
    )
    denied, retry = ChatToolCallId("toolu_denied"), ChatMessageId("msg_third")
    script.open_turn("turn-2", "Then summarise.", "op-next")
    script.emit(
        status_changed("thinking"),
        reasoning_delta(retry, 0, "Summarising."),
        tool_call_started(retry, denied, FLOW_TOOL),
        tool_call_args_delta(denied, '{"flow_id": "a"}'),
        status_changed("waiting_approval"),
        approval_requested(ChatApprovalId("ap-2"), denied, FLOW_TOOL, {"flow_id": "a"}, None),
        approval_resolved(ChatApprovalId("ap-2"), "deny", "user"),
        tool_call_finished(denied, "denied", {"flow_id": "a"}, None),
        error_raised("rate_limited", "slow down", True),
        turn_finished("error", 900, None, CLAUDE_AGENT),
    )
    later = ChatMessageId("msg_later")
    script.continue_without_turn()
    script.emit(
        usage_reported(usage(0), later),
        status_changed("thinking"),
        reasoning_delta(later, 0, "A background task finished."),
        text_delta(later, 1, "The tests pass."),
        usage_reported(usage(12), later),
        status_changed("idle"),
        turn_finished("end_turn", 300, None, CLAUDE_AGENT),
    )
    stopped = ChatMessageId("msg_stopped")
    script.open_turn("turn-3", "Start over.")
    script.emit(
        status_changed("thinking"),
        text_delta(stopped, 0, "Starting"),
        message_queued(ClientOpId("op-lost"), "This one is never delivered.", "after_turn"),
        turn_finished("interrupted", 100, None, CLAUDE_AGENT),
    )
    live = ChatMessageId("msg_live")
    script.open_turn("turn-4", "Keep going.")
    script.emit(
        status_changed("thinking"),
        reasoning_delta(live, 0, "Still "),
        reasoning_delta(live, 0, "thinking"),
        status_changed("streaming"),
        text_delta(live, 1, "Half an ans"),
    )


def crossed_turns(script: ScriptedJournal) -> None:
    shared, tool = ChatMessageId("msg_shared"), ChatToolCallId("toolu_long")
    script.open_turn("turn-a", "Begin.")
    script.emit(
        status_changed("thinking"),
        reasoning_delta(shared, 0, "Opening."),
        tool_call_started(shared, tool, BASH),
        tool_call_args_delta(tool, '{"command": "sleep 5"}'),
        status_changed("running_tool"),
    )
    script.open_turn("turn-b", "While that runs.")
    script.emit(
        text_delta(shared, 1, "Still the same message."),
        approval_requested(ChatApprovalId("ap-late"), tool, BASH, {"command": "sleep 5"}, None),
        status_changed("waiting_approval"),
    )
    script.open_turn("turn-c", "Another.")
    script.emit(
        approval_resolved(ChatApprovalId("ap-late"), "allow", "user"),
        tool_call_finished(tool, "ok", {"command": "sleep 5"}, Clip("done", False)),
        text_delta(ChatMessageId("msg_c"), 0, "Done."),
        turn_finished("end_turn", 10, None, CLAUDE_AGENT),
    )
    script.open_turn("turn-d", "Last.")
    script.emit(text_delta(ChatMessageId("msg_d"), 0, "Fine."), turn_finished("end_turn", 10, None, CLAUDE_AGENT))


def continued_turns(script: ScriptedJournal) -> None:
    asked, woke, build = ChatMessageId("msg_asked"), ChatMessageId("msg_woke"), ChatToolCallId("toolu_build")
    script.open_turn("turn-ask", "Build it in the background.")
    script.emit(
        status_changed("thinking"),
        tool_call_started(asked, build, BASH),
        tool_call_args_delta(build, '{"command": "make", '),
        tool_call_args_delta(build, '"run_in_background": true}'),
        status_changed("running_tool"),
        tool_call_finished(build, "ok", {"command": "make", "run_in_background": True}, Clip("started", False)),
        status_changed("streaming"),
        text_delta(asked, 1, "Started the build."),
        status_changed("idle"),
        turn_finished("end_turn", 800, None, CLAUDE_AGENT),
    )
    script.open_turn("turn-woke", "", "op-woke", "continuation")
    script.emit(
        status_changed("thinking"),
        reasoning_delta(woke, 0, "The background build "),
        reasoning_delta(woke, 0, "finished."),
        status_changed("streaming"),
        text_delta(woke, 1, "The build "),
        text_delta(woke, 1, "passed."),
        status_changed("idle"),
        turn_finished("end_turn", 300, None, CLAUDE_AGENT),
    )
    script.open_turn("turn-next", "Thanks.")
    script.emit(status_changed("thinking"), text_delta(ChatMessageId("msg_next"), 0, "You're welcome."))


class RandomTurns:
    def __init__(self, rng: Random, script: ScriptedJournal) -> None:
        self.rng = rng
        self.script = script
        self.messages: list[ChatMessageId] = [ChatMessageId("msg_0")]
        self.tools: list[ChatToolCallId] = []
        self.queued: list[ClientOpId] = []
        self.counter = 0

    def fresh(self, prefix: str) -> str:
        self.counter += 1
        return f"{prefix}_{self.counter}"

    def message(self) -> ChatMessageId:
        if self.rng.random() < 0.6:
            return self.messages[-1]
        created = ChatMessageId(self.fresh("msg"))
        self.messages.append(created)
        return created

    def words(self) -> str:
        return self.rng.choice(("a", "bc", " de", "f g", "\n", "héllo", "`x`", "{", "}"))

    def prose(self) -> tuple[ChatEventBuilder, ...]:
        message, part = self.message(), self.rng.randint(0, 3)
        make = text_delta if self.rng.random() < 0.5 else reasoning_delta
        return tuple(make(message, part, self.words()) for _ in range(self.rng.randint(1, 6)))

    def tool(self) -> tuple[ChatEventBuilder, ...]:
        tool = ChatToolCallId(self.fresh("toolu"))
        self.tools.append(tool)
        started = tool_call_started(self.message(), tool, self.rng.choice(TOOLS))
        return (started, *(tool_call_args_delta(tool, self.words()) for _ in range(self.rng.randint(0, 5))))

    def tool_step(self) -> tuple[ChatEventBuilder, ...]:
        if not self.tools:
            return self.tool()
        tool = self.rng.choice(self.tools)
        steps: tuple[ChatEventBuilder, ...] = (
            tool_call_args_delta(tool, self.words()),
            command_ran(tool, "ls", None, Clip("out", self.rng.random() < 0.3), self.rng.choice((None, 0, 1))),
            file_edit(tool, "flows/a/flow.yaml", self.rng.choice(("added", "modified", "deleted")), "+x"),
            tool_call_finished(tool, self.rng.choice(("ok", "error", "denied", "interrupted")), {"n": 1}, None),
        )
        return (self.rng.choice(steps),)

    def approval(self) -> tuple[ChatEventBuilder, ...]:
        if not self.tools:
            return self.tool()
        approval = ChatApprovalId(self.fresh("ap"))
        asked = approval_requested(approval, self.rng.choice(self.tools), BASH, {"command": "x"}, None)
        if self.rng.random() < 0.3:
            return (asked,)
        return (asked, approval_resolved(approval, self.rng.choice(("allow", "deny")), "user"))

    def status(self) -> tuple[ChatEventBuilder, ...]:
        return (status_changed(self.rng.choice(STATES)),)

    def spend(self) -> tuple[ChatEventBuilder, ...]:
        message = self.rng.choice((None, self.messages[-1]))
        return (usage_reported(usage(self.rng.choice((0, 0, 17))), message),)

    def queue(self) -> tuple[ChatEventBuilder, ...]:
        if self.queued and self.rng.random() < 0.5:
            return (message_delivered(self.rng.choice(self.queued)),)
        waiting = ClientOpId(self.fresh("op"))
        self.queued.append(waiting)
        return (message_queued(waiting, f"queued {waiting}", self.rng.choice(DELIVERIES)),)

    def failure(self) -> tuple[ChatEventBuilder, ...]:
        return (error_raised("internal", "boom", self.rng.random() < 0.5),)

    def block(self) -> tuple[ChatEventBuilder, ...]:
        kinds: tuple[Callable[[], tuple[ChatEventBuilder, ...]], ...] = (
            self.prose,
            self.prose,
            self.prose,
            self.tool,
            self.tool_step,
            self.tool_step,
            self.approval,
            self.status,
            self.status,
            self.spend,
            self.queue,
            self.failure,
        )
        return self.rng.choice(kinds)()

    def open(self, index: int) -> None:
        if self.rng.random() < 0.85:
            self.messages.append(ChatMessageId(self.fresh("msg")))
        if self.rng.random() < 0.2 and index > 0:
            self.script.continue_without_turn()
            return
        reused = self.queued.pop() if self.queued and self.rng.random() < 0.4 else None
        self.script.open_turn(self.fresh("turn"), f"turn {index}", reused)

    def run(self) -> None:
        for index in range(self.rng.randint(2, 6)):
            self.open(index)
            for _ in range(self.rng.randint(1, 8)):
                self.script.emit(*self.block())
            if self.rng.random() < 0.75:
                self.script.emit(turn_finished("end_turn", 10, None, CLAUDE_AGENT))


def scripted_events(
    workdir: Path, write: Callable[[ScriptedJournal], None], rng: Random | None = None
) -> tuple[ChatEvent, ...]:
    script = ScriptedJournal(Path(tempfile.mkdtemp(dir=workdir)), None if rng is None else random_ticks(rng))
    write(script)
    events = script.events()
    script.close()
    return events


def cuts_every(events: Sequence[ChatEvent], step: int) -> tuple[int, ...]:
    seqs = [event.seq for event in events]
    return tuple(sorted({*seqs[step - 1 :: step], seqs[-1]}))


def random_journal(workdir: Path, seed: int) -> ParityJournal:
    rng = Random(seed)
    events = scripted_events(workdir, lambda script: RandomTurns(rng, script).run(), rng)
    cuts = tuple(sorted({*rng.sample([event.seq for event in events], min(4, len(events))), events[-1].seq}))
    return parity_journal(workdir, f"random-{seed}", events, cuts, rng.randint(1, 3))


def synthetic_fixture(workdir: Path) -> ParityFixture:
    every = scripted_events(workdir, every_event_turns)
    crossed = scripted_events(workdir, crossed_turns)
    continued = scripted_events(workdir, continued_turns)
    return ParityFixture(
        journals=(
            parity_journal(workdir, "every-event", every, cuts_every(every, EVERY_EVENT_CUT_STEP), 1),
            parity_journal(workdir, "crossed-turns", crossed, cuts_every(crossed, 3), 1),
            parity_journal(workdir, "continued-turns", continued, cuts_every(continued, 2), 1),
            *(random_journal(workdir, seed) for seed in RANDOM_SEEDS),
        )
    )


def read_fixture(path: Path) -> ParityFixture:
    return FIXTURE_JSON.validate_json(path.read_bytes())


def recorded_journal(workdir: Path, recorded: ParityJournal) -> ParityJournal:
    cuts = tuple(cut.at_seq for cut in recorded.cuts)
    return parity_journal(workdir, recorded.name, recorded.events, cuts, recorded.limit)


def owner_fixture(workdir: Path) -> ParityFixture:
    recorded = read_fixture(OWNER_FIXTURE)
    return ParityFixture(journals=tuple(recorded_journal(workdir, journal) for journal in recorded.journals))


def fixture_text(fixture: ParityFixture) -> str:
    return FIXTURE_JSON.dump_json(fixture).decode() + "\n"


FIXTURES: Final[tuple[tuple[Path, Callable[[Path], ParityFixture]], ...]] = (
    (SYNTHETIC_FIXTURE, synthetic_fixture),
    (OWNER_FIXTURE, owner_fixture),
)


def write_fixtures() -> None:
    for path, build in FIXTURES:
        with tempfile.TemporaryDirectory() as workdir:
            text = fixture_text(build(Path(workdir)))
        path.write_text(text)


if __name__ == "__main__":
    write_fixtures()
