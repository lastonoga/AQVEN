import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from pydantic import JsonValue

from aqven.chat.backend_registry import BackendRegistry
from aqven.chat.backend_selection import BackendSelection
from aqven.chat.errors import ChatFailure
from aqven.ports.chat import (
    AgentBackend,
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
from aqven.ports.settings import SettingKey, SettingScope, SettingView


class MemorySettings:
    def __init__(self, value: JsonValue = None) -> None:
        self.value = value

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        if self.value is None:
            return None
        return SettingView(
            scope=scope,
            key=key,
            kind="value",
            value=self.value,
            updated_at=datetime.now(UTC),
        )

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        self.value = value
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))


class FakeBackend:
    def __init__(self, kind: AgentBackendKind) -> None:
        self._kind: AgentBackendKind = kind

    @property
    def kind(self) -> AgentBackendKind:
        return self._kind

    async def login_status(self) -> LoginStatus:
        return LoginStatus(backend=self.kind, state="logged_in", method="subscription", account=None, detail=None)

    async def start_session(self, options: ChatSessionOptions) -> ChatSession:
        raise NotImplementedError

    async def send_message(self, session_id: ChatSessionId, message: ChatMessageRequest) -> ChatTurnId:
        raise NotImplementedError

    def events(self, session_id: ChatSessionId, after_seq: int = 0) -> AsyncIterator[ChatEvent]:
        raise NotImplementedError

    async def answer_approval(self, session_id: ChatSessionId, answer: ApprovalAnswer) -> None:
        raise NotImplementedError

    async def interrupt(self, session_id: ChatSessionId) -> None:
        raise NotImplementedError

    async def close_session(self, session_id: ChatSessionId) -> None:
        raise NotImplementedError


def test_backend_selection_defaults_to_claude_and_persists_codex() -> None:
    values = MemorySettings()
    selection = BackendSelection(values)

    async def scenario() -> None:
        assert await selection.get() == "claude"
        assert await selection.set("codex") == "codex"
        assert await selection.get() == "codex"
        assert values.value == "codex"

    asyncio.run(scenario())


def test_backend_selection_rejects_invalid_stored_value() -> None:
    selection = BackendSelection(MemorySettings({"backend": "codex"}))

    async def scenario() -> None:
        with pytest.raises(ChatFailure, match="chat.backend"):
            await selection.get()

    asyncio.run(scenario())


def test_backend_registry_routes_existing_sessions_by_persisted_agent() -> None:
    claude = FakeBackend("claude")
    codex = FakeBackend("codex")
    selection = BackendSelection(MemorySettings("codex"))
    backends: dict[AgentBackendKind, AgentBackend] = {"claude": claude, "codex": codex}
    registry = BackendRegistry(backends, selection)
    session = ChatSession(
        session_id=ChatSessionId("thread-1"),
        backend="claude",
        project_root="/project",
        flow_id=None,
        model=None,
        permission_mode="default",
        created_at=datetime.now(UTC),
        last_seq=0,
    )

    async def scenario() -> None:
        assert await registry.selected() is codex
        assert registry.for_session(session) is claude

    asyncio.run(scenario())
