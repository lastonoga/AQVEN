from datetime import UTC, datetime

from openai_codex.generated.v2_all import (
    AgentMessageDeltaNotification,
    CommandExecutionOutputDeltaNotification,
    ItemCompletedNotification,
    ItemStartedNotification,
    ReasoningSummaryTextDeltaNotification,
    ThreadItem,
    ThreadTokenUsageUpdatedNotification,
)
from openai_codex.models import Notification

from aqven.chat.builders import ChatStamp
from aqven.chat.codex_normalizer import CodexNormalizer
from aqven.ports.chat import (
    ChatCommand,
    ChatMessageId,
    ChatReasoningDelta,
    ChatSessionId,
    ChatTextDelta,
    ChatToolCallFinished,
    ChatToolCallStarted,
    ChatTurnId,
    ChatUsageReported,
)

STAMP: ChatStamp = {
    "seq": 1,
    "at": datetime.now(UTC),
    "session_id": ChatSessionId("session-1"),
    "turn_id": ChatTurnId("turn-1"),
}


def test_codex_text_and_reasoning_deltas_share_one_assistant_message() -> None:
    normalizer = CodexNormalizer(ChatMessageId("turn-1"), None)
    text = Notification(
        "item/agentMessage/delta",
        AgentMessageDeltaNotification(delta="Hello", item_id="item-1", thread_id="codex-1", turn_id="turn-1"),
    )
    reasoning = Notification(
        "item/reasoning/summaryTextDelta",
        ReasoningSummaryTextDeltaNotification(
            delta="Checking", item_id="reason-1", summary_index=0, thread_id="codex-1", turn_id="turn-1"
        ),
    )

    emitted = [builder(STAMP) for message in (text, reasoning) for builder in normalizer.normalize(message)]

    assert isinstance(emitted[0], ChatTextDelta) and emitted[0].delta == "Hello"
    assert isinstance(emitted[1], ChatReasoningDelta) and emitted[1].delta == "Checking"
    assert emitted[0].message_id == emitted[1].message_id == "turn-1"


def agent_delta(item_id: str, delta: str) -> Notification:
    return Notification(
        "item/agentMessage/delta",
        AgentMessageDeltaNotification(delta=delta, item_id=item_id, thread_id="codex-1", turn_id="turn-1"),
    )


def summary_delta(item_id: str, summary_index: int, delta: str) -> Notification:
    return Notification(
        "item/reasoning/summaryTextDelta",
        ReasoningSummaryTextDeltaNotification(
            delta=delta, item_id=item_id, summary_index=summary_index, thread_id="codex-1", turn_id="turn-1"
        ),
    )


def test_each_codex_agent_message_and_summary_is_its_own_part_so_texts_never_glue() -> None:
    normalizer = CodexNormalizer(ChatMessageId("turn-1"), None)
    notifications = (
        agent_delta("item-1", "The markers stay "),
        agent_delta("item-1", "visible."),
        summary_delta("reason-1", 0, "Checking the pairs."),
        summary_delta("reason-1", 1, "Then the angles."),
        agent_delta("item-2", "Got it — "),
        agent_delta("item-2", "fixing the pairs."),
    )

    emitted = [builder(STAMP) for message in notifications for builder in normalizer.normalize(message)]
    texts = [(event.part_index, event.delta) for event in emitted if isinstance(event, ChatTextDelta)]
    thoughts = [(event.part_index, event.delta) for event in emitted if isinstance(event, ChatReasoningDelta)]

    assert texts == [(0, "The markers stay "), (0, "visible."), (3, "Got it — "), (3, "fixing the pairs.")]
    assert thoughts == [(1, "Checking the pairs."), (2, "Then the angles.")]


def test_codex_command_stream_and_completion_keep_one_tool_call() -> None:
    normalizer = CodexNormalizer(ChatMessageId("turn-1"), None)
    command = ThreadItem.model_validate(
        {
            "type": "commandExecution",
            "id": "command-1",
            "command": "pwd",
            "commandActions": [],
            "cwd": "/project",
            "status": "inProgress",
        }
    )
    started = Notification(
        "item/started",
        ItemStartedNotification(item=command, started_at_ms=1, thread_id="codex-1", turn_id="turn-1"),
    )
    output = Notification(
        "item/commandExecution/outputDelta",
        CommandExecutionOutputDeltaNotification(
            delta="/project\n", item_id="command-1", thread_id="codex-1", turn_id="turn-1"
        ),
    )
    completed_item = ThreadItem.model_validate(
        {
            "type": "commandExecution",
            "id": "command-1",
            "command": "pwd",
            "commandActions": [],
            "cwd": "/project",
            "status": "completed",
            "aggregatedOutput": "/project\n",
            "exitCode": 0,
        }
    )
    completed = Notification(
        "item/completed",
        ItemCompletedNotification(item=completed_item, completed_at_ms=2, thread_id="codex-1", turn_id="turn-1"),
    )

    emitted = [builder(STAMP) for message in (started, output, completed) for builder in normalizer.normalize(message)]

    assert isinstance(emitted[0], ChatToolCallStarted) and emitted[0].tool_call_id == "command-1"
    commands = [event for event in emitted if isinstance(event, ChatCommand)]
    assert commands[-1].output_preview == "/project\n" and commands[-1].exit_code == 0
    assert isinstance(emitted[-1], ChatToolCallFinished) and emitted[-1].status == "ok"


def test_codex_usage_is_reported_without_invented_cost() -> None:
    normalizer = CodexNormalizer(ChatMessageId("turn-1"), "gpt-5")
    usage = ThreadTokenUsageUpdatedNotification.model_validate(
        {
            "threadId": "codex-1",
            "turnId": "turn-1",
            "tokenUsage": {
                "last": {
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "cachedInputTokens": 3,
                    "reasoningOutputTokens": 1,
                    "totalTokens": 15,
                },
                "total": {
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "cachedInputTokens": 3,
                    "reasoningOutputTokens": 1,
                    "totalTokens": 15,
                },
            },
        }
    )

    emitted = [builder(STAMP) for builder in normalizer.normalize(Notification("thread/tokenUsage/updated", usage))]

    assert isinstance(emitted[0], ChatUsageReported)
    assert emitted[0].usage.tokens_in == 10
    assert emitted[0].usage.tokens_out == 5
    assert emitted[0].usage.cache_read_tokens == 3
    assert emitted[0].usage.cost_usd is None
