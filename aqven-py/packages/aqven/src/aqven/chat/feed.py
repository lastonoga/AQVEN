import asyncio
from collections.abc import AsyncIterator, Iterable
from contextlib import suppress
from typing import Final

from aqven.chat.builders import ChatEventBuilder
from aqven.chat.journal import ChatJournal
from aqven.ports.chat import ChatEvent, ChatSessionId, ChatTurnId

FOLLOW_BATCH: Final[int] = 200
FOLLOW_IDLE_SECONDS: Final[float] = 1.0


class ChatSignals:
    def __init__(self) -> None:
        self._waiters: dict[ChatSessionId, asyncio.Event] = {}

    def waiter(self, session_id: ChatSessionId) -> asyncio.Event:
        current = self._waiters.get(session_id)
        if current is not None:
            return current
        created = asyncio.Event()
        self._waiters[session_id] = created
        return created

    def notify(self, session_id: ChatSessionId) -> None:
        waiter = self._waiters.pop(session_id, None)
        if waiter is None:
            return
        waiter.set()


class ChatEmitter:
    def __init__(self, journal: ChatJournal, signals: ChatSignals, session_id: ChatSessionId) -> None:
        self._journal = journal
        self._signals = signals
        self._session_id = session_id
        self.turn_id: ChatTurnId | None = None

    def emit(self, builders: Iterable[ChatEventBuilder]) -> tuple[ChatEvent, ...]:
        events = tuple(self._journal.append(self._session_id, self.turn_id, build) for build in builders)
        if events:
            self._signals.notify(self._session_id)
        return events


async def follow_chat_events(
    journal: ChatJournal,
    signals: ChatSignals,
    session_id: ChatSessionId,
    after_seq: int,
    idle_seconds: float = FOLLOW_IDLE_SECONDS,
) -> AsyncIterator[ChatEvent]:
    cursor = after_seq
    while True:
        waiter = signals.waiter(session_id)
        events = journal.read(session_id, cursor, FOLLOW_BATCH)
        for event in events:
            yield event
        if events:
            cursor = events[-1].seq
            continue
        stored = journal.get_session(session_id)
        if stored is None or stored.closed:
            return
        with suppress(TimeoutError):
            await asyncio.wait_for(waiter.wait(), idle_seconds)
