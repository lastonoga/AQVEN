import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

from openai_codex.generated.v2_all import ApiKeyAccount, ChatgptAccount
from pydantic import SecretStr

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.codex_policy import codex_config
from aqven.chat.codex_runner import CodexSessionRunner
from aqven.chat.codex_runtime import CodexChatRuntime, CodexClientFactory, sdk_client
from aqven.chat.errors import ChatFailure
from aqven.chat.feed import ChatSignals, follow_chat_events
from aqven.chat.journal import ChatJournal, StoredChatSession
from aqven.chat.sqlite_journal import utc_now
from aqven.ports.chat import (
    AgentBackendKind,
    ApprovalAnswer,
    ChatEvent,
    ChatMessageRequest,
    ChatSession,
    ChatSessionId,
    ChatSessionOptions,
    ChatTurnId,
    LoginStatus,
)
from aqven.runtime.address import JsonObject


def decline_request(method: str, params: JsonObject | None) -> JsonObject:
    return {"decision": "decline"}


class CodexAgentBackend:
    def __init__(
        self,
        journal: ChatJournal,
        project_root: Path,
        mcp_url: str,
        mcp_token: SecretStr,
        client_factory: CodexClientFactory = sdk_client,
    ) -> None:
        self._runtime = CodexChatRuntime(
            journal=journal,
            signals=ChatSignals(),
            approvals=ApprovalRegistry(),
            mcp_token=mcp_token,
            clock=utc_now,
            client_factory=client_factory,
        )
        self._project_root = project_root
        self._mcp_url = mcp_url
        self._runners: dict[ChatSessionId, CodexSessionRunner] = {}

    @property
    def kind(self) -> AgentBackendKind:
        return "codex"

    async def login_status(self) -> LoginStatus:
        config = codex_config(
            self._project_root, self._mcp_url, self._runtime.mcp_token.get_secret_value(), "default"
        )

        def probe() -> LoginStatus:
            client = self._runtime.client_factory(config, decline_request)
            try:
                client.start()
                client.initialize()
                response = client.account_read()
            finally:
                client.close()
            if response.account is None:
                return LoginStatus(
                    backend=self.kind,
                    state="logged_out",
                    method=None,
                    account=None,
                    detail="Run codex login in a terminal to sign in.",
                )
            account = response.account.root
            if isinstance(account, ChatgptAccount):
                return LoginStatus(
                    backend=self.kind,
                    state="logged_in",
                    method="subscription",
                    account=account.email,
                    detail=None,
                )
            if isinstance(account, ApiKeyAccount):
                return LoginStatus(backend=self.kind, state="logged_in", method="api_key", account=None, detail=None)
            return LoginStatus(backend=self.kind, state="unknown", method=None, account=None, detail=None)

        try:
            return await asyncio.to_thread(probe)
        except Exception as error:
            token = self._runtime.mcp_token.get_secret_value()
            detail = str(error).splitlines()[0] if str(error) else type(error).__name__
            return LoginStatus(
                backend=self.kind,
                state="unknown",
                method=None,
                account=None,
                detail=detail.replace(token, "***") if token else detail,
            )

    async def start_session(self, options: ChatSessionOptions) -> ChatSession:
        if options.resume_session_id is not None:
            stored = self._require(options.resume_session_id)
            self._runtime.journal.set_closed(stored.session_id, None)
            return stored.session
        session = ChatSession(
            session_id=ChatSessionId(self._runtime.ids()),
            backend=self.kind,
            project_root=options.project_root,
            flow_id=options.flow_id,
            model=options.model,
            permission_mode=options.permission_mode,
            created_at=self._runtime.clock(),
            last_seq=0,
        )
        return self._runtime.journal.create_session(session, options.mcp_url).session

    async def send_message(self, session_id: ChatSessionId, message: ChatMessageRequest) -> ChatTurnId:
        stored = self._require_open(session_id)
        known = self._runtime.journal.turn_of_operation(session_id, message.client_op_id)
        if known is not None:
            return known
        runner = self._runner(stored)
        if runner.busy:
            raise ChatFailure("CHAT_STATE_CONFLICT", f"chat session {session_id} is already running a turn")
        return runner.begin_turn(message.client_op_id, message.text)

    def events(self, session_id: ChatSessionId, after_seq: int = 0) -> AsyncIterator[ChatEvent]:
        self._require(session_id)
        return follow_chat_events(self._runtime.journal, self._runtime.signals, session_id, after_seq)

    async def answer_approval(self, session_id: ChatSessionId, answer: ApprovalAnswer) -> None:
        self._require_open(session_id)
        if self._runtime.approvals.answer(session_id, answer):
            return
        raise ChatFailure("NOT_WAITING", f"approval {answer.approval_id} is not waiting for an answer")

    async def interrupt(self, session_id: ChatSessionId) -> None:
        self._require_open(session_id)
        runner = self._runners.get(session_id)
        if runner is not None:
            await runner.interrupt()

    async def close_session(self, session_id: ChatSessionId) -> None:
        self._require(session_id)
        runner = self._runners.pop(session_id, None)
        if runner is not None:
            await runner.close()
        self._runtime.journal.set_closed(session_id, self._runtime.clock())
        self._runtime.signals.notify(session_id)

    async def aclose(self) -> None:
        runners = tuple(self._runners.values())
        self._runners.clear()
        for runner in runners:
            await runner.close()

    def _require(self, session_id: ChatSessionId) -> StoredChatSession:
        stored = self._runtime.journal.get_session(session_id)
        if stored is None or stored.session.backend != self.kind:
            raise ChatFailure("NOT_FOUND", f"Codex chat session {session_id} does not exist")
        return stored

    def _require_open(self, session_id: ChatSessionId) -> StoredChatSession:
        stored = self._require(session_id)
        if stored.closed:
            raise ChatFailure("CHAT_STATE_CONFLICT", f"chat session {session_id} is closed")
        return stored

    def _runner(self, stored: StoredChatSession) -> CodexSessionRunner:
        known = self._runners.get(stored.session_id)
        if known is not None:
            return known
        created = CodexSessionRunner(stored, self._runtime)
        self._runners[stored.session_id] = created
        return created
