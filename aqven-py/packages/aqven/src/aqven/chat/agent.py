from dataclasses import dataclass
from typing import Final

from aqven.ports.chat import AgentBackendKind, ChatSession


@dataclass(frozen=True, slots=True)
class TurnAgent:
    backend: AgentBackendKind
    model: str | None

    def resolved(self, model: str | None) -> TurnAgent:
        return TurnAgent(self.backend, model or self.model)


CLAUDE_AGENT: Final[TurnAgent] = TurnAgent("claude", None)


def session_agent(session: ChatSession) -> TurnAgent:
    return TurnAgent(session.backend, session.model)
