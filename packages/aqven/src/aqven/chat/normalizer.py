import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal

from claude_agent_sdk import (
    AssistantMessage,
    Message,
    RateLimitEvent,
    ResultMessage,
    ServerToolResultBlock,
    ServerToolUseBlock,
    StreamEvent,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from aqven.chat.agent import CLAUDE_AGENT, TurnAgent
from aqven.chat.builders import (
    ChatEventBuilders,
    clip,
    error_raised,
    reasoning_delta,
    status_changed,
    text_delta,
    tool_call_args_delta,
    tool_call_finished,
    tool_call_started,
    turn_finished,
    usage_reported,
)
from aqven.chat.claude_wire import (
    BlockDeltaWire,
    BlockOpenWire,
    StreamEventWire,
    UsageWire,
    content_text,
    json_object,
    parse_wire,
)
from aqven.chat.journal import IdFactory
from aqven.chat.routes import Route, Router, dispatch, first_match, ignore
from aqven.chat.tool_effects import ToolOutcome, claude_tool_effect
from aqven.chat.tool_names import claude_tool_identity
from aqven.chat.turn_cost import TurnCostMeter
from aqven.ports.chat import (
    ChatErrorCode,
    ChatMessageId,
    ChatState,
    ChatStopReason,
    ChatToolCallId,
    ChatToolStatus,
    ChatUsage,
)
from aqven.runtime.address import JsonObject

PREVIEW_LIMIT: Final[int] = 2000
INTERRUPTED_TERMINAL_REASONS: Final[frozenset[str | None]] = frozenset({"aborted_streaming", "aborted_tools"})
MAX_TURNS_MARKERS: Final[frozenset[str | None]] = frozenset({"error_max_turns", "max_turns"})
STATES_WHILE_INTERRUPTING: Final[frozenset[ChatState]] = frozenset({"interrupting", "idle"})
RATE_LIMIT_MESSAGE: Final[str] = "Claude usage limit reached for this account."
TOOL_OK: Final[ChatToolStatus] = "ok"
TURN_COMPLETED: Final[ChatStopReason] = "end_turn"

type ErrorClass = tuple[ChatErrorCode, bool]

UNKNOWN_ERROR: Final[ErrorClass] = ("internal", False)
ASSISTANT_ERRORS: Final[Mapping[str, ErrorClass]] = {
    "authentication_failed": ("auth_required", False),
    "billing_error": ("billing", False),
    "rate_limit": ("rate_limited", True),
    "invalid_request": ("invalid_request", False),
    "server_error": ("backend_unavailable", True),
}
HTTP_ERRORS: Final[Mapping[int, ErrorClass]] = {
    400: ("invalid_request", False),
    401: ("auth_required", False),
    402: ("billing", False),
    403: ("auth_required", False),
    429: ("rate_limited", True),
    500: ("backend_unavailable", True),
    502: ("backend_unavailable", True),
    503: ("backend_unavailable", True),
    529: ("backend_unavailable", True),
}

type BlockKind = Literal["text", "thinking", "tool", "other"]


@dataclass(frozen=True, slots=True)
class _Block:
    kind: BlockKind
    tool_call_id: ChatToolCallId | None = None


@dataclass(frozen=True, slots=True)
class _ToolCall:
    raw_name: str
    tool_input: JsonObject


UNKNOWN_TOOL_CALL: Final[_ToolCall] = _ToolCall("", {})


def backend_session_id(message: Message) -> str | None:
    if isinstance(message, ResultMessage | StreamEvent):
        return message.session_id or None
    if not isinstance(message, SystemMessage):
        return None
    value = message.data.get("session_id")
    return value if isinstance(value, str) and value else None


class ClaudeEventNormalizer:
    def __init__(self, project_root: Path, ids: IdFactory, agent: TurnAgent = CLAUDE_AGENT) -> None:
        self._project_root = project_root
        self._ids = ids
        self._agent = agent
        self._state: ChatState = "idle"
        self._message_id: ChatMessageId | None = None
        self._model: str | None = None
        self._streamed: set[str] = set()
        self._blocks: dict[int, _Block] = {}
        self._started: set[ChatToolCallId] = set()
        self._tools: dict[ChatToolCallId, _ToolCall] = {}
        self._denied: set[ChatToolCallId] = set()
        self._interrupting = False
        self._error_reported = False
        self._cost = TurnCostMeter()
        self._message_routes: tuple[Router, ...] = (
            Route(StreamEvent, self._stream_event),
            Route(AssistantMessage, self._assistant_message),
            Route(UserMessage, self._user_message),
            Route(ResultMessage, self._result_message),
            Route(RateLimitEvent, self._rate_limit_event),
            Route(SystemMessage, self._system_message),
        )
        self._stream_handlers: Mapping[str, Callable[[StreamEventWire], ChatEventBuilders]] = {
            "message_start": self._message_start,
            "content_block_start": self._block_start,
            "content_block_delta": self._block_delta,
        }
        self._block_openers: Mapping[str, Callable[[int, BlockOpenWire], ChatEventBuilders]] = {
            "text": self._open_text,
            "thinking": self._open_thinking,
            "tool_use": self._open_tool,
            "server_tool_use": self._open_tool,
        }
        self._delta_handlers: Mapping[str, Callable[[_Block, int, BlockDeltaWire], ChatEventBuilders]] = {
            "text_delta": self._text_delta,
            "thinking_delta": self._thinking_delta,
            "input_json_delta": self._arguments_delta,
        }

    @property
    def interrupting(self) -> bool:
        return self._interrupting

    @property
    def agent(self) -> TurnAgent:
        return self._agent.resolved(self._model)

    def begin_turn(self) -> None:
        self._message_id = None
        self._blocks.clear()
        self._denied.clear()
        self._streamed.clear()
        self._started.clear()
        self._tools.clear()
        self._interrupting = False
        self._error_reported = False

    def restart_cost(self) -> None:
        self._cost.restart()

    def mark_interrupting(self) -> None:
        self._interrupting = True

    def mark_denied(self, tool_call_id: ChatToolCallId) -> None:
        self._denied.add(tool_call_id)

    def transition(self, state: ChatState) -> ChatEventBuilders:
        if state == self._state:
            return ()
        if self._interrupting and state not in STATES_WHILE_INTERRUPTING:
            return ()
        self._state = state
        return (status_changed(state),)

    def failed(self, code: ChatErrorCode, message: str, retryable: bool) -> ChatEventBuilders:
        self._error_reported = True
        return (error_raised(code, message, retryable),)

    def finished(self, stop_reason: ChatStopReason, duration_ms: int, usage: ChatUsage | None) -> ChatEventBuilders:
        self._interrupting = False
        return (*self.transition("idle"), turn_finished(stop_reason, duration_ms, usage, self.agent))

    def normalize(self, message: Message) -> ChatEventBuilders:
        return dispatch(self._message_routes, message)

    def _current_message(self) -> ChatMessageId:
        if self._message_id is None:
            self._message_id = ChatMessageId(self._ids())
        return self._message_id

    def _stream_event(self, message: StreamEvent) -> ChatEventBuilders:
        if message.parent_tool_use_id is not None:
            return ()
        wire = parse_wire(StreamEventWire, message.event)
        if wire is None:
            return ()
        return self._stream_handlers.get(wire.type, ignore)(wire)

    def _message_start(self, wire: StreamEventWire) -> ChatEventBuilders:
        if wire.message is None:
            return ()
        self._message_id = ChatMessageId(wire.message.id)
        self._streamed.add(wire.message.id)
        self._blocks.clear()
        return ()

    def _block_start(self, wire: StreamEventWire) -> ChatEventBuilders:
        if wire.index is None or wire.content_block is None:
            return ()
        opener = self._block_openers.get(wire.content_block.type, self._open_other)
        return opener(wire.index, wire.content_block)

    def _open_text(self, index: int, block: BlockOpenWire) -> ChatEventBuilders:
        self._blocks[index] = _Block("text")
        return self.transition("streaming")

    def _open_thinking(self, index: int, block: BlockOpenWire) -> ChatEventBuilders:
        self._blocks[index] = _Block("thinking")
        return self.transition("thinking")

    def _open_other(self, index: int, block: BlockOpenWire) -> ChatEventBuilders:
        self._blocks[index] = _Block("other")
        return ()

    def _open_tool(self, index: int, block: BlockOpenWire) -> ChatEventBuilders:
        if block.id is None or block.name is None:
            return self._open_other(index, block)
        tool_call_id = ChatToolCallId(block.id)
        self._blocks[index] = _Block("tool", tool_call_id)
        return self._start_tool(self._current_message(), tool_call_id, block.name)

    def _block_delta(self, wire: StreamEventWire) -> ChatEventBuilders:
        if wire.index is None or wire.delta is None:
            return ()
        block = self._blocks.get(wire.index)
        if block is None:
            return ()
        return self._delta_handlers.get(wire.delta.type, ignore)(block, wire.index, wire.delta)

    def _text_delta(self, block: _Block, index: int, delta: BlockDeltaWire) -> ChatEventBuilders:
        if not delta.text:
            return ()
        return (text_delta(self._current_message(), index, delta.text),)

    def _thinking_delta(self, block: _Block, index: int, delta: BlockDeltaWire) -> ChatEventBuilders:
        if not delta.thinking:
            return ()
        return (reasoning_delta(self._current_message(), index, delta.thinking),)

    def _arguments_delta(self, block: _Block, index: int, delta: BlockDeltaWire) -> ChatEventBuilders:
        if not delta.partial_json or block.tool_call_id is None:
            return ()
        return (tool_call_args_delta(block.tool_call_id, delta.partial_json),)

    def _assistant_message(self, message: AssistantMessage) -> ChatEventBuilders:
        message_id = ChatMessageId(message.message_id) if message.message_id else self._current_message()
        replay = message.parent_tool_use_id is None and message.message_id not in self._streamed
        self._model = message.model
        blocks = tuple(
            builder
            for index, block in enumerate(message.content)
            for builder in dispatch(self._assistant_routes(message_id, index, replay), block)
        )
        return (*blocks, *self._assistant_error(message))

    def _assistant_routes(self, message_id: ChatMessageId, index: int, replay: bool) -> tuple[Router, ...]:
        return (
            Route(TextBlock, lambda block: self._replay_text(message_id, index, block.text, replay)),
            Route(ThinkingBlock, lambda block: self._replay_thinking(message_id, index, block.thinking, replay)),
            Route(ToolUseBlock, lambda block: self._tool_use(message_id, block.id, block.name, block.input)),
            Route(ServerToolUseBlock, lambda block: self._tool_use(message_id, block.id, block.name, block.input)),
            Route(ServerToolResultBlock, self._server_tool_result),
        )

    def _replay_text(self, message_id: ChatMessageId, index: int, text: str, replay: bool) -> ChatEventBuilders:
        if not (replay and text):
            return ()
        return (*self.transition("streaming"), text_delta(message_id, index, text))

    def _replay_thinking(self, message_id: ChatMessageId, index: int, text: str, replay: bool) -> ChatEventBuilders:
        if not (replay and text):
            return ()
        return (*self.transition("thinking"), reasoning_delta(message_id, index, text))

    def _tool_use(
        self, message_id: ChatMessageId, raw_id: str, raw_name: str, raw_input: Mapping[str, object]
    ) -> ChatEventBuilders:
        tool_call_id = ChatToolCallId(raw_id)
        tool_input = json_object(raw_input)
        self._tools[tool_call_id] = _ToolCall(raw_name, tool_input)
        if tool_call_id in self._started:
            return ()
        arguments = (tool_call_args_delta(tool_call_id, json.dumps(tool_input)),) if tool_input else ()
        return (*self._start_tool(message_id, tool_call_id, raw_name), *arguments)

    def _start_tool(self, message_id: ChatMessageId, tool_call_id: ChatToolCallId, raw_name: str) -> ChatEventBuilders:
        if tool_call_id in self._started:
            return ()
        self._started.add(tool_call_id)
        started = tool_call_started(message_id, tool_call_id, claude_tool_identity(raw_name))
        return (started, *self.transition("running_tool"))

    def _server_tool_result(self, block: ServerToolResultBlock) -> ChatEventBuilders:
        output = json.dumps(block.content, default=str)
        return self._finish_tool(ChatToolCallId(block.tool_use_id), False, output, None)

    def _user_message(self, message: UserMessage) -> ChatEventBuilders:
        if isinstance(message.content, str):
            return ()
        return tuple(
            builder
            for block in message.content
            if isinstance(block, ToolResultBlock)
            for builder in self._finish_tool(
                ChatToolCallId(block.tool_use_id),
                bool(block.is_error),
                content_text(block.content),
                message.tool_use_result,
            )
        )

    def _finish_tool(
        self, tool_call_id: ChatToolCallId, is_error: bool, output: str, details: Mapping[str, object] | None
    ) -> ChatEventBuilders:
        call = self._tools.get(tool_call_id, UNKNOWN_TOOL_CALL)
        status = self._tool_status(tool_call_id, is_error)
        outcome = ToolOutcome(tool_call_id, status, call.tool_input, output, details, self._project_root)
        effects = claude_tool_effect(call.raw_name)(outcome)
        preview = clip(output, PREVIEW_LIMIT) if output else None
        finished = tool_call_finished(tool_call_id, status, call.tool_input, preview)
        return (*effects, finished, *self.transition("thinking"))

    def _tool_status(self, tool_call_id: ChatToolCallId, is_error: bool) -> ChatToolStatus:
        rules: tuple[tuple[bool, ChatToolStatus], ...] = (
            (tool_call_id in self._denied, "denied"),
            (is_error and self._interrupting, "interrupted"),
            (is_error, "error"),
        )
        return first_match(rules, TOOL_OK)

    def _assistant_error(self, message: AssistantMessage) -> ChatEventBuilders:
        if message.error is None:
            return ()
        code, retryable = ASSISTANT_ERRORS.get(message.error, UNKNOWN_ERROR)
        text = "\n".join(block.text for block in message.content if isinstance(block, TextBlock)) or message.error
        return self.failed(code, text, retryable)

    def _system_message(self, message: SystemMessage) -> ChatEventBuilders:
        model = message.data.get("model")
        self._model = model if isinstance(model, str) and model else self._model
        return ()

    def _result_message(self, message: ResultMessage) -> ChatEventBuilders:
        usage = self._usage(message)
        self._model = usage.model or self._model
        stop_reason = self._stop_reason(message)
        errors = self._result_error(message, stop_reason)
        return (*errors, usage_reported(usage), *self.finished(stop_reason, message.duration_ms, usage))

    def _usage(self, message: ResultMessage) -> ChatUsage:
        wire = parse_wire(UsageWire, message.usage) or UsageWire()
        model = next(iter(message.model_usage or {}), self._model)
        return ChatUsage(
            model=model,
            tokens_in=wire.input_tokens,
            tokens_out=wire.output_tokens,
            cache_read_tokens=wire.cache_read_input_tokens or 0,
            cache_write_tokens=wire.cache_creation_input_tokens or 0,
            cost_usd=self._cost.turn_cost(message.total_cost_usd),
        )

    def _stop_reason(self, message: ResultMessage) -> ChatStopReason:
        rules: tuple[tuple[bool, ChatStopReason], ...] = (
            (self._interrupting or message.terminal_reason in INTERRUPTED_TERMINAL_REASONS, "interrupted"),
            (message.subtype in MAX_TURNS_MARKERS or message.terminal_reason in MAX_TURNS_MARKERS, "max_turns"),
            (message.is_error, "error"),
        )
        return first_match(rules, TURN_COMPLETED)

    def _result_error(self, message: ResultMessage, stop_reason: ChatStopReason) -> ChatEventBuilders:
        if stop_reason != "error" or self._error_reported:
            return ()
        code, retryable = HTTP_ERRORS.get(message.api_error_status or 0, UNKNOWN_ERROR)
        text = "; ".join(message.errors or ()) or message.result or message.subtype
        return self.failed(code, text, retryable)

    def _rate_limit_event(self, message: RateLimitEvent) -> ChatEventBuilders:
        if message.rate_limit_info.status != "rejected":
            return ()
        return self.failed("rate_limited", RATE_LIMIT_MESSAGE, True)
