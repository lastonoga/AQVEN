from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import TypedDict

from aqven.chat.agent import TurnAgent
from aqven.chat.tool_names import ToolIdentity
from aqven.ports.chat import (
    ApprovalDecision,
    ApprovalResolver,
    ChatApprovalId,
    ChatApprovalRequested,
    ChatApprovalResolved,
    ChatCommand,
    ChatErrorCode,
    ChatErrorRaised,
    ChatEvent,
    ChatFileChange,
    ChatFileEdit,
    ChatMessageId,
    ChatReasoningDelta,
    ChatSessionId,
    ChatState,
    ChatStatus,
    ChatStopReason,
    ChatTextDelta,
    ChatToolCallArgsDelta,
    ChatToolCallFinished,
    ChatToolCallId,
    ChatToolCallStarted,
    ChatToolStatus,
    ChatTurnFinished,
    ChatTurnId,
    ChatTurnStarted,
    ChatUsage,
    ChatUsageReported,
)
from aqven.runtime.address import ClientOpId, JsonObject


class ChatStamp(TypedDict):
    seq: int
    at: datetime
    session_id: ChatSessionId
    turn_id: ChatTurnId | None


type ChatEventBuilder = Callable[[ChatStamp], ChatEvent]
type ChatEventBuilders = tuple[ChatEventBuilder, ...]


@dataclass(frozen=True, slots=True)
class Clip:
    text: str
    truncated: bool


def clip(text: str, limit: int) -> Clip:
    if len(text) <= limit:
        return Clip(text, False)
    return Clip(text[:limit], True)


def turn_started(client_op_id: ClientOpId, text: str, agent: TurnAgent) -> ChatEventBuilder:
    return lambda stamp: ChatTurnStarted(
        **stamp, client_op_id=client_op_id, text=text, backend=agent.backend, model=agent.model
    )


def text_delta(message_id: ChatMessageId, part_index: int, delta: str) -> ChatEventBuilder:
    return lambda stamp: ChatTextDelta(**stamp, message_id=message_id, part_index=part_index, delta=delta)


def reasoning_delta(message_id: ChatMessageId, part_index: int, delta: str) -> ChatEventBuilder:
    return lambda stamp: ChatReasoningDelta(**stamp, message_id=message_id, part_index=part_index, delta=delta)


def tool_call_started(
    message_id: ChatMessageId, tool_call_id: ChatToolCallId, identity: ToolIdentity
) -> ChatEventBuilder:
    return lambda stamp: ChatToolCallStarted(
        **stamp,
        message_id=message_id,
        tool_call_id=tool_call_id,
        tool_name=identity.name,
        mcp_server=identity.mcp_server,
    )


def tool_call_args_delta(tool_call_id: ChatToolCallId, delta: str) -> ChatEventBuilder:
    return lambda stamp: ChatToolCallArgsDelta(**stamp, tool_call_id=tool_call_id, delta=delta)


def tool_call_finished(
    tool_call_id: ChatToolCallId, status: ChatToolStatus, tool_input: JsonObject, preview: Clip | None
) -> ChatEventBuilder:
    return lambda stamp: ChatToolCallFinished(
        **stamp,
        tool_call_id=tool_call_id,
        status=status,
        input=tool_input,
        result_preview=None if preview is None else preview.text,
        truncated=False if preview is None else preview.truncated,
    )


def file_edit(tool_call_id: ChatToolCallId, path: str, change: ChatFileChange, diff: str) -> ChatEventBuilder:
    return lambda stamp: ChatFileEdit(**stamp, tool_call_id=tool_call_id, path=path, change=change, diff=diff)


def command_ran(
    tool_call_id: ChatToolCallId, command: str, description: str | None, output: Clip, exit_code: int | None = None
) -> ChatEventBuilder:
    return lambda stamp: ChatCommand(
        **stamp,
        tool_call_id=tool_call_id,
        command=command,
        description=description,
        exit_code=exit_code,
        output_preview=output.text,
        truncated=output.truncated,
    )


def approval_requested(
    approval_id: ChatApprovalId,
    tool_call_id: ChatToolCallId,
    identity: ToolIdentity,
    tool_input: JsonObject,
    reason: str | None,
) -> ChatEventBuilder:
    return lambda stamp: ChatApprovalRequested(
        **stamp,
        approval_id=approval_id,
        tool_call_id=tool_call_id,
        tool_name=identity.name,
        input=tool_input,
        reason=reason,
    )


def approval_resolved(
    approval_id: ChatApprovalId, decision: ApprovalDecision, resolved_by: ApprovalResolver
) -> ChatEventBuilder:
    return lambda stamp: ChatApprovalResolved(
        **stamp, approval_id=approval_id, decision=decision, resolved_by=resolved_by
    )


def status_changed(state: ChatState) -> ChatEventBuilder:
    return lambda stamp: ChatStatus(**stamp, state=state)


def usage_reported(usage: ChatUsage, message_id: ChatMessageId | None = None) -> ChatEventBuilder:
    return lambda stamp: ChatUsageReported(**stamp, message_id=message_id, usage=usage)


def error_raised(code: ChatErrorCode, message: str, retryable: bool) -> ChatEventBuilder:
    return lambda stamp: ChatErrorRaised(**stamp, code=code, message=message, retryable=retryable)


def turn_finished(
    stop_reason: ChatStopReason, duration_ms: int, usage: ChatUsage | None, agent: TurnAgent
) -> ChatEventBuilder:
    return lambda stamp: ChatTurnFinished(
        **stamp,
        stop_reason=stop_reason,
        duration_ms=max(duration_ms, 0),
        usage=usage,
        backend=agent.backend,
        model=agent.model,
    )
