from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, Final, Protocol

from pydantic import Field

from aqven.ports.chat import (
    ChatErrorRaised,
    ChatEvent,
    ChatMessageDelivered,
    ChatMessageQueued,
    ChatSessionId,
    ChatStatus,
    ChatTurnId,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId, ResourceModel

DEFAULT_TRANSCRIPT_TURNS: Final[int] = 20
MAX_TRANSCRIPT_TURNS: Final[int] = 200


class ChatTranscriptTurn(ResourceModel):
    first_seq: Annotated[int, Field(ge=1)]
    last_seq: Annotated[int, Field(ge=1)]
    turn_id: ChatTurnId | None
    events: tuple[ChatEvent, ...]


class ChatTranscriptPage(ResourceModel):
    session_id: ChatSessionId
    turns: tuple[ChatTranscriptTurn, ...]
    carry: tuple[ChatEvent, ...]
    last_seq: Annotated[int, Field(ge=0)]
    before_seq: Annotated[int, Field(ge=1)] | None


class ChatTranscripts(Protocol):
    def page(self, session_id: ChatSessionId, before_seq: int | None, limit: int) -> ChatTranscriptPage: ...


@dataclass(frozen=True, slots=True)
class TurnSpan:
    first_seq: int
    last_seq: int
    turn_id: ChatTurnId | None


@dataclass(frozen=True, slots=True)
class TurnStart:
    seq: int
    turn_id: ChatTurnId | None


def transcript_turn(span: TurnSpan, events: tuple[ChatEvent, ...]) -> ChatTranscriptTurn:
    return ChatTranscriptTurn(first_seq=span.first_seq, last_seq=span.last_seq, turn_id=span.turn_id, events=events)


@dataclass(frozen=True, slots=True)
class FoldedTurn:
    span: TurnSpan
    events: tuple[ChatEvent, ...]
    messages: frozenset[str]
    raw_count: int


@dataclass(frozen=True, slots=True)
class TurnWindow:
    start: int
    stop: int


def turn_spans(first_seq: int, last_seq: int, starts: Sequence[TurnStart]) -> tuple[TurnSpan, ...]:
    opens_with_turn = bool(starts) and starts[0].seq == first_seq
    bounds = tuple(starts) if opens_with_turn else (TurnStart(first_seq, None), *starts)
    ends = (*(bound.seq - 1 for bound in bounds[1:]), last_seq)
    return tuple(TurnSpan(bound.seq, end, bound.turn_id) for bound, end in zip(bounds, ends, strict=True))


def _anchors(messages: Sequence[frozenset[str]]) -> tuple[int, ...]:
    first_turn: dict[str, int] = {}
    for index, opened in enumerate(messages):
        first_turn.update({message: index for message in opened if message not in first_turn})
    return tuple(
        min((first_turn[message] for message in opened), default=index) for index, opened in enumerate(messages)
    )


def turn_window(messages: Sequence[frozenset[str]], limit: int) -> TurnWindow:
    stop = len(messages)
    anchors = _anchors(messages)
    start = max(0, stop - limit)
    while (anchor := min(anchors[start:stop], default=start)) < start:
        start = anchor
    return TurnWindow(start, stop)


def _pending_queue(events: Sequence[ChatEvent]) -> tuple[ChatMessageQueued, ...]:
    pending: dict[ClientOpId, list[ChatMessageQueued]] = {}
    for event in events:
        if isinstance(event, ChatMessageQueued):
            pending.setdefault(event.client_op_id, []).append(event)
            continue
        if isinstance(event, ChatMessageDelivered | ChatTurnStarted):
            pending.pop(event.client_op_id, None)
    return tuple(queued for waiting in pending.values() for queued in waiting)


def boundary_carry(
    latest_state: ChatEvent | None, latest_reset: ChatEvent | None, queue: Sequence[ChatEvent]
) -> tuple[ChatEvent, ...]:
    status = (latest_state,) if isinstance(latest_state, ChatStatus) else ()
    failure = (latest_reset,) if isinstance(latest_reset, ChatErrorRaised) else ()
    return tuple(sorted((*status, *failure, *_pending_queue(queue)), key=lambda event: event.seq))
