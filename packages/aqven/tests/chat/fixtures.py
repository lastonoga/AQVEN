import asyncio
import itertools
from collections.abc import AsyncIterator, Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from claude_agent_sdk import (
    AssistantMessage,
    ContentBlock,
    RateLimitEvent,
    RateLimitInfo,
    ResultMessage,
    StreamEvent,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)
from claude_agent_sdk.types import AssistantMessageError
from pydantic import JsonValue, SecretStr

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.builders import ChatEventBuilder, ChatStamp
from aqven.chat.claude_backend import ClaudeAgentBackend
from aqven.chat.claude_options import ClaudeChatSettings, ClaudeOptionsFactory
from aqven.chat.claude_runtime import ClaudeChatRuntime, ClaudeClientFactory
from aqven.chat.feed import ChatSignals
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.chat.testing import ApprovalStep, ScriptStep
from aqven.ports.chat import (
    ChatEvent,
    ChatPermissionMode,
    ChatSession,
    ChatSessionId,
    ChatSessionOptions,
    ChatTurnFinished,
    LoginStatus,
)
from aqven.spec import FlowId

SDK_SESSION: Final[str] = "0f5b8b52-3c2e-4a41-9a4e-2f9d8f3c7a10"
MODEL: Final[str] = "claude-haiku-4-5"
MCP_URL: Final[str] = "http://127.0.0.1:5180/mcp/"
MCP_TOKEN: Final[str] = "launch-token-for-tests"
FIXED_NOW: Final[datetime] = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
EVENT_WAIT_SECONDS: Final[float] = 5.0


def fixed_clock() -> datetime:
    return FIXED_NOW


def counting_ids(prefix: str = "id") -> Callable[[], str]:
    counter = itertools.count(1)
    return lambda: f"{prefix}-{next(counter)}"


def chat_session(
    session_id: str,
    project_root: Path,
    flow_id: FlowId | None = None,
    model: str | None = MODEL,
    permission_mode: ChatPermissionMode = "default",
) -> ChatSession:
    return ChatSession(
        session_id=ChatSessionId(session_id),
        backend="claude",
        project_root=str(project_root),
        flow_id=flow_id,
        model=model,
        permission_mode=permission_mode,
        created_at=FIXED_NOW,
        last_seq=0,
    )


def materialize(builders: Iterable[ChatEventBuilder], session_id: str = "session-1") -> list[ChatEvent]:
    return [
        build(ChatStamp(seq=seq, at=FIXED_NOW, session_id=ChatSessionId(session_id), turn_id=None))
        for seq, build in enumerate(builders, start=1)
    ]


def stream(event: dict[str, JsonValue], parent_tool_use_id: str | None = None) -> StreamEvent:
    return StreamEvent(
        uuid=f"uuid-{event['type']}",
        session_id=SDK_SESSION,
        event=event,
        parent_tool_use_id=parent_tool_use_id,
    )


def message_start(message_id: str) -> StreamEvent:
    return stream({"type": "message_start", "message": {"id": message_id, "model": MODEL, "role": "assistant"}})


def block_start(index: int, block: dict[str, JsonValue]) -> StreamEvent:
    return stream({"type": "content_block_start", "index": index, "content_block": block})


def block_delta(index: int, delta: dict[str, JsonValue]) -> StreamEvent:
    return stream({"type": "content_block_delta", "index": index, "delta": delta})


def block_stop(index: int) -> StreamEvent:
    return stream({"type": "content_block_stop", "index": index})


def assistant(
    message_id: str | None, content: Sequence[ContentBlock], error: AssistantMessageError | None = None
) -> AssistantMessage:
    return AssistantMessage(
        content=list(content),
        model=MODEL,
        message_id=message_id,
        session_id=SDK_SESSION,
        error=error,
    )


def tool_result(
    tool_use_id: str,
    content: str | list[dict[str, JsonValue]],
    details: dict[str, JsonValue] | None = None,
    is_error: bool = False,
) -> UserMessage:
    block = ToolResultBlock(tool_use_id=tool_use_id, content=content, is_error=is_error)
    return UserMessage(content=[block], tool_use_result=details)


def init_message(project_root: Path) -> SystemMessage:
    return SystemMessage(
        subtype="init",
        data={
            "type": "system",
            "subtype": "init",
            "session_id": SDK_SESSION,
            "cwd": str(project_root),
            "model": MODEL,
            "mcp_servers": [{"name": "aqven", "status": "connected"}],
            "tools": ["Read", "Edit", "Write", "Bash", "mcp__aqven__aqven_check"],
        },
    )


def result(
    subtype: str = "success",
    *,
    is_error: bool = False,
    terminal_reason: str | None = "completed",
    api_error_status: int | None = None,
    errors: list[str] | None = None,
    total_cost_usd: float = 0.0044,
) -> ResultMessage:
    return ResultMessage(
        subtype=subtype,
        duration_ms=3200,
        duration_api_ms=2900,
        is_error=is_error,
        num_turns=2,
        session_id=SDK_SESSION,
        total_cost_usd=total_cost_usd,
        usage={
            "input_tokens": 120,
            "output_tokens": 48,
            "cache_read_input_tokens": 900,
            "cache_creation_input_tokens": 30,
        },
        model_usage={
            MODEL: {
                "inputTokens": 120,
                "outputTokens": 48,
                "cacheReadInputTokens": 900,
                "cacheCreationInputTokens": 30,
                "webSearchRequests": 0,
                "costUSD": 0.0044,
                "contextWindow": 200000,
                "maxOutputTokens": 32000,
            }
        },
        result="done",
        terminal_reason=terminal_reason,
        api_error_status=api_error_status,
        errors=errors,
    )


def rate_limited() -> RateLimitEvent:
    info = RateLimitInfo(status="rejected", resets_at=1790000000, rate_limit_type="five_hour")
    return RateLimitEvent(rate_limit_info=info, uuid="uuid-rate", session_id=SDK_SESSION)


def streamed_answer_turn(project_root: Path) -> list[ScriptStep]:
    return [
        init_message(project_root),
        message_start("msg_answer"),
        block_start(0, {"type": "thinking", "thinking": "", "signature": ""}),
        block_delta(0, {"type": "thinking_delta", "thinking": "The user wants a greeting."}),
        block_delta(0, {"type": "signature_delta", "signature": "sig"}),
        block_stop(0),
        block_start(1, {"type": "text", "text": ""}),
        block_delta(1, {"type": "text_delta", "text": "Hello"}),
        block_delta(1, {"type": "text_delta", "text": " from AQVEN"}),
        block_stop(1),
        stream({"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 12}}),
        stream({"type": "message_stop"}),
        assistant(
            "msg_answer",
            [ThinkingBlock(thinking="The user wants a greeting.", signature="sig"), TextBlock(text="Hello from AQVEN")],
        ),
        result(),
    ]


def edit_input(project_root: Path) -> dict[str, JsonValue]:
    return {
        "file_path": str(project_root / "lumen" / "support_case" / "case_form" / "code.py"),
        "old_string": 'INTENT_FIELDS = ("refund",)\n',
        "new_string": 'INTENT_FIELDS = ("refund", "return")\n',
    }


def edit_and_check_turn(project_root: Path) -> list[ScriptStep]:
    arguments = edit_input(project_root)
    return [
        init_message(project_root),
        message_start("msg_edit"),
        block_start(0, {"type": "tool_use", "id": "toolu_edit", "name": "Edit", "input": {}}),
        block_delta(0, {"type": "input_json_delta", "partial_json": '{"file_path": '}),
        block_delta(0, {"type": "input_json_delta", "partial_json": '"lumen/code.py"}'}),
        block_stop(0),
        assistant("msg_edit", [ToolUseBlock(id="toolu_edit", name="Edit", input=arguments)]),
        ApprovalStep(tool_name="Edit", tool_use_id="toolu_edit", tool_input=arguments, reason="Edit needs approval"),
        tool_result(
            "toolu_edit",
            "The file has been updated.",
            {"filePath": arguments["file_path"], "originalFile": 'INTENT_FIELDS = ("refund",)\n'},
        ),
        assistant("msg_check", [ToolUseBlock(id="toolu_check", name="mcp__aqven__aqven_check", input={})]),
        ApprovalStep(tool_name="mcp__aqven__aqven_check", tool_use_id="toolu_check"),
        tool_result("toolu_check", [{"type": "text", "text": "Permission denied"}], is_error=True),
        assistant("msg_bash", [ToolUseBlock(id="toolu_bash", name="Bash", input={"command": "pytest -q"})]),
        tool_result("toolu_bash", "3 passed in 0.12s"),
        assistant("msg_final", [TextBlock(text="Added the return intent.")]),
        result(),
    ]


@dataclass
class FakeLogin:
    status_value: LoginStatus = field(
        default_factory=lambda: LoginStatus(
            backend="claude", state="logged_in", method="subscription", account="dev@example.com", detail=None
        )
    )
    calls: int = 0

    async def status(self) -> LoginStatus:
        self.calls += 1
        return self.status_value


@dataclass
class ChatHarness:
    project_root: Path
    journal: SqliteChatJournal
    runtime: ClaudeChatRuntime
    backend: ClaudeAgentBackend
    login: FakeLogin

    def options(self, model: str | None = MODEL, flow_id: FlowId | None = None) -> ChatSessionOptions:
        return ChatSessionOptions(project_root=str(self.project_root), mcp_url=MCP_URL, flow_id=flow_id, model=model)


def chat_harness(
    project_root: Path, client_factory: ClaudeClientFactory, approval_timeout_seconds: float = 5.0
) -> ChatHarness:
    journal = SqliteChatJournal.for_project(project_root, fixed_clock)
    login = FakeLogin()
    settings = ClaudeChatSettings(
        mcp_token=SecretStr(MCP_TOKEN),
        cli_path="/usr/local/bin/claude",
        approval_timeout_seconds=approval_timeout_seconds,
        mcp_config_directory=project_root,
    )
    runtime = ClaudeChatRuntime(
        journal=journal,
        signals=ChatSignals(),
        approvals=ApprovalRegistry(),
        options=ClaudeOptionsFactory(settings),
        login=login,
        clock=fixed_clock,
        client_factory=client_factory,
        ids=counting_ids(),
    )
    return ChatHarness(project_root, journal, runtime, ClaudeAgentBackend(runtime), login)


async def next_event[E](events: AsyncIterator[ChatEvent], kind: type[E]) -> tuple[E, list[ChatEvent]]:
    seen: list[ChatEvent] = []
    async with asyncio.timeout(EVENT_WAIT_SECONDS):
        async for event in events:
            seen.append(event)
            if isinstance(event, kind):
                return event, seen
    raise AssertionError(f"stream ended before {kind.__name__}")


async def until_turn_finished(events: AsyncIterator[ChatEvent]) -> tuple[ChatTurnFinished, list[ChatEvent]]:
    return await next_event(events, ChatTurnFinished)
