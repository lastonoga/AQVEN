import asyncio
import time
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from openai_codex.client import CodexClient
from openai_codex.generated.v2_all import (
    FileChangeThreadItem,
    ItemStartedNotification,
    TurnCompletedNotification,
    TurnStatus,
    TurnSteerResponse,
    UserMessageThreadItem,
)

from aqven.chat.agent import session_agent
from aqven.chat.builders import (
    ChatEventBuilders,
    error_raised,
    message_delivered,
    message_queued,
    status_changed,
    turn_finished,
    turn_started,
)
from aqven.chat.codex_approvals import COMMAND_APPROVAL, DECLINED, CodexApprovalBridge
from aqven.chat.codex_normalizer import CodexNormalizer
from aqven.chat.codex_policy import codex_config
from aqven.chat.codex_runtime import CodexChatRuntime
from aqven.chat.codex_skills import register_codex_skills
from aqven.chat.feed import ChatEmitter
from aqven.chat.host_block import HostFacts, host_block
from aqven.chat.journal import StoredChatSession
from aqven.chat.pending_messages import PendingMessage, PendingMessages
from aqven.chat.project_rules import studio_instructions
from aqven.chat.server_guard import SHELL_TOOL
from aqven.chat.turn_settling import TurnSettler
from aqven.ports.chat import (
    ChatDelivery,
    ChatErrorCode,
    ChatFinishReason,
    ChatMessageId,
    ChatSession,
    ChatSessionId,
    ChatStopReason,
    ChatTurnId,
)
from aqven.runtime.address import ClientOpId, JsonObject

REDACTED = "***"
FILE_DETAILS_TIMEOUT_SECONDS = 2.0
INTERRUPT_TIMEOUT_SECONDS = 5.0
STEER_METHOD: Final[str] = "turn/steer"


@dataclass(frozen=True, slots=True)
class SteerTarget:
    client: CodexClient
    thread_id: str
    turn_id: str

    def params(self, message: PendingMessage) -> JsonObject:
        return {
            "threadId": self.thread_id,
            "expectedTurnId": self.turn_id,
            "clientUserMessageId": message.wire_id,
            "input": [{"type": "text", "text": message.text}],
        }


def steered_client_id(payload: object) -> str | None:
    if not isinstance(payload, ItemStartedNotification):
        return None
    item = payload.item.root
    return item.client_id if isinstance(item, UserMessageThreadItem) else None


def classify_codex_error(error: Exception) -> tuple[ChatErrorCode, bool]:
    name = type(error).__name__
    message = str(error).lower()
    if isinstance(error, FileNotFoundError | OSError) or "transport" in name.lower():
        return "backend_unavailable", True
    if "unauthorized" in message or "authentication" in message or "login" in message:
        return "auth_required", False
    if "rate limit" in message or "429" in message:
        return "rate_limited", True
    if "billing" in message or "quota" in message:
        return "billing", False
    if "invalid request" in message:
        return "invalid_request", False
    return "internal", False


class CodexSessionRunner:
    def __init__(self, stored: StoredChatSession, runtime: CodexChatRuntime) -> None:
        self._session: ChatSession = stored.session
        self._session_id: ChatSessionId = stored.session_id
        self._runtime = runtime
        self._emitter = ChatEmitter(runtime.journal, runtime.signals, stored.session_id)
        self._normalizer: CodexNormalizer | None = None
        self._bridge: CodexApprovalBridge | None = None
        self._client: CodexClient | None = None
        self._delivery: asyncio.Task[None] | None = None
        self._thread_id = stored.backend_session_id
        self._active_turn_id: str | None = None
        self._turn_started_at = 0.0
        self._file_events: dict[str, asyncio.Event] = {}
        self._connecting = asyncio.Lock()
        self._steered = PendingMessages()
        self._after_turn = PendingMessages()
        self._interrupting = False
        self._finish_reason: ChatFinishReason | None = None
        self._settler = TurnSettler(runtime.journal, runtime.signals, runtime.clock)

    @property
    def busy(self) -> bool:
        return self._emitter.turn_id is not None

    async def send(self, client_op_id: ClientOpId, text: str) -> ChatTurnId:
        running = self._emitter.turn_id
        if running is None:
            return self.begin_turn(client_op_id, text)
        message = PendingMessage(client_op_id, text, self._runtime.ids())
        target = self._steer_target()
        if target is None:
            self._queue_after_turn(message)
            return running
        self._steered.add(message)
        self._announce(message, "next_step")
        steered = await self._steer(target, message)
        withdrawn = None if steered else self._steered.take(message.wire_id)
        if withdrawn is not None:
            self._queue_after_turn(withdrawn)
        return running

    def begin_turn(self, client_op_id: ClientOpId, text: str) -> ChatTurnId:
        turn_id = ChatTurnId(self._runtime.ids())
        self._emitter.turn_id = turn_id
        self._interrupting = False
        self._finish_reason = None
        self._turn_started_at = time.monotonic()
        self._normalizer = CodexNormalizer(ChatMessageId(turn_id), self._session.model)
        self._file_events = {}
        self._bridge = CodexApprovalBridge(
            self._session_id,
            self._emitter,
            self._runtime.approvals,
            self._normalizer,
            self._runtime.ids,
            asyncio.get_running_loop(),
            self._file_details,
        )
        self._emitter.emit((turn_started(client_op_id, text, session_agent(self._session)), status_changed("thinking")))
        self._delivery = asyncio.create_task(self._run(text))
        return turn_id

    async def interrupt(self) -> None:
        if not self.busy:
            self._settler.settle(self._stored().session, "agent_lost")
            return
        if self._interrupting:
            await self._force_stop("stop_forced")
            return
        await self._request_stop()

    async def _force_stop(self, reason: ChatFinishReason) -> None:
        self._finish_reason = reason
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        await self._drop_client()
        await self._cancel_delivery()
        self._finish("interrupted")

    async def _request_stop(self) -> None:
        self._interrupting = True
        self._emitter.emit((status_changed("interrupting"),))
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        client, thread_id, turn_id = self._client, self._thread_id, self._active_turn_id
        if client is None or thread_id is None or turn_id is None:
            await self._drop_client()
            await self._cancel_delivery()
            self._reset_unstarted_thread()
            self._finish("interrupted")
            return
        delivery = self._delivery
        try:
            await asyncio.to_thread(client.turn_interrupt, thread_id, turn_id)
        except Exception:
            await self._abandon(client)
            return
        await self._await_delivery(client, delivery)

    async def _await_delivery(self, client: CodexClient, delivery: asyncio.Task[None] | None) -> None:
        if delivery is None:
            return
        done, _ = await asyncio.wait((delivery,), timeout=INTERRUPT_TIMEOUT_SECONDS)
        if done:
            return
        await self._abandon(client)

    async def _abandon(self, client: CodexClient) -> None:
        if client is not self._client:
            return
        await self._drop_client()
        await self._cancel_delivery()
        self._finish("interrupted")

    async def close(self, reason: ChatFinishReason | None = None) -> None:
        self._finish_reason = reason
        self._steered.clear()
        self._after_turn.clear()
        self._runtime.approvals.resolve_session(self._session_id, "session_closed")
        await self._drop_client()
        await self._cancel_delivery()
        self._finish("interrupted")
        self._settler.settle(self._stored().session, reason or "agent_lost")

    async def _run(self, text: str) -> None:
        client: CodexClient | None = None
        turn_id: str | None = None
        try:
            client = await self._connected()
            thread_id = await self._open_thread(client)
            started = await asyncio.to_thread(client.turn_start, thread_id, text, {"approvalPolicy": "on-request"})
            if self._stored().backend_session_id is None:
                self._runtime.journal.remember_backend_session(self._session_id, thread_id)
            turn_id = started.turn.id
            self._active_turn_id = turn_id
            self._emitter.emit((status_changed("streaming"),))
            while self.busy:
                notification = await asyncio.to_thread(client.next_turn_notification, turn_id)
                payload = notification.payload
                if isinstance(payload, TurnCompletedNotification):
                    self._complete(payload)
                    return
                normalizer = self._normalizer
                if normalizer is not None:
                    self._emitter.emit((*self._delivered(payload, normalizer), *normalizer.normalize(notification)))
                if isinstance(payload, ItemStartedNotification) and isinstance(payload.item.root, FileChangeThreadItem):
                    self._file_events.setdefault(payload.item.root.id, asyncio.Event()).set()
        except asyncio.CancelledError:
            self._reset_unstarted_thread()
            self._finish("interrupted")
        except Exception as error:
            await self._fail(error)
        finally:
            if client is not None and turn_id is not None:
                with suppress(Exception):
                    await asyncio.to_thread(client.unregister_turn_notifications, turn_id)
            if self._active_turn_id == turn_id:
                self._active_turn_id = None

    async def _connected(self) -> CodexClient:
        async with self._connecting:
            if self._client is not None:
                return self._client
            stored = self._stored()
            bridge = self._bridge
            if bridge is None:
                raise RuntimeError("Codex approval bridge is not ready")
            root = Path(self._session.project_root)
            config = codex_config(
                root,
                stored.mcp_url,
                self._runtime.mcp_token.get_secret_value(),
                self._session.permission_mode,
            )
            client = self._runtime.client_factory(config, self._approval_handler)
            startup = asyncio.create_task(asyncio.to_thread(self._start_client, client, root))
            try:
                await asyncio.shield(startup)
            except BaseException as error:
                cleanup = asyncio.create_task(self._discard_startup(startup, client))
                if not isinstance(error, asyncio.CancelledError):
                    await cleanup
                raise
            self._client = client
            return client

    @staticmethod
    def _start_client(client: CodexClient, project_root: Path) -> None:
        client.start()
        client.initialize()
        register_codex_skills(client, project_root)

    @staticmethod
    async def _discard_startup(startup: asyncio.Task[None], client: CodexClient) -> None:
        with suppress(Exception):
            await startup
        with suppress(Exception):
            await asyncio.to_thread(client.close)

    async def _open_thread(self, client: CodexClient) -> str:
        stored = self._stored()
        session = stored.session
        facts = HostFacts.of(session.project_root, stored.mcp_url)
        options: JsonObject = {
            "cwd": session.project_root,
            "approvalPolicy": "on-request",
            "developerInstructions": studio_instructions(facts.project_root, host_block("codex", facts)),
        }
        if session.model is not None:
            options["model"] = session.model
        if session.effort is not None:
            options["effort"] = session.effort
        if self._thread_id is not None:
            await asyncio.to_thread(client.thread_resume, self._thread_id, options)
            return self._thread_id
        started = await asyncio.to_thread(client.thread_start, options)
        self._thread_id = started.thread.id
        return self._thread_id

    async def _file_details(self, item_id: str) -> JsonObject | None:
        normalizer = self._normalizer
        if normalizer is None:
            return None
        known = normalizer.file_approval_details(item_id)
        if known is not None:
            return known
        event = self._file_events.setdefault(item_id, asyncio.Event())
        with suppress(TimeoutError):
            await asyncio.wait_for(event.wait(), FILE_DETAILS_TIMEOUT_SECONDS)
        return normalizer.file_approval_details(item_id)

    def _approval_handler(self, method: str, params: JsonObject | None) -> JsonObject:
        bridge = self._bridge
        if bridge is None or self._refused_command(method, params):
            return DECLINED
        return bridge.handler(method, params)

    def _refused_command(self, method: str, params: JsonObject | None) -> bool:
        command = None if method != COMMAND_APPROVAL or params is None else params.get("command")
        if not isinstance(command, str):
            return False
        return self._runtime.command_guard.violation(SHELL_TOOL, {"command": command}) is not None

    def _complete(self, notification: TurnCompletedNotification) -> None:
        turn = notification.turn
        if turn.status == TurnStatus.completed:
            self._finish("end_turn", turn.duration_ms)
            return
        if turn.status == TurnStatus.interrupted:
            self._finish("interrupted", turn.duration_ms)
            return
        message = "Codex turn failed" if turn.error is None else str(turn.error.message)
        self._emitter.emit((error_raised("internal", self._redact(message), False),))
        self._finish("error", turn.duration_ms)

    async def _fail(self, error: Exception) -> None:
        code, retryable = classify_codex_error(error)
        description = f"{type(error).__name__}: {str(error).splitlines()[0] if str(error) else 'unknown error'}"
        await self._drop_client()
        self._reset_unstarted_thread()
        if not self.busy:
            return
        self._emitter.emit((error_raised(code, self._redact(description), retryable),))
        self._finish("error")

    def _reset_unstarted_thread(self) -> None:
        stored = self._runtime.journal.get_session(self._session_id)
        if stored is not None and stored.backend_session_id is None:
            self._thread_id = None

    def _steer_target(self) -> SteerTarget | None:
        client, thread_id, turn_id = self._client, self._thread_id, self._active_turn_id
        if client is None or thread_id is None or turn_id is None:
            return None
        return SteerTarget(client, thread_id, turn_id)

    async def _steer(self, target: SteerTarget, message: PendingMessage) -> bool:
        try:
            await asyncio.to_thread(
                target.client.request, STEER_METHOD, target.params(message), response_model=TurnSteerResponse
            )
        except Exception:
            return False
        return True

    def _announce(self, message: PendingMessage, delivery: ChatDelivery) -> None:
        self._emitter.emit((message_queued(message.client_op_id, message.text, delivery),))

    def _queue_after_turn(self, message: PendingMessage) -> None:
        self._after_turn.add(message)
        self._announce(message, "after_turn")

    def _delivered(self, payload: object, normalizer: CodexNormalizer) -> ChatEventBuilders:
        delivered = self._steered.take(steered_client_id(payload))
        if delivered is None:
            return ()
        normalizer.start_next_message()
        return (message_delivered(delivered.client_op_id),)

    def _requeue_unread(self) -> None:
        unread = self._steered.waiting()
        self._steered.clear()
        for message in unread:
            self._queue_after_turn(message)

    def _start_queued_turn(self) -> None:
        upcoming = self._after_turn.take_first()
        if upcoming is None:
            return
        self.begin_turn(upcoming.client_op_id, upcoming.text)

    def _finish(self, reason: ChatStopReason, duration_ms: int | None = None) -> None:
        if not self.busy:
            return
        self._requeue_unread()
        elapsed = int((time.monotonic() - self._turn_started_at) * 1000)
        normalizer = self._normalizer
        usage = None if normalizer is None else normalizer.last_usage
        self._emitter.emit(
            (
                status_changed("idle"),
                turn_finished(
                    reason,
                    elapsed if duration_ms is None else duration_ms,
                    usage,
                    session_agent(self._session),
                    self._finish_reason,
                ),
            )
        )
        self._emitter.turn_id = None
        self._interrupting = False
        self._finish_reason = None
        self._start_queued_turn()

    def _stored(self) -> StoredChatSession:
        stored = self._runtime.journal.get_session(self._session_id)
        if stored is None:
            raise RuntimeError(f"Codex chat session {self._session_id} is missing")
        return stored

    def _redact(self, text: str) -> str:
        token = self._runtime.mcp_token.get_secret_value()
        return text.replace(token, REDACTED) if token else text

    async def _drop_client(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            with suppress(Exception):
                await asyncio.to_thread(client.close)

    async def _cancel_delivery(self) -> None:
        delivery = self._delivery
        if delivery is None or delivery.done() or delivery is asyncio.current_task():
            return
        delivery.cancel()
        with suppress(asyncio.CancelledError):
            await delivery
