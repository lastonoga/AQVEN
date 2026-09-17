from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from pydantic import AwareDatetime

from aqven.chat.builders import ChatEventBuilder
from aqven.ports.chat import ChatEvent, ChatSession, ChatSessionId, ChatTurnId
from aqven.runtime.address import ClientOpId, ResourceModel

type Clock = Callable[[], datetime]
type IdFactory = Callable[[], str]


class StoredChatSession(ResourceModel):
    session: ChatSession
    mcp_url: str
    backend_session_id: str | None
    closed_at: AwareDatetime | None

    @property
    def session_id(self) -> ChatSessionId:
        return self.session.session_id

    @property
    def closed(self) -> bool:
        return self.closed_at is not None


class ChatSessionDirectory(Protocol):
    def get_session(self, session_id: ChatSessionId) -> StoredChatSession | None: ...

    def list_sessions(self) -> tuple[ChatSession, ...]: ...


class ChatJournal(ChatSessionDirectory, Protocol):
    def create_session(self, session: ChatSession, mcp_url: str) -> StoredChatSession: ...

    def remember_backend_session(self, session_id: ChatSessionId, backend_session_id: str) -> None: ...

    def set_closed(self, session_id: ChatSessionId, closed_at: datetime | None) -> None: ...

    def append(self, session_id: ChatSessionId, turn_id: ChatTurnId | None, build: ChatEventBuilder) -> ChatEvent: ...

    def read(self, session_id: ChatSessionId, after_seq: int, limit: int) -> tuple[ChatEvent, ...]: ...

    def turn_of_operation(self, session_id: ChatSessionId, client_op_id: ClientOpId) -> ChatTurnId | None: ...
