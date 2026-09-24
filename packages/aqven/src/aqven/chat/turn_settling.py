from dataclasses import dataclass
from datetime import datetime
from typing import Final, Protocol

from aqven.chat.agent import session_agent
from aqven.chat.builders import status_changed, turn_finished
from aqven.chat.feed import ChatEmitter, ChatSignals
from aqven.chat.journal import ChatJournal, Clock
from aqven.ports.chat import ChatFinishReason, ChatSession, ChatSessionId, ChatState, ChatStopReason, ChatTurnId

SETTLED_STOP: Final[ChatStopReason] = "interrupted"
MILLISECONDS_PER_SECOND: Final[int] = 1000


@dataclass(frozen=True, slots=True)
class UnsettledTurn:
    state: ChatState
    turn_id: ChatTurnId | None
    started_at: datetime | None


class TurnLedger(Protocol):
    def unsettled_turn(self, session_id: ChatSessionId) -> UnsettledTurn | None: ...


class SettlingJournal(ChatJournal, TurnLedger, Protocol): ...


def elapsed_ms(started_at: datetime | None, now: datetime) -> int:
    if started_at is None:
        return 0
    return max(0, int((now - started_at).total_seconds() * MILLISECONDS_PER_SECOND))


@dataclass(frozen=True, slots=True)
class TurnSettler:
    journal: SettlingJournal
    signals: ChatSignals
    clock: Clock

    def settle(self, session: ChatSession, reason: ChatFinishReason) -> bool:
        unsettled = self.journal.unsettled_turn(session.session_id)
        if unsettled is None:
            return False
        emitter = ChatEmitter(self.journal, self.signals, session.session_id)
        emitter.turn_id = unsettled.turn_id
        duration_ms = elapsed_ms(unsettled.started_at, self.clock())
        agent = session_agent(session)
        emitter.emit((status_changed("idle"), turn_finished(SETTLED_STOP, duration_ms, None, agent, reason)))
        return True

    def sweep(self, reason: ChatFinishReason) -> tuple[ChatSessionId, ...]:
        return tuple(session.session_id for session in self.journal.list_sessions() if self.settle(session, reason))
