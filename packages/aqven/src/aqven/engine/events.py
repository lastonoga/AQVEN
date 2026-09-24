import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Final, Protocol

from dbos import DBOS
from pydantic import ValidationError

from aqven.engine.protocol import RUN_EVENTS_STREAM
from aqven.ports.execution import EventBuilder, EventStamp, OutputPart
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId
from aqven.runtime.events import (
    OUTPUT_DELTA_BATCH_MS,
    RUN_EVENT_ADAPTER,
    NodeAttemptDiscarded,
    NodeOutputDelta,
    RunEvent,
)
from aqven.runtime.vocabulary import AttemptCauseKind

MILLISECONDS: Final = 1000


def utc_now() -> datetime:
    return datetime.now(UTC)


def event_payload(event: RunEvent) -> JsonObject:
    return event.model_dump(mode="json", by_alias=True)


@dataclass(slots=True)
class SeqCounter:
    next_seq: int = 1

    def take(self) -> int:
        taken = self.next_seq
        self.next_seq += 1
        return taken


class EventSink(Protocol):
    async def emit(self, build: EventBuilder) -> RunEvent: ...

    def defer(self, order: int, events: tuple[JsonObject, ...]) -> None: ...


class EventObserver(Protocol):
    async def written(self, position: int, events: Sequence[RunEvent]) -> None: ...


@dataclass(frozen=True, slots=True)
class UnobservedEvents:
    async def written(self, position: int, events: Sequence[RunEvent]) -> None:
        return None


def deferred_event(payload: JsonObject) -> tuple[RunEvent, ...]:
    try:
        return (RUN_EVENT_ADAPTER.validate_python(payload),)
    except ValidationError:
        return ()


@dataclass(slots=True)
class StreamEventSink:
    run_id: RunId
    counter: SeqCounter = field(default_factory=SeqCounter)
    deferred: dict[int, tuple[JsonObject, ...]] = field(default_factory=dict[int, tuple[JsonObject, ...]])
    observer: EventObserver = field(default_factory=UnobservedEvents)

    async def emit(self, build: EventBuilder) -> RunEvent:
        flushed = await self._flush_deferred()
        event = build(EventStamp(run_id=self.run_id, seq=self.counter.take(), at=utc_now()))
        await DBOS.write_stream_async(RUN_EVENTS_STREAM, event_payload(event))
        await self.observer.written(event.seq, (*flushed, event))
        return event

    def defer(self, order: int, events: tuple[JsonObject, ...]) -> None:
        self.deferred[order] = events

    async def _flush_deferred(self) -> tuple[RunEvent, ...]:
        flushed: list[RunEvent] = []
        for order in sorted(self.deferred):
            for payload in self.deferred.pop(order):
                self.counter.take()
                await DBOS.write_stream_async(RUN_EVENTS_STREAM, payload)
                flushed.extend(deferred_event(payload))
        return tuple(flushed)


@dataclass(slots=True)
class BufferedEventSink:
    run_id: RunId
    counter: SeqCounter = field(default_factory=SeqCounter)
    events: list[JsonObject] = field(default_factory=list[JsonObject])
    deferred: dict[int, tuple[JsonObject, ...]] = field(default_factory=dict[int, tuple[JsonObject, ...]])

    async def emit(self, build: EventBuilder) -> RunEvent:
        self._flush_deferred()
        event = build(EventStamp(run_id=self.run_id, seq=self.counter.take(), at=utc_now()))
        self.events.append(event_payload(event))
        return event

    def defer(self, order: int, events: tuple[JsonObject, ...]) -> None:
        self.deferred[order] = events

    def drain(self) -> tuple[JsonObject, ...]:
        self._flush_deferred()
        return tuple(self.events)

    def _flush_deferred(self) -> None:
        for order in sorted(self.deferred):
            self.events.extend(self.deferred.pop(order))


@dataclass(slots=True)
class PartBuffer:
    part: OutputPart
    pending: str = ""
    cumulative: int = 0
    opened_at: float = 0.0


def in_step() -> bool:
    return DBOS.step_id is not None


class NullOutputSink:
    async def append(self, attempt: int, part: OutputPart, delta: str) -> None:
        return None

    async def discard(self, attempt: int, cause: AttemptCauseKind) -> None:
        return None

    async def flush(self) -> None:
        return None


@dataclass(slots=True)
class BatchedOutputSink:
    run_id: RunId
    address: ExecutionAddress
    batch_seconds: float = OUTPUT_DELTA_BATCH_MS / MILLISECONDS
    buffers: dict[tuple[int, int], PartBuffer] = field(default_factory=dict[tuple[int, int], PartBuffer])
    timer: asyncio.Task[None] | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def append(self, attempt: int, part: OutputPart, delta: str) -> None:
        if not delta or not in_step():
            return
        key = (attempt, part.index)
        buffer = self.buffers.get(key)
        if buffer is None:
            buffer = PartBuffer(part=part)
            self.buffers[key] = buffer
        await self._switch_part(key)
        if not buffer.pending:
            buffer.opened_at = asyncio.get_running_loop().time()
        buffer.pending += delta
        buffer.cumulative += len(delta)
        if asyncio.get_running_loop().time() - buffer.opened_at >= self.batch_seconds:
            await self._write_key(key)
            return
        self._arm_timer()

    async def discard(self, attempt: int, cause: AttemptCauseKind) -> None:
        if not in_step():
            return
        keys = [key for key in self.buffers if key[0] == attempt]
        for key in keys:
            del self.buffers[key]
        event = NodeAttemptDiscarded(
            seq=1,
            at=utc_now(),
            run_id=self.run_id,
            address=self.address,
            attempt=attempt,
            cause=cause,
            discarded_parts=len(keys),
        )
        await DBOS.write_stream_async(RUN_EVENTS_STREAM, event_payload(event))

    async def flush(self) -> None:
        self._cancel_timer()
        if not in_step():
            self.buffers.clear()
            return
        for key in list(self.buffers):
            await self._write_key(key)

    async def _switch_part(self, current: tuple[int, int]) -> None:
        for key in [key for key, buffer in self.buffers.items() if key != current and buffer.pending]:
            await self._write_key(key)

    async def _write_key(self, key: tuple[int, int]) -> None:
        async with self.lock:
            buffer = self.buffers.get(key)
            if buffer is None or not buffer.pending:
                return
            delta, buffer.pending = buffer.pending, ""
            event = NodeOutputDelta(
                seq=1,
                at=utc_now(),
                run_id=self.run_id,
                address=self.address,
                attempt=key[0],
                part_kind=buffer.part.kind,
                part_index=buffer.part.index,
                tool_call_id=buffer.part.tool_call_id,
                tool_name=buffer.part.tool_name,
                delta=delta,
                cumulative_length=buffer.cumulative,
            )
            await DBOS.write_stream_async(RUN_EVENTS_STREAM, event_payload(event))

    def _arm_timer(self) -> None:
        if self.timer is not None and not self.timer.done():
            return
        self.timer = asyncio.create_task(self._flush_later())

    def _cancel_timer(self) -> None:
        timer = self.timer
        self.timer = None
        if timer is None or timer.done() or timer is asyncio.current_task():
            return
        timer.cancel()

    async def _flush_later(self) -> None:
        await asyncio.sleep(self.batch_seconds)
        for key in list(self.buffers):
            await self._write_key(key)
