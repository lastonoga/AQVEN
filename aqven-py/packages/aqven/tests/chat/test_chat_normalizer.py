from decimal import Decimal
from pathlib import Path

from claude_agent_sdk import Message, TextBlock, ToolUseBlock

from aqven.chat.normalizer import ClaudeEventNormalizer, backend_session_id
from aqven.chat.testing import ApprovalStep
from aqven.chat.tool_names import ToolIdentity, claude_tool_identity
from aqven.ports.chat import (
    ChatCommand,
    ChatErrorRaised,
    ChatEvent,
    ChatFileEdit,
    ChatReasoningDelta,
    ChatStatus,
    ChatTextDelta,
    ChatToolCallArgsDelta,
    ChatToolCallFinished,
    ChatToolCallId,
    ChatToolCallStarted,
    ChatTurnFinished,
    ChatUsageReported,
)

from .fixtures import (
    SDK_SESSION,
    assistant,
    block_delta,
    block_start,
    counting_ids,
    edit_and_check_turn,
    init_message,
    materialize,
    message_start,
    rate_limited,
    result,
    stream,
    streamed_answer_turn,
    tool_result,
)

ROOT = Path("/work/lumen-project")


def normalize_all(normalizer: ClaudeEventNormalizer, messages: list[Message]) -> list[ChatEvent]:
    return materialize(builder for message in messages for builder in normalizer.normalize(message))


def sdk_messages(steps: list[Message | ApprovalStep]) -> list[Message]:
    return [step for step in steps if not isinstance(step, ApprovalStep)]


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def test_claude_tool_names_are_normalized() -> None:
    assert claude_tool_identity("mcp__aqven__flow_patch") == ToolIdentity("flow_patch", "aqven")
    assert claude_tool_identity("mcp__aqven__aqven_check") == ToolIdentity("aqven_check", "aqven")
    assert claude_tool_identity("Edit") == ToolIdentity("Edit", None)
    assert claude_tool_identity("mcp__broken") == ToolIdentity("mcp__broken", None)


def test_streamed_answer_emits_deltas_once_and_finishes_turn() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    normalizer.begin_turn()
    events = normalize_all(normalizer, sdk_messages(streamed_answer_turn(ROOT)))

    reasoning = of_type(events, ChatReasoningDelta)
    texts = of_type(events, ChatTextDelta)
    assert [delta.delta for delta in reasoning] == ["The user wants a greeting."]
    assert [delta.delta for delta in texts] == ["Hello", " from AQVEN"]
    assert {delta.message_id for delta in texts} == {"msg_answer"}
    assert {delta.part_index for delta in texts} == {1}
    assert [status.state for status in of_type(events, ChatStatus)] == ["thinking", "streaming", "idle"]
    usage = of_type(events, ChatUsageReported)[0].usage
    assert usage.model == "claude-haiku-4-5"
    assert (usage.tokens_in, usage.tokens_out, usage.cache_read_tokens, usage.cache_write_tokens) == (120, 48, 900, 30)
    assert usage.cost_usd == Decimal("0.0044")
    finished = of_type(events, ChatTurnFinished)
    assert [(event.stop_reason, event.duration_ms) for event in finished] == [("end_turn", 3200)]
    assert isinstance(events[-1], ChatTurnFinished)
    assert isinstance(events[-2], ChatStatus)


def test_unstreamed_assistant_message_is_replayed_as_deltas() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    events = normalize_all(normalizer, [assistant("msg_plain", [TextBlock(text="No streaming here")])])

    assert [(event.message_id, event.delta) for event in of_type(events, ChatTextDelta)] == [
        ("msg_plain", "No streaming here")
    ]


def test_tool_calls_produce_cards_diffs_commands_and_statuses() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    normalizer.begin_turn()
    normalizer.mark_denied(ChatToolCallId("toolu_check"))
    events = normalize_all(normalizer, sdk_messages(edit_and_check_turn(ROOT)))

    started = of_type(events, ChatToolCallStarted)
    assert [(event.tool_call_id, event.tool_name, event.mcp_server) for event in started] == [
        ("toolu_edit", "Edit", None),
        ("toolu_check", "aqven_check", "aqven"),
        ("toolu_bash", "Bash", None),
    ]
    edit_args = [event.delta for event in of_type(events, ChatToolCallArgsDelta) if event.tool_call_id == "toolu_edit"]
    assert edit_args == ['{"file_path": ', '"lumen/code.py"}']
    finished = {event.tool_call_id: event for event in of_type(events, ChatToolCallFinished)}
    assert finished[ChatToolCallId("toolu_edit")].status == "ok"
    assert finished[ChatToolCallId("toolu_edit")].input["new_string"] == 'INTENT_FIELDS = ("refund", "return")\n'
    assert finished[ChatToolCallId("toolu_check")].status == "denied"
    assert finished[ChatToolCallId("toolu_check")].result_preview == "Permission denied"
    assert finished[ChatToolCallId("toolu_bash")].result_preview == "3 passed in 0.12s"
    edits = of_type(events, ChatFileEdit)
    assert [(edit.path, edit.change) for edit in edits] == [("lumen/support_case/case_form/code.py", "modified")]
    assert '-INTENT_FIELDS = ("refund",)' in edits[0].diff
    assert '+INTENT_FIELDS = ("refund", "return")' in edits[0].diff
    commands = of_type(events, ChatCommand)
    assert [(command.command, command.output_preview, command.exit_code) for command in commands] == [
        ("pytest -q", "3 passed in 0.12s", None)
    ]


def test_write_tool_reports_added_file() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    arguments = {"file_path": str(ROOT / "flows" / "triage" / "flow.yaml"), "content": "kind: flow\n"}
    messages: list[Message] = [
        assistant("msg_write", [ToolUseBlock(id="toolu_write", name="Write", input=arguments)]),
        tool_result("toolu_write", "File created", {"type": "create", "originalFile": None}),
    ]
    edits = of_type(normalize_all(normalizer, messages), ChatFileEdit)

    assert [(edit.path, edit.change) for edit in edits] == [("flows/triage/flow.yaml", "added")]
    assert "+kind: flow" in edits[0].diff


def test_stream_events_of_subagents_are_skipped() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    messages: list[Message] = [
        stream({"type": "message_start", "message": {"id": "msg_sub"}}, parent_tool_use_id="toolu_agent"),
        stream(
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "hidden"}},
            parent_tool_use_id="toolu_agent",
        ),
    ]

    assert normalize_all(normalizer, messages) == []


def test_interrupted_result_finishes_turn_as_interrupted() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    normalizer.begin_turn()
    normalizer.mark_interrupting()
    events = normalize_all(
        normalizer,
        [
            message_start("msg_cut"),
            block_start(0, {"type": "text", "text": ""}),
            block_delta(0, {"type": "text_delta", "text": "partial"}),
            result("error_during_execution", terminal_reason="aborted_streaming"),
        ],
    )

    assert [event.stop_reason for event in of_type(events, ChatTurnFinished)] == ["interrupted"]
    assert of_type(events, ChatErrorRaised) == []
    assert not normalizer.interrupting


def test_error_results_and_assistant_errors_map_to_chat_errors() -> None:
    rate_normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    rate_events = normalize_all(
        rate_normalizer, [result(is_error=True, api_error_status=429, errors=["429 rate limited"])]
    )
    assert [(event.code, event.message, event.retryable) for event in of_type(rate_events, ChatErrorRaised)] == [
        ("rate_limited", "429 rate limited", True)
    ]
    assert [event.stop_reason for event in of_type(rate_events, ChatTurnFinished)] == ["error"]

    auth_normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    auth_events = normalize_all(
        auth_normalizer,
        [
            assistant("msg_auth", [TextBlock(text="Invalid API key · Please run /login")], "authentication_failed"),
            result(is_error=True, api_error_status=401),
        ],
    )
    assert [(event.code, event.message) for event in of_type(auth_events, ChatErrorRaised)] == [
        ("auth_required", "Invalid API key · Please run /login")
    ]

    limit_normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    limit_events = normalize_all(limit_normalizer, [rate_limited()])
    assert [event.code for event in of_type(limit_events, ChatErrorRaised)] == ["rate_limited"]


def test_max_turns_result_is_reported() -> None:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    events = normalize_all(normalizer, [result("error_max_turns", is_error=True, terminal_reason="max_turns")])

    assert [event.stop_reason for event in of_type(events, ChatTurnFinished)] == ["max_turns"]


def test_backend_session_id_is_read_from_init_result_and_stream() -> None:
    assert backend_session_id(init_message(ROOT)) == SDK_SESSION
    assert backend_session_id(result()) == SDK_SESSION
    assert backend_session_id(message_start("msg")) == SDK_SESSION
    assert backend_session_id(assistant("msg", [])) is None
