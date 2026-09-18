import asyncio
import time
from collections.abc import Mapping
from contextlib import suppress
from pathlib import Path
from typing import Final

from claude_agent_sdk import (
    ClaudeSDKError,
    CLIConnectionError,
    CLINotFoundError,
    Message,
    PermissionResult,
    PermissionResultAllow,
    PermissionResultDeny,
    ProcessError,
    ToolPermissionContext,
)

from aqven.chat.agent import session_agent
from aqven.chat.approvals import DENY_MESSAGES, ApprovalVerdict, await_verdict, forced_verdict
from aqven.chat.builders import ChatEventBuilders, approval_requested, approval_resolved, turn_started
from aqven.chat.claude_runtime import ClaudeChatRuntime, ClaudeClient
from aqven.chat.claude_wire import json_object
from aqven.chat.errors import ChatFailure
from aqven.chat.feed import ChatEmitter
from aqven.chat.journal import StoredChatSession
from aqven.chat.mcp_config import McpConfigFile
from aqven.chat.normalizer import UNKNOWN_ERROR, ClaudeEventNormalizer, ErrorClass, backend_session_id
from aqven.chat.routes import first_match
from aqven.chat.tool_names import claude_tool_identity
from aqven.ports.chat import (
    ChatApprovalId,
    ChatSession,
    ChatState,
    ChatStopReason,
    ChatToolCallId,
    ChatTurnFinished,
    ChatTurnId,
)
from aqven.runtime.address import ClientOpId

REDACTED: Final[str] = "***"
THINKING: Final[ChatState] = "thinking"
STOPPED_MESSAGE: Final[str] = "Claude Agent stopped before the turn finished."


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


def permission_result(verdict: ApprovalVerdict) -> PermissionResult:
    if verdict.decision == "allow":
        return PermissionResultAllow()
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
        self._normalizer = ClaudeEventNormalizer(Path(session.project_root), runtime.ids, session_agent(session))
        self._client: ClaudeClient | None = None
        self._mcp_config: McpConfigFile | None = None
        self._reader: asyncio.Task[None] | None = None
        self._delivery: asyncio.Task[None] | None = None
        self._backend_session_id: str | None = None
        self._turn_started_at = 0.0
        self._connecting = asyncio.Lock()

    @property
    def busy(self) -> bool:
        return self._emitter.turn_id is not None

    def begin_turn(self, client_op_id: ClientOpId, text: str) -> ChatTurnId:
        turn_id = ChatTurnId(self._runtime.ids())
        self._emitter.turn_id = turn_id
        self._turn_started_at = time.monotonic()
        self._normalizer.begin_turn()
        agent = self._normalizer.agent
        self._emitter.emit((turn_started(client_op_id, text, agent), *self._normalizer.transition("thinking")))
        self._delivery = asyncio.create_task(self._deliver(text))
        return turn_id

    async def interrupt(self) -> None:
        if not self.busy:
            return
        self._normalizer.mark_interrupting()
        self._emitter.emit(self._normalizer.transition("interrupting"))
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        client = self._client
        if await self._cancel_delivery() or client is None:
            self._abort_turn((), "interrupted")
            return
        try:
            await client.interrupt()
        except Exception as error:
            await self._fail(error)

    async def close(self) -> None:
        self._runtime.approvals.resolve_session(self._session_id, "session_closed")
        await asyncio.sleep(0)
        await self._cancel_delivery()
        await self._drop_client()
        self._normalizer.mark_interrupting()
        self._abort_turn((), "interrupted")

    async def _deliver(self, text: str) -> None:
        try:
            client = await self._connected()
            await client.query(text)
        except Exception as error:
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
        events = self._emitter.emit(self._normalizer.normalize(message))
        if any(isinstance(event, ChatTurnFinished) for event in events):
            self._emitter.turn_id = None

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

    def _abort_turn(self, prefix: ChatEventBuilders, stop_reason: ChatStopReason) -> None:
        if not self.busy:
            return
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        duration_ms = int((time.monotonic() - self._turn_started_at) * 1000)
        self._emitter.emit((*prefix, *self._normalizer.finished(stop_reason, duration_ms, None)))
        self._emitter.turn_id = None

    async def _drop_client(self) -> None:
        client, reader = self._client, self._reader
        self._client = None
        self._reader = None
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
        return permission_result(verdict)

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
