from collections.abc import Callable, Sequence
from functools import reduce
from itertools import groupby
from typing import Final

from aqven.ports.chat import (
    ChatApprovalRequested,
    ChatEvent,
    ChatReasoningDelta,
    ChatStatus,
    ChatTextDelta,
    ChatToolCallArgsDelta,
    ChatToolCallFinished,
    ChatToolCallId,
    ChatToolCallStarted,
    ChatTurnFinished,
)

FOLD_VERSION: Final[int] = 1

type TurnEvents = tuple[ChatEvent, ...]
type FoldRule = Callable[[TurnEvents], TurnEvents]
type DeltaEvent = ChatTextDelta | ChatReasoningDelta | ChatToolCallArgsDelta
type RunKey = tuple[str, str, int]

DELTA_TYPES: Final = (ChatTextDelta, ChatReasoningDelta, ChatToolCallArgsDelta)
STATE_TYPES: Final = (ChatStatus, ChatTurnFinished)
ARGS_OVERWRITE_TYPES: Final = (ChatToolCallFinished, ChatApprovalRequested)
MESSAGE_OPENING_TYPES: Final = (ChatTextDelta, ChatReasoningDelta, ChatToolCallStarted)
NO_EVENT: Final[int] = -1


def _delta(event: ChatEvent) -> DeltaEvent | None:
    return event if isinstance(event, DELTA_TYPES) else None


def _run_key(event: ChatEvent) -> RunKey:
    if isinstance(event, ChatTextDelta | ChatReasoningDelta):
        return (event.type, event.message_id, event.part_index)
    if isinstance(event, ChatToolCallArgsDelta):
        return (event.type, event.tool_call_id, 0)
    return (event.type, "", event.seq)


def _joined(run: TurnEvents) -> ChatEvent:
    head = _delta(run[0])
    if head is None or len(run) == 1:
        return run[0]
    text = "".join(delta.delta for delta in map(_delta, run) if delta is not None)
    return head.model_copy(update={"delta": text, "seq": run[-1].seq})


def drop_superseded_states(events: TurnEvents) -> TurnEvents:
    last_state = max((index for index, event in enumerate(events) if isinstance(event, STATE_TYPES)), default=NO_EVENT)
    return tuple(
        event for index, event in enumerate(events) if not isinstance(event, ChatStatus) or index == last_state
    )


def drop_overwritten_args(events: TurnEvents) -> TurnEvents:
    overwrites: dict[ChatToolCallId, int] = {
        event.tool_call_id: index for index, event in enumerate(events) if isinstance(event, ARGS_OVERWRITE_TYPES)
    }
    return tuple(
        event
        for index, event in enumerate(events)
        if not isinstance(event, ChatToolCallArgsDelta) or index > overwrites.get(event.tool_call_id, NO_EVENT)
    )


def coalesce_delta_runs(events: TurnEvents) -> TurnEvents:
    return tuple(_joined(tuple(run)) for _, run in groupby(events, key=_run_key))


TURN_FOLD: Final[tuple[FoldRule, ...]] = (drop_superseded_states, drop_overwritten_args, coalesce_delta_runs)


def fold_turn(events: Sequence[ChatEvent]) -> TurnEvents:
    return reduce(lambda folded, rule: rule(folded), TURN_FOLD, tuple(events))


def opened_messages(events: Sequence[ChatEvent]) -> frozenset[str]:
    return frozenset(event.message_id for event in events if isinstance(event, MESSAGE_OPENING_TYPES))
