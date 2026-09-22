import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from functools import partial
from pathlib import Path

from pydantic import SecretStr

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.claude_cli import ClaudeLoginProbe, SubprocessCommandRunner, locate_claude_cli
from aqven.chat.claude_options import ClaudeChatSettings, ClaudeOptionsFactory
from aqven.chat.claude_runner import ClaudeSessionRunner
from aqven.chat.claude_runtime import ClaudeChatRuntime
from aqven.chat.env_guard import scrubbed_environment
from aqven.chat.errors import ChatFailure
from aqven.chat.feed import ChatSignals, follow_chat_events
from aqven.chat.journal import StoredChatSession
from aqven.chat.models import claude_catalog
from aqven.chat.sqlite_journal import SqliteChatJournal, utc_now
from aqven.ports.chat import (
    AgentBackendKind,
    ApprovalAnswer,
    ChatEvent,
    ChatMessageRequest,
    ChatModelCatalog,
    ChatSession,
    ChatSessionId,
    ChatSessionOptions,
    ChatTurnId,
    LoginStatus,
)


class ClaudeAgentBackend:
    def __init__(self, runtime: ClaudeChatRuntime) -> None:
        self._runtime = runtime
        self._runners: dict[ChatSessionId, ClaudeSessionRunner] = {}

    @property
    def kind(self) -> AgentBackendKind:
        return "claude"

    async def models(self) -> ChatModelCatalog:
        return claude_catalog()

    async def login_status(self) -> LoginStatus:
        return await self._runtime.login.status()

    async def start_session(self, options: ChatSessionOptions) -> ChatSession:
        if options.resume_session_id is not None:
            return self._reopen(options.resume_session_id)
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
        return follow_chat_events(
            self._runtime.journal, self._runtime.signals, session_id, after_seq, shutdown=self._runtime.shutdown
        )

    async def answer_approval(self, session_id: ChatSessionId, answer: ApprovalAnswer) -> None:
        self._require_open(session_id)
        if self._runtime.approvals.answer(session_id, answer):
            return
        raise ChatFailure("NOT_WAITING", f"approval {answer.approval_id} is not waiting for an answer")

    async def interrupt(self, session_id: ChatSessionId) -> None:
        self._require_open(session_id)
        runner = self._runners.get(session_id)
        if runner is None:
            return
        await runner.interrupt()

    async def apply_settings(self, session_id: ChatSessionId) -> None:
        runner = self._runners.get(session_id)
        if runner is not None:
            await runner.reload_settings()

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

    def _reopen(self, session_id: ChatSessionId) -> ChatSession:
        stored = self._require(session_id)
        self._runtime.journal.set_closed(session_id, None)
        return stored.session

    def _require(self, session_id: ChatSessionId) -> StoredChatSession:
        stored = self._runtime.journal.get_session(session_id)
        if stored is None:
            raise ChatFailure("NOT_FOUND", f"chat session {session_id} does not exist")
        return stored

    def _require_open(self, session_id: ChatSessionId) -> StoredChatSession:
        stored = self._require(session_id)
        if stored.closed:
            raise ChatFailure("CHAT_STATE_CONFLICT", f"chat session {session_id} is closed")
        return stored

    def _runner(self, stored: StoredChatSession) -> ClaudeSessionRunner:
        known = self._runners.get(stored.session_id)
        if known is not None:
            return known
        created = ClaudeSessionRunner(stored.session, self._runtime)
        self._runners[stored.session_id] = created
        return created


@dataclass(frozen=True, slots=True)
class ClaudeChat:
    backend: ClaudeAgentBackend
    journal: SqliteChatJournal

    async def aclose(self) -> None:
        await self.backend.aclose()
        self.journal.close()


def create_claude_chat(
    project_root: Path,
    mcp_token: SecretStr,
    allowed_tools: tuple[str, ...] = (),
    shutdown_signal: asyncio.Event | None = None,
) -> ClaudeChat:
    cli = locate_claude_cli()
    journal = SqliteChatJournal.for_project(project_root)
    runtime = ClaudeChatRuntime(
        journal=journal,
        signals=ChatSignals(),
        approvals=ApprovalRegistry(),
        options=ClaudeOptionsFactory(
            ClaudeChatSettings(
                mcp_token=mcp_token,
                cli_path=cli.path,
                allowed_tools=allowed_tools,
            )
        ),
        login=ClaudeLoginProbe(cli, SubprocessCommandRunner(partial(scrubbed_environment, project_root))),
        clock=utc_now,
        shutdown=shutdown_signal or asyncio.Event(),
    )
    return ClaudeChat(ClaudeAgentBackend(runtime), journal)
