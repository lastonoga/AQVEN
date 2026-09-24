import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

from claude_agent_sdk import ToolUseBlock

from aqven.chat.claude_options import REPLAY_USER_MESSAGES_FLAG
from aqven.chat.testing import ApprovalStep, ScriptedClientFactory, ScriptStep
from aqven.ports.chat import (
    ApprovalAnswer,
    ChatApprovalRequested,
    ChatEvent,
    ChatMessageDelivered,
    ChatMessageQueued,
    ChatMessageRequest,
    ChatSessionId,
    ChatTurnFinished,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId

from .fixtures import ChatHarness, assistant, chat_harness, next_event, streamed_answer_turn, tool_result


def message(text: str, op: str) -> ChatMessageRequest:
    return ChatMessageRequest(text=text, client_op_id=ClientOpId(op))


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def tool_step_turn(project_root: Path) -> list[ScriptStep]:
    return [
        assistant("msg_wait", [ToolUseBlock(id="toolu_wait", name="Bash", input={"command": "sleep 4"})]),
        ApprovalStep(tool_name="Bash", tool_use_id="toolu_wait"),
        tool_result("toolu_wait", "(Bash completed with no output)"),
        *streamed_answer_turn(project_root),
    ]


def answer_after_approval_turn(project_root: Path) -> list[ScriptStep]:
    return [ApprovalStep(tool_name="Bash", tool_use_id="toolu_wait"), *streamed_answer_turn(project_root)]


async def finished_turns(events: AsyncIterator[ChatEvent], count: int) -> list[ChatEvent]:
    seen: list[ChatEvent] = []
    for _ in range(count):
        _, batch = await next_event(events, ChatTurnFinished)
        seen.extend(batch)
    return seen


async def allow_pending(harness: ChatHarness, session_id: ChatSessionId, request: ChatApprovalRequested) -> None:
    answer = ApprovalAnswer(approval_id=request.approval_id, decision="allow")
    await harness.backend.answer_approval(session_id, answer)


def test_message_during_a_tool_step_joins_the_running_turn(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([tool_step_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[str, str, str, list[ChatEvent]]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        first = await harness.backend.send_message(session.session_id, message("one", "op-1"))
        request, before = await next_event(events, ChatApprovalRequested)
        queued = await harness.backend.send_message(session.session_id, message("also check the tests", "op-2"))
        repeated = await harness.backend.send_message(session.session_id, message("also check the tests", "op-2"))
        await allow_pending(harness, session.session_id, request)
        after = await finished_turns(events, 1)
        await harness.backend.aclose()
        return first, queued, repeated, [*before, *after]

    first, queued, repeated, seen = asyncio.run(scenario())
    client = factory.clients[0]
    types = [event.type for event in seen]

    assert queued == first == repeated
    assert [(event.client_op_id, event.text, event.delivery) for event in of_type(seen, ChatMessageQueued)] == [
        ("op-2", "also check the tests", "next_step")
    ]
    delivered = of_type(seen, ChatMessageDelivered)
    assert [(event.client_op_id, event.turn_id) for event in delivered] == [("op-2", first)]
    assert types.index("chat_message_queued") < types.index("chat_message_delivered")
    assert types.index("chat_message_delivered") < types.index("chat_turn_finished")
    assert [event.client_op_id for event in of_type(seen, ChatTurnStarted)] == ["op-1"]
    assert len(of_type(seen, ChatTurnFinished)) == 1
    assert client.prompts == ["one"]
    assert [prompt.text for prompt in client.queued] == ["also check the tests"]
    assert client.options.extra_args == {REPLAY_USER_MESSAGES_FLAG: None}


def test_message_the_turn_never_reads_opens_the_next_turn(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([answer_after_approval_turn(tmp_path), streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[str, str, list[ChatEvent]]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        first = await harness.backend.send_message(session.session_id, message("one", "op-1"))
        request, before = await next_event(events, ChatApprovalRequested)
        queued = await harness.backend.send_message(session.session_id, message("two", "op-2"))
        await allow_pending(harness, session.session_id, request)
        after = await finished_turns(events, 2)
        await harness.backend.aclose()
        return first, queued, [*before, *after]

    first, queued, seen = asyncio.run(scenario())
    started = of_type(seen, ChatTurnStarted)
    finished = of_type(seen, ChatTurnFinished)

    assert queued == first
    assert [(event.client_op_id, event.text) for event in started] == [("op-1", "one"), ("op-2", "two")]
    assert started[1].turn_id != first
    assert [event.stop_reason for event in finished] == ["end_turn", "end_turn"]
    assert of_type(seen, ChatMessageDelivered) == []
    assert [event.delivery for event in of_type(seen, ChatMessageQueued)] == ["next_step"]
    assert factory.clients[0].prompts == ["one"]


def test_stop_with_a_queued_message_hands_it_the_next_turn(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([answer_after_approval_turn(tmp_path), streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("one", "op-1"))
        _, before = await next_event(events, ChatApprovalRequested)
        await harness.backend.send_message(session.session_id, message("two", "op-2"))
        await harness.backend.interrupt(session.session_id)
        after = await finished_turns(events, 2)
        await harness.backend.aclose()
        return [*before, *after]

    seen = asyncio.run(scenario())
    started = of_type(seen, ChatTurnStarted)
    finished = of_type(seen, ChatTurnFinished)

    assert [event.client_op_id for event in started] == ["op-1", "op-2"]
    assert finished[0].stop_reason == "interrupted"
    assert [event.turn_id for event in finished] == [event.turn_id for event in started]
    assert all(event.turn_id is not None for event in seen)
    assert factory.clients[0].interrupts == 1


def test_queued_message_survives_a_crashed_agent_on_a_fresh_client(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([answer_after_approval_turn(tmp_path)], [streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("one", "op-1"))
        _, before = await next_event(events, ChatApprovalRequested)
        await harness.backend.send_message(session.session_id, message("two", "op-2"))
        await asyncio.sleep(0.05)
        factory.clients[0].push(None)
        after = await finished_turns(events, 2)
        await harness.backend.aclose()
        return [*before, *after]

    seen = asyncio.run(scenario())
    started = of_type(seen, ChatTurnStarted)

    assert [event.client_op_id for event in started] == ["op-1", "op-2"]
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["error", "end_turn"]
    assert [[prompt.text for prompt in client.queued] for client in factory.clients] == [["two"], ["two"]]


def test_closing_the_session_drops_queued_messages(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([answer_after_approval_turn(tmp_path), streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("one", "op-1"))
        await next_event(events, ChatApprovalRequested)
        await harness.backend.send_message(session.session_id, message("two", "op-2"))
        await harness.backend.close_session(session.session_id)
        async with asyncio.timeout(2.0):
            tail = [event async for event in events]
        await harness.backend.aclose()
        return tail

    tail = asyncio.run(scenario())

    assert [event.client_op_id for event in of_type(tail, ChatTurnStarted)] == []
    assert [event.stop_reason for event in of_type(tail, ChatTurnFinished)] == ["interrupted"]
