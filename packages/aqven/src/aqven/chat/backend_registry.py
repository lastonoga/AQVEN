from collections.abc import Mapping

from aqven.chat.backend_selection import BackendSelection
from aqven.chat.errors import ChatFailure
from aqven.ports.chat import AgentBackend, AgentBackendKind, ChatSession


class BackendRegistry:
    def __init__(self, backends: Mapping[AgentBackendKind, AgentBackend], selection: BackendSelection) -> None:
        self._backends = dict(backends)
        self.selection = selection

    async def selected(self) -> AgentBackend:
        return self.for_kind(await self.selection.get())

    def for_session(self, session: ChatSession) -> AgentBackend:
        return self.for_kind(session.backend)

    def for_kind(self, kind: AgentBackendKind) -> AgentBackend:
        backend = self._backends.get(kind)
        if backend is None:
            raise ChatFailure("CHAT_STATE_CONFLICT", f"chat backend {kind} is unavailable")
        return backend
