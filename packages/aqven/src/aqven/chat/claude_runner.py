import asyncio
import time
from collections.abc import Mapping
from contextlib import suppress
from pathlib import Path
from typing import Final

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeSDKError,
    CLIConnectionError,
    CLINotFoundError,
    Message,
    PermissionResult,
    PermissionResultAllow,
    PermissionResultDeny,
    ProcessError,
    StreamEvent,
    ToolPermissionContext,
    UserMessage,
)

from aqven.chat.agent import session_agent
from aqven.chat.approvals import DENY_MESSAGES, ApprovalVerdict, await_verdict, forced_verdict
from aqven.chat.builders import (
    ChatEventBuilders,
    approval_requested,
    approval_resolved,
    message_delivered,
    message_queued,
    turn_started,
)
from aqven.chat.claude_runtime import ClaudeChatRuntime, ClaudeClient
from aqven.chat.claude_wire import json_object, queued_user_frame, single_frame
from aqven.chat.errors import ChatFailure
from aqven.chat.feed import ChatEmitter
from aqven.chat.journal import StoredChatSession
from aqven.chat.mcp_config import McpConfigFile
from aqven.chat.normalizer import UNKNOWN_ERROR, ClaudeEventNormalizer, ErrorClass, backend_session_id
from aqven.chat.pending_messages import PendingMessage, PendingMessages
from aqven.chat.questions import answered_input
from aqven.chat.routes import first_match
from aqven.chat.tool_names import claude_tool_identity
from aqven.chat.turn_settling import TurnSettler
from aqven.ports.chat import (
    ChatApprovalId,
    ChatFinishReason,
    ChatSession,
    ChatState,
    ChatStopReason,
    ChatToolCallId,
    ChatTurnFinished,
    ChatTurnId,
    ChatTurnOrigin,
)
from aqven.runtime.address import ClientOpId, JsonObject

REDACTED: Final[str] = "***"
THINKING: Final[ChatState] = "thinking"
STOPPED_MESSAGE: Final[str] = "Claude Agent stopped before the turn finished."
INTERRUPT_ACK_SECONDS: Final[float] = 10.0
CONTINUATION_TEXT: Final[str] = ""
CONTINUATION_MESSAGES: Final[tuple[type[Message], ...]] = (StreamEvent, AssistantMessage, UserMessage)


class ClaudeAgentStopped(Exception):
    def __init__(self) -> None:
        super().__init__(STOPPED_MESSAGE)


FAILURE_CLASSES: Final[Mapping[type[BaseException], ErrorClass]] = {
    CLINotFoundError: ("backend_unavailable", False),
    CLIConnectionError: ("backend_unavailable", True),
    ProcessError: ("backend_unavailable", True),
    ClaudeSDKError: ("internal", False),
    OSError: ("backend_unavailable", True),
    ClaudeAgentStopped: ("backend_unavailable", True),
}


def classify_failure(error: Exception) -> ErrorClass:
    return next((FAILURE_CLASSES[kind] for kind in type(error).__mro__ if kind in FAILURE_CLASSES), UNKNOWN_ERROR)


def describe_failure(error: Exception) -> str:
    detail = str(error).strip().splitlines()
    return f"{type(error).__name__}: {detail[0]}" if detail else type(error).__name__


def permission_result(verdict: ApprovalVerdict, updated_input: JsonObject | None) -> PermissionResult:
    if verdict.decision == "allow":
        return PermissionResultAllow(updated_input=updated_input)
    message = verdict.message or DENY_MESSAGES[verdict.resolved_by]
    return PermissionResultDeny(message=message, interrupt=verdict.resolved_by != "user")


def settled_verdict(future: asyncio.Future[ApprovalVerdict]) -> ApprovalVerdict:
    if future.done() and not future.cancelled():
        return future.result()
    return forced_verdict("interrupt")


class ClaudeSessionRunner:
    def __init__(self, session: ChatSession, runtime: ClaudeChatRuntime) -> None:
        self._session_id = session.session_id
        self._runtime = runtime
        self._emitter = ChatEmitter(runtime.journal, runtime.signals, session.session_id)
        self._settler = TurnSettler(runtime.journal, runtime.signals, runtime.clock)
        self._normalizer = ClaudeEventNormalizer(Path(session.project_root), runtime.ids, session_agent(session))
        self._client: ClaudeClient | None = None
        self._mcp_config: McpConfigFile | None = None
        self._reader: asyncio.Task[None] | None = None
        self._delivery: asyncio.Task[None] | None = None
        self._backend_session_id: str | None = None
        self._turn_started_at = 0.0
        self._connecting = asyncio.Lock()
        self._sending = asyncio.Lock()
        self._pending = PendingMessages()
        self._writes: set[asyncio.Task[None]] = set()
        self._written: dict[str, int] = {}
        self._generation = 0
        self._closed = False

    @property
    def busy(self) -> bool:
        return self._emitter.turn_id is not None

    def send(self, client_op_id: ClientOpId, text: str) -> ChatTurnId:
        running = self._emitter.turn_id
        if running is None:
            return self.begin_turn(client_op_id, text)
        message = PendingMessage(client_op_id, text, self._runtime.ids())
        self._pending.add(message)
        self._emitter.emit((message_queued(client_op_id, text, "next_step"),))
        self._schedule_writes((message,))
        return running

    def begin_turn(self, client_op_id: ClientOpId, text: str) -> ChatTurnId:
        turn_id = self._open_turn(client_op_id, text)
        self._delivery = asyncio.create_task(self._deliver(text))
        return turn_id

    def _open_turn(self, client_op_id: ClientOpId, text: str, origin: ChatTurnOrigin = "user") -> ChatTurnId:
        turn_id = ChatTurnId(self._runtime.ids())
        self._emitter.turn_id = turn_id
        self._turn_started_at = time.monotonic()
        self._normalizer.begin_turn()
        started = turn_started(client_op_id, text, self._normalizer.agent, origin)
        self._emitter.emit((started, *self._normalizer.transition("thinking")))
        return turn_id

    async def interrupt(self) -> None:
        if not self.busy:
            self._settler.settle(self._stored().session, "agent_lost")
            return
        if self._normalizer.interrupting:
            await self._force_stop("stop_forced")
            return
        await self._request_stop()

    async def _request_stop(self) -> None:
        self._normalizer.mark_interrupting()
        self._emitter.emit(self._normalizer.transition("interrupting"))
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        client = self._client
        if await self._cancel_delivery() or client is None:
            await self._cancel_writes()
            self._abort_turn((), "interrupted")
            return
        try:
            async with asyncio.timeout(INTERRUPT_ACK_SECONDS):
                await client.interrupt()
        except TimeoutError:
            await self._force_current(client)
        except Exception as error:
            await self._fail_current(client, error)

    async def _force_current(self, client: ClaudeClient) -> None:
        if client is not self._client:
            return
        await self._force_stop("stop_forced")

    async def _force_stop(self, reason: ChatFinishReason) -> None:
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        await self._cancel_delivery()
        await self._cancel_writes()
        await self._drop_client()
        self._abort_turn((), "interrupted", reason)

    async def close(self, reason: ChatFinishReason | None = None) -> None:
        self._closed = True
        self._pending.clear()
        self._runtime.approvals.resolve_session(self._session_id, "session_closed")
        await asyncio.sleep(0)
        await self._cancel_delivery()
        await self._cancel_writes()
        await self._drop_client()
        self._normalizer.mark_interrupting()
        self._abort_turn((), "interrupted", reason)
        self._settler.settle(self._stored().session, reason or "agent_lost")

    async def _deliver(self, text: str) -> None:
        async with self._sending:
            try:
                client = await self._connected()
                await client.query(text)
            except Exception as error:
                await self._fail(error)

    def _schedule_writes(self, messages: tuple[PendingMessage, ...]) -> None:
        for message in messages:
            task = asyncio.create_task(self._write(message))
            self._writes.add(task)
            task.add_done_callback(self._writes.discard)

    async def _write(self, message: PendingMessage) -> None:
        async with self._sending:
            try:
                client = await self._connected()
            except Exception as error:
                await self._fail(error)
                return
            generation = self._generation
            if self._written.get(message.wire_id) == generation:
                return
            try:
                await client.query(single_frame(queued_user_frame(message.wire_id, message.text)))
            except Exception as error:
                await self._fail_current(client, error)
                return
            self._written[message.wire_id] = generation

    async def _fail_current(self, client: ClaudeClient, error: Exception) -> None:
        if client is not self._client:
            return
        await self._fail(error)

    async def _connected(self) -> ClaudeClient:
        async with self._connecting:
            if self._client is not None:
                return self._client
            launch = self._runtime.options.build(self._stored(), self._can_use_tool)
            self._mcp_config = launch.mcp_config
            client = self._runtime.client_factory(launch.options)
            await client.connect()
            self._client = client
            self._generation += 1
            self._normalizer.restart_cost()
            self._reader = asyncio.create_task(self._read(client))
            return client

    def _stored(self) -> StoredChatSession:
        stored = self._runtime.journal.get_session(self._session_id)
        if stored is None:
            raise ChatFailure("NOT_FOUND", f"chat session {self._session_id} does not exist")
        return stored

    async def _read(self, client: ClaudeClient) -> None:
        try:
            async for message in client.receive_messages():
                self._consume(message)
        except Exception as error:
            await self._fail(error)
            return
        await self._fail(ClaudeAgentStopped())

    def _consume(self, message: Message) -> None:
        self._remember(backend_session_id(message))
        self._continue_turn(message)
        events = self._emitter.emit((*self._delivered(message), *self._normalizer.normalize(message)))
        if any(isinstance(event, ChatTurnFinished) for event in events):
            self._turn_closed()

    def _continue_turn(self, message: Message) -> None:
        if self.busy or self._closed or not isinstance(message, CONTINUATION_MESSAGES):
            return
        self._open_turn(ClientOpId(self._runtime.ids()), CONTINUATION_TEXT, "continuation")

    def _delivered(self, message: Message) -> ChatEventBuilders:
        wire_id = message.uuid if isinstance(message, UserMessage) else None
        delivered = self._pending.take(wire_id)
        return () if delivered is None else (message_delivered(delivered.client_op_id),)

    def _turn_closed(self) -> None:
        self._emitter.turn_id = None
        upcoming = self._pending.take_first()
        if upcoming is None:
            return
        self._open_turn(upcoming.client_op_id, upcoming.text)
        self._schedule_writes(self._unwritten((upcoming, *self._pending.waiting())))

    def _unwritten(self, messages: tuple[PendingMessage, ...]) -> tuple[PendingMessage, ...]:
        return tuple(message for message in messages if self._written.get(message.wire_id) != self._generation)

    def _remember(self, session_id: str | None) -> None:
        if session_id is None or session_id == self._backend_session_id:
            return
        self._backend_session_id = session_id
        self._runtime.journal.remember_backend_session(self._session_id, session_id)

    async def _fail(self, error: Exception) -> None:
        code, retryable = classify_failure(error)
        message = self._redact(describe_failure(error))
        await self._drop_client()
        if not self.busy:
            return
        self._abort_turn(self._normalizer.failed(code, message, retryable), "error")

    def _redact(self, text: str) -> str:
        token = self._runtime.options.settings.mcp_token.get_secret_value()
        return text.replace(token, REDACTED) if token else text

    def _abort_turn(
        self, prefix: ChatEventBuilders, stop_reason: ChatStopReason, reason: ChatFinishReason | None = None
    ) -> None:
        if not self.busy:
            return
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        duration_ms = int((time.monotonic() - self._turn_started_at) * 1000)
        self._emitter.emit((*prefix, *self._normalizer.finished(stop_reason, duration_ms, None, reason)))
        self._turn_closed()

    async def reload_settings(self) -> None:
        await self._drop_client()

    async def _drop_client(self) -> None:
        client, reader = self._client, self._reader
        self._client = None
        self._reader = None
        self._generation += 1
        if reader is not None and reader is not asyncio.current_task():
            reader.cancel()
        if client is not None:
            with suppress(Exception):
                await client.disconnect()
        self._remove_mcp_config()

    def _remove_mcp_config(self) -> None:
        config, self._mcp_config = self._mcp_config, None
        if config is None:
            return
        with suppress(OSError):
            config.remove()

    async def _cancel_delivery(self) -> bool:
        delivery = self._delivery
        if delivery is None or delivery.done() or delivery is asyncio.current_task():
            return False
        delivery.cancel()
        await asyncio.wait((delivery,))
        return True

    async def _cancel_writes(self) -> None:
        writes = tuple(task for task in self._writes if task is not asyncio.current_task())
        for task in writes:
            task.cancel()
        if writes:
            await asyncio.wait(writes)

    async def _can_use_tool(
        self, tool_name: str, tool_input: Mapping[str, object], context: ToolPermissionContext
    ) -> PermissionResult:
        tool_call_id = ChatToolCallId(context.tool_use_id or self._runtime.ids())
        refusal = self._runtime.options.guard.violation(tool_name, tool_input)
        if refusal is not None:
            self._normalizer.mark_denied(tool_call_id)
            return PermissionResultDeny(message=refusal, interrupt=False)
        approvals = self._runtime.approvals
        approval_id = ChatApprovalId(self._runtime.ids())
        future = approvals.open(self._session_id, approval_id)
        identity = claude_tool_identity(tool_name)
        reason = context.decision_reason or context.description
        request = approval_requested(approval_id, tool_call_id, identity, json_object(tool_input), reason)
        self._emitter.emit((request, *self._normalizer.transition("waiting_approval")))
        try:
            verdict = await await_verdict(future, self._runtime.options.settings.approval_timeout_seconds)
        except asyncio.CancelledError:
            approvals.discard(approval_id)
            self._settle(approval_id, tool_call_id, settled_verdict(future))
            raise
        approvals.discard(approval_id)
        self._settle(approval_id, tool_call_id, verdict)
        return permission_result(verdict, answered_input(tool_name, tool_input, verdict.answers))

    def _settle(self, approval_id: ChatApprovalId, tool_call_id: ChatToolCallId, verdict: ApprovalVerdict) -> None:
        if verdict.decision == "deny":
            self._normalizer.mark_denied(tool_call_id)
        resolved = approval_resolved(approval_id, verdict.decision, verdict.resolved_by)
        self._emitter.emit((resolved, *self._normalizer.transition(self._state_after_approval(verdict))))

    def _state_after_approval(self, verdict: ApprovalVerdict) -> ChatState:
        rules: tuple[tuple[bool, ChatState], ...] = (
            (bool(self._runtime.approvals.pending_ids(self._session_id)), "waiting_approval"),
            (verdict.decision == "allow", "running_tool"),
        )
        return first_match(rules, THINKING)
