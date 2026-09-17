from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Annotated, Final, Literal, NewType, Protocol, get_args

from pydantic import AwareDatetime, Field, TypeAdapter

from aqven.runtime.address import ClientOpId, JsonObject, RequestModel, ResourceModel

ChatSessionId = NewType("ChatSessionId", str)
ChatTurnId = NewType("ChatTurnId", str)
ChatMessageId = NewType("ChatMessageId", str)
ChatToolCallId = NewType("ChatToolCallId", str)
ChatApprovalId = NewType("ChatApprovalId", str)

type AgentBackendKind = Literal["claude"]
type ChatPermissionMode = Literal["default", "accept_edits", "plan"]
type ChatState = Literal["idle", "thinking", "streaming", "running_tool", "waiting_approval", "interrupting"]
type ChatToolStatus = Literal["ok", "error", "denied", "interrupted"]
type ChatFileChange = Literal["added", "modified", "deleted"]
type ApprovalDecision = Literal["allow", "deny"]
type ApprovalResolver = Literal["user", "interrupt", "session_closed"]
type ChatErrorCode = Literal[
    "auth_required",
    "rate_limited",
    "billing",
    "backend_unavailable",
    "invalid_request",
    "internal",
]
type ChatStopReason = Literal["end_turn", "interrupted", "max_turns", "error"]
type LoginState = Literal["logged_in", "logged_out", "unknown"]
type LoginMethod = Literal["subscription", "api_key"]


class ChatSessionOptions(RequestModel):
    project_root: Annotated[str, Field(min_length=1)]
    mcp_url: Annotated[str, Field(min_length=1)]
    model: str | None = None
    permission_mode: ChatPermissionMode = "default"
    resume_session_id: ChatSessionId | None = None


class ChatSession(ResourceModel):
    session_id: ChatSessionId
    backend: AgentBackendKind
    project_root: str
    model: str | None
    permission_mode: ChatPermissionMode
    created_at: AwareDatetime
    last_seq: Annotated[int, Field(ge=0)]


class ChatMessageRequest(RequestModel):
    text: Annotated[str, Field(min_length=1)]
    client_op_id: ClientOpId


class ApprovalAnswer(RequestModel):
    approval_id: ChatApprovalId
    decision: ApprovalDecision
    message: str | None = None


class LoginStatus(ResourceModel):
    backend: AgentBackendKind
    state: LoginState
    method: LoginMethod | None
    account: str | None
    detail: str | None


class ChatUsage(ResourceModel):
    model: str | None
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]
    cache_read_tokens: Annotated[int, Field(ge=0)]
    cache_write_tokens: Annotated[int, Field(ge=0)]
    cost_usd: Decimal | None


class ChatEventBase(ResourceModel):
    seq: Annotated[int, Field(ge=1)]
    at: AwareDatetime
    session_id: ChatSessionId
    turn_id: ChatTurnId | None


class ChatTurnStarted(ChatEventBase):
    type: Literal["chat_turn_started"] = "chat_turn_started"
    client_op_id: ClientOpId
    text: str


class ChatTextDelta(ChatEventBase):
    type: Literal["chat_text_delta"] = "chat_text_delta"
    message_id: ChatMessageId
    part_index: Annotated[int, Field(ge=0)]
    delta: Annotated[str, Field(min_length=1)]


class ChatReasoningDelta(ChatEventBase):
    type: Literal["chat_reasoning_delta"] = "chat_reasoning_delta"
    message_id: ChatMessageId
    part_index: Annotated[int, Field(ge=0)]
    delta: Annotated[str, Field(min_length=1)]


class ChatToolCallStarted(ChatEventBase):
    type: Literal["chat_tool_call_started"] = "chat_tool_call_started"
    message_id: ChatMessageId
    tool_call_id: ChatToolCallId
    tool_name: str
    mcp_server: str | None


class ChatToolCallArgsDelta(ChatEventBase):
    type: Literal["chat_tool_call_args_delta"] = "chat_tool_call_args_delta"
    tool_call_id: ChatToolCallId
    delta: Annotated[str, Field(min_length=1)]


class ChatToolCallFinished(ChatEventBase):
    type: Literal["chat_tool_call_finished"] = "chat_tool_call_finished"
    tool_call_id: ChatToolCallId
    status: ChatToolStatus
    input: JsonObject
    result_preview: str | None
    truncated: bool


class ChatFileEdit(ChatEventBase):
    type: Literal["chat_file_edit"] = "chat_file_edit"
    tool_call_id: ChatToolCallId
    path: str
    change: ChatFileChange
    diff: str


class ChatCommand(ChatEventBase):
    type: Literal["chat_command"] = "chat_command"
    tool_call_id: ChatToolCallId
    command: str
    description: str | None
    exit_code: int | None
    output_preview: str
    truncated: bool


class ChatApprovalRequested(ChatEventBase):
    type: Literal["chat_approval_requested"] = "chat_approval_requested"
    approval_id: ChatApprovalId
    tool_call_id: ChatToolCallId
    tool_name: str
    input: JsonObject
    reason: str | None


class ChatApprovalResolved(ChatEventBase):
    type: Literal["chat_approval_resolved"] = "chat_approval_resolved"
    approval_id: ChatApprovalId
    decision: ApprovalDecision
    resolved_by: ApprovalResolver


class ChatStatus(ChatEventBase):
    type: Literal["chat_status"] = "chat_status"
    state: ChatState


class ChatUsageReported(ChatEventBase):
    type: Literal["chat_usage"] = "chat_usage"
    usage: ChatUsage


class ChatErrorRaised(ChatEventBase):
    type: Literal["chat_error"] = "chat_error"
    code: ChatErrorCode
    message: str
    retryable: bool


class ChatTurnFinished(ChatEventBase):
    type: Literal["chat_turn_finished"] = "chat_turn_finished"
    stop_reason: ChatStopReason
    duration_ms: Annotated[int, Field(ge=0)]
    usage: ChatUsage | None


type ChatEvent = Annotated[
    ChatTurnStarted
    | ChatTextDelta
    | ChatReasoningDelta
    | ChatToolCallStarted
    | ChatToolCallArgsDelta
    | ChatToolCallFinished
    | ChatFileEdit
    | ChatCommand
    | ChatApprovalRequested
    | ChatApprovalResolved
    | ChatStatus
    | ChatUsageReported
    | ChatErrorRaised
    | ChatTurnFinished,
    Field(discriminator="type"),
]

type ChatEventType = Literal[
    "chat_turn_started",
    "chat_text_delta",
    "chat_reasoning_delta",
    "chat_tool_call_started",
    "chat_tool_call_args_delta",
    "chat_tool_call_finished",
    "chat_file_edit",
    "chat_command",
    "chat_approval_requested",
    "chat_approval_resolved",
    "chat_status",
    "chat_usage",
    "chat_error",
    "chat_turn_finished",
]

CHAT_EVENT_TYPES: Final[frozenset[str]] = frozenset(get_args(ChatEventType.__value__))

CHAT_EVENT_ADAPTER: Final[TypeAdapter[ChatEvent]] = TypeAdapter(ChatEvent)


class AgentBackend(Protocol):
    @property
    def kind(self) -> AgentBackendKind: ...

    async def login_status(self) -> LoginStatus: ...

    async def start_session(self, options: ChatSessionOptions) -> ChatSession: ...

    async def send_message(self, session_id: ChatSessionId, message: ChatMessageRequest) -> ChatTurnId: ...

    def events(self, session_id: ChatSessionId, after_seq: int = 0) -> AsyncIterator[ChatEvent]: ...

    async def answer_approval(self, session_id: ChatSessionId, answer: ApprovalAnswer) -> None: ...

    async def interrupt(self, session_id: ChatSessionId) -> None: ...

    async def close_session(self, session_id: ChatSessionId) -> None: ...
