import asyncio
import time
from contextlib import suppress
from pathlib import Path

from openai_codex.client import CodexClient
from openai_codex.generated.v2_all import (
    FileChangeThreadItem,
    ItemStartedNotification,
    TurnCompletedNotification,
    TurnStatus,
)

from aqven.chat.agent import session_agent
from aqven.chat.builders import error_raised, status_changed, turn_finished, turn_started
from aqven.chat.codex_approvals import DECLINED, CodexApprovalBridge
from aqven.chat.codex_normalizer import CodexNormalizer
from aqven.chat.codex_policy import codex_config
from aqven.chat.codex_runtime import CodexChatRuntime
from aqven.chat.feed import ChatEmitter
from aqven.chat.journal import StoredChatSession
from aqven.chat.project_rules import project_rules
from aqven.ports.chat import (
    ChatErrorCode,
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

    @property
    def busy(self) -> bool:
        return self._emitter.turn_id is not None

    def begin_turn(self, client_op_id: ClientOpId, text: str) -> ChatTurnId:
        turn_id = ChatTurnId(self._runtime.ids())
        self._emitter.turn_id = turn_id
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
        self._emitter.emit(
            (turn_started(client_op_id, text, session_agent(self._session)), status_changed("thinking"))
        )
        self._delivery = asyncio.create_task(self._run(text))
        return turn_id

    async def interrupt(self) -> None:
        if not self.busy:
            return
        self._emitter.emit((status_changed("interrupting"),))
        self._runtime.approvals.resolve_session(self._session_id, "interrupt")
        client, thread_id, turn_id = self._client, self._thread_id, self._active_turn_id
        if client is None or thread_id is None or turn_id is None:
            await self._drop_client()
            await self._cancel_delivery()
            self._reset_unstarted_thread()
            self._finish("interrupted")
            return
        try:
            await asyncio.to_thread(client.turn_interrupt, thread_id, turn_id)
            delivery = self._delivery
            if delivery is not None:
                await asyncio.wait_for(asyncio.shield(delivery), INTERRUPT_TIMEOUT_SECONDS)
        except Exception:
            await self._drop_client()
            await self._cancel_delivery()
            self._finish("interrupted")

    async def close(self) -> None:
        self._runtime.approvals.resolve_session(self._session_id, "session_closed")
        await self._drop_client()
        await self._cancel_delivery()
        self._finish("interrupted")

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
                    self._emitter.emit(normalizer.normalize(notification))
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
            self._active_turn_id = None

    async def _connected(self) -> CodexClient:
        async with self._connecting:
            if self._client is not None:
                return self._client
            stored = self._stored()
            bridge = self._bridge
            if bridge is None:
                raise RuntimeError("Codex approval bridge is not ready")
            config = codex_config(
                Path(self._session.project_root),
                stored.mcp_url,
                self._runtime.mcp_token.get_secret_value(),
                self._session.permission_mode,
            )
            client = self._runtime.client_factory(config, self._approval_handler)
            startup = asyncio.create_task(asyncio.to_thread(self._start_client, client))
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
    def _start_client(client: CodexClient) -> None:
        client.start()
        client.initialize()

    @staticmethod
    async def _discard_startup(startup: asyncio.Task[None], client: CodexClient) -> None:
        with suppress(Exception):
            await startup
        with suppress(Exception):
            await asyncio.to_thread(client.close)

    async def _open_thread(self, client: CodexClient) -> str:
        options: JsonObject = {"cwd": self._session.project_root, "approvalPolicy": "on-request"}
        rules = project_rules(Path(self._session.project_root))
        if rules:
            options["developerInstructions"] = rules
        if self._session.model is not None:
            options["model"] = self._session.model
        if self._session.effort is not None:
            options["effort"] = self._session.effort
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
        return DECLINED if bridge is None else bridge.handler(method, params)

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

    def _finish(self, reason: ChatStopReason, duration_ms: int | None = None) -> None:
        if not self.busy:
            return
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
                ),
            )
        )
        self._emitter.turn_id = None

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
