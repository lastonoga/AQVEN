import asyncio
import threading
from pathlib import Path

from openai_codex.client import ApprovalHandler, CodexClient, CodexConfig
from openai_codex.generated.v2_all import (
    GetAccountParams,
    GetAccountResponse,
    Thread,
    ThreadResumeParams,
    ThreadResumeResponse,
    ThreadStartParams,
    ThreadStartResponse,
    Turn,
    TurnCompletedNotification,
    TurnInterruptResponse,
    TurnStartParams,
    TurnStartResponse,
    TurnStatus,
)
from openai_codex.models import InitializeResponse, JsonObject, JsonValue, Notification
from pydantic import BaseModel, SecretStr

from aqven.chat.agent_plugin import PLUGIN_SKILLS, agent_skills_root
from aqven.chat.codex_backend import CodexAgentBackend
from aqven.chat.codex_skills import SKILLS_LIST_METHOD
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.ports.chat import ChatEvent, ChatMessageRequest, ChatSessionOptions, ChatTurnFinished, ChatTurnStarted
from aqven.runtime.address import ClientOpId


def plugin_skill_listing(cwd: str) -> JsonObject:
    skills: list[JsonValue] = [
        {"name": name, "description": name, "enabled": True, "path": str(agent_skills_root()), "scope": "user"}
        for name in PLUGIN_SKILLS
    ]
    return {"data": [{"cwd": cwd, "errors": [], "skills": skills}]}


class FakeCodexClient(CodexClient):
    def __init__(self, config: CodexConfig, approval_handler: ApprovalHandler) -> None:
        super().__init__(config, approval_handler)
        self.calls: list[str] = []
        self.thread_options: list[JsonObject] = []
        self.requests: list[tuple[str, JsonObject]] = []

    def request[M: BaseModel](self, method: str, params: JsonObject | None, *, response_model: type[M]) -> M:
        self.calls.append(method)
        self.requests.append((method, dict(params or {})))
        answer = plugin_skill_listing(str(self.config.cwd)) if method == SKILLS_LIST_METHOD else {}
        return response_model.model_validate(answer)

    def start(self) -> None:
        self.calls.append("start")

    def initialize(self) -> InitializeResponse:
        self.calls.append("initialize")
        return InitializeResponse.model_construct()

    def account_read(self, params: GetAccountParams | JsonObject | None = None) -> GetAccountResponse:
        self.calls.append("account/read")
        return GetAccountResponse.model_validate(
            {
                "account": {"type": "chatgpt", "email": "test@example.com", "planType": "plus"},
                "requiresOpenaiAuth": True,
            }
        )

    def thread_start(self, params: ThreadStartParams | JsonObject | None = None) -> ThreadStartResponse:
        self.calls.append("thread/start")
        if isinstance(params, dict):
            self.thread_options.append(params)
        return ThreadStartResponse.model_construct(thread=Thread.model_construct(id="codex-thread-1"))

    def thread_resume(
        self, thread_id: str, params: ThreadResumeParams | JsonObject | None = None
    ) -> ThreadResumeResponse:
        self.calls.append("thread/resume")
        if isinstance(params, dict):
            self.thread_options.append(params)
        return ThreadResumeResponse.model_construct(thread=Thread.model_construct(id=thread_id))

    def turn_start(
        self,
        thread_id: str,
        input_items: list[JsonObject] | JsonObject | str,
        params: TurnStartParams | JsonObject | None = None,
    ) -> TurnStartResponse:
        self.calls.append("turn/start")
        turn = Turn.model_construct(id="codex-turn-1", status=TurnStatus.in_progress)
        return TurnStartResponse.model_construct(turn=turn)

    def next_turn_notification(self, turn_id: str) -> Notification:
        self.calls.append("next")
        completed = TurnCompletedNotification.model_construct(
            thread_id="codex-thread-1",
            turn=Turn.model_construct(id=turn_id, status=TurnStatus.completed, duration_ms=12, items=[]),
        )
        return Notification("turn/completed", completed)

    def unregister_turn_notifications(self, turn_id: str) -> None:
        self.calls.append("unregister")

    def close(self) -> None:
        self.calls.append("close")


def test_codex_backend_persists_thread_and_finishes_turn(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("Shared project guidance", encoding="utf-8")
    (tmp_path / "CLAUDE.md").write_text("Additional project guidance", encoding="utf-8")
    clients: list[FakeCodexClient] = []

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = FakeCodexClient(config, approval_handler)
        clients.append(client)
        return client

    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    backend = CodexAgentBackend(
        journal, tmp_path, "http://127.0.0.1:9300/mcp", SecretStr("token"), client_factory=factory
    )

    async def scenario() -> tuple[str, str, str]:
        status = await backend.login_status()
        session = await backend.start_session(
            ChatSessionOptions(project_root=str(tmp_path), mcp_url="http://127.0.0.1:9300/mcp")
        )
        events = backend.events(session.session_id)
        message = ChatMessageRequest(text="hello", client_op_id=ClientOpId("op-1"))
        turn = await backend.send_message(session.session_id, message)
        seen: list[ChatEvent] = []
        async for event in events:
            seen.append(event)
            if isinstance(event, ChatTurnFinished):
                break
        stored = journal.get_session(session.session_id)
        assert stored is not None
        assert isinstance(seen[0], ChatTurnStarted) and seen[0].backend == "codex"
        assert isinstance(seen[-1], ChatTurnFinished) and seen[-1].stop_reason == "end_turn"
        assert await backend.send_message(session.session_id, message) == turn
        await backend.aclose()
        restored = CodexAgentBackend(
            journal, tmp_path, "http://127.0.0.1:9300/mcp", SecretStr("token"), client_factory=factory
        )
        later = restored.events(session.session_id, stored.session.last_seq)
        await restored.send_message(
            session.session_id, ChatMessageRequest(text="continue", client_op_id=ClientOpId("op-2"))
        )
        async for event in later:
            if isinstance(event, ChatTurnFinished):
                break
        await restored.aclose()
        return status.state, stored.backend_session_id or "", session.backend

    assert asyncio.run(scenario()) == ("logged_in", "codex-thread-1", "codex")
    assert any("thread/start" in client.calls and "turn/start" in client.calls for client in clients)
    assert any("thread/resume" in client.calls and "turn/start" in client.calls for client in clients)
    assert all(
        "Shared project guidance" in str(options.get("developerInstructions"))
        and "Additional project guidance" in str(options.get("developerInstructions"))
        for client in clients
        for options in client.thread_options
    )
    journal.close()


def test_codex_interrupt_finishes_running_turn(tmp_path: Path) -> None:
    release = threading.Event()

    class InterruptibleCodexClient(FakeCodexClient):
        def next_turn_notification(self, turn_id: str) -> Notification:
            self.calls.append("next")
            if not release.wait(5):
                raise TimeoutError("interrupt did not arrive")
            completed = TurnCompletedNotification.model_construct(
                thread_id="codex-thread-1",
                turn=Turn.model_construct(id=turn_id, status=TurnStatus.interrupted, duration_ms=7, items=[]),
            )
            return Notification("turn/completed", completed)

        def turn_interrupt(self, thread_id: str, turn_id: str) -> TurnInterruptResponse:
            self.calls.append("turn/interrupt")
            release.set()
            return TurnInterruptResponse.model_construct()

    clients: list[InterruptibleCodexClient] = []

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = InterruptibleCodexClient(config, approval_handler)
        clients.append(client)
        return client

    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    backend = CodexAgentBackend(
        journal, tmp_path, "http://127.0.0.1:9300/mcp", SecretStr("token"), client_factory=factory
    )

    async def scenario() -> tuple[ChatTurnFinished, ...]:
        session = await backend.start_session(
            ChatSessionOptions(project_root=str(tmp_path), mcp_url="http://127.0.0.1:9300/mcp")
        )
        await backend.send_message(session.session_id, ChatMessageRequest(text="wait", client_op_id=ClientOpId("op-1")))
        for _ in range(100):
            if clients and "next" in clients[0].calls:
                break
            await asyncio.sleep(0.01)
        await backend.interrupt(session.session_id)
        events = journal.read(session.session_id, 0, 100)
        await backend.aclose()
        return tuple(event for event in events if isinstance(event, ChatTurnFinished))

    finished = asyncio.run(scenario())
    assert len(finished) == 1 and finished[0].stop_reason == "interrupted"
    assert "turn/interrupt" in clients[0].calls
    journal.close()


def test_codex_status_prompts_for_cli_login_without_persisting_account(tmp_path: Path) -> None:
    class SignedOutCodexClient(FakeCodexClient):
        def account_read(self, params: GetAccountParams | JsonObject | None = None) -> GetAccountResponse:
            self.calls.append("account/read")
            return GetAccountResponse.model_validate({"account": None, "requiresOpenaiAuth": True})

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        return SignedOutCodexClient(config, approval_handler)

    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    backend = CodexAgentBackend(
        journal, tmp_path, "http://127.0.0.1:9300/mcp", SecretStr("token"), client_factory=factory
    )
    status = asyncio.run(backend.login_status())
    assert status.backend == "codex" and status.state == "logged_out"
    assert status.detail is not None and "codex login" in status.detail
    assert journal.list_sessions() == ()
    journal.close()


def test_failed_first_turn_does_not_persist_unresumable_codex_thread(tmp_path: Path) -> None:
    clients: list[FakeCodexClient] = []

    class FailingFirstTurnClient(FakeCodexClient):
        def turn_start(
            self,
            thread_id: str,
            input_items: list[JsonObject] | JsonObject | str,
            params: TurnStartParams | JsonObject | None = None,
        ) -> TurnStartResponse:
            self.calls.append("turn/start failed")
            raise RuntimeError("turn start failed")

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = (
            FailingFirstTurnClient(config, approval_handler)
            if not clients
            else FakeCodexClient(config, approval_handler)
        )
        clients.append(client)
        return client

    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    backend = CodexAgentBackend(
        journal, tmp_path, "http://127.0.0.1:9300/mcp", SecretStr("token"), client_factory=factory
    )

    async def scenario() -> tuple[str | None, str | None]:
        session = await backend.start_session(
            ChatSessionOptions(project_root=str(tmp_path), mcp_url="http://127.0.0.1:9300/mcp")
        )
        first_events = backend.events(session.session_id)
        await backend.send_message(
            session.session_id, ChatMessageRequest(text="first", client_op_id=ClientOpId("op-1"))
        )
        async for event in first_events:
            if isinstance(event, ChatTurnFinished):
                break
        failed = journal.get_session(session.session_id)
        assert failed is not None
        next_events = backend.events(session.session_id, failed.session.last_seq)
        await backend.send_message(
            session.session_id, ChatMessageRequest(text="retry", client_op_id=ClientOpId("op-2"))
        )
        async for event in next_events:
            if isinstance(event, ChatTurnFinished):
                break
        recovered = journal.get_session(session.session_id)
        assert recovered is not None
        await backend.aclose()
        return failed.backend_session_id, recovered.backend_session_id

    failed_id, recovered_id = asyncio.run(scenario())
    assert failed_id is None and recovered_id == "codex-thread-1"
    assert "thread/start" in clients[-1].calls and "thread/resume" not in clients[-1].calls
    journal.close()
