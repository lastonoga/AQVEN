from collections.abc import AsyncGenerator, AsyncIterator, Callable, Iterable, Mapping
from contextlib import aclosing
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final, Protocol

from dbos import DBOS
from dbos import error as dbos_errors
from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.protocol import POLLING_INTERVAL_SECONDS, RUN_EVENTS_STREAM
from aqven.engine.system_streams import StoredStream, WorkflowState, system_stream_table
from aqven.runtime.address import RunId
from aqven.runtime.events import RUN_EVENT_ADAPTER, RunEvent, RunFinished
from aqven.runtime.executions import RunError
from aqven.runtime.vocabulary import TerminalRunStatus

TERMINAL_DBOS_STATUSES: Final[Mapping[str, TerminalRunStatus]] = {
    "SUCCESS": "completed",
    "ERROR": "failed",
    "MAX_RECOVERY_ATTEMPTS_EXCEEDED": "failed",
    "CANCELLED": "cancelled",
}
EXECUTOR_CRASHED: Final = "INTERNAL"
STORED_EVENT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])
MILLISECONDS: Final = 1000
STORED_READ_TIMEOUT_SECONDS: Final = 0


def decode_event(payload: object, offset: int, run_id: RunId) -> RunEvent | None:
    try:
        document = STORED_EVENT.validate_python(payload)
        return RUN_EVENT_ADAPTER.validate_python({**document, "seq": offset + 1, "run_id": run_id})
    except ValidationError:
        return None


def decoded_events(payloads: Iterable[object], run_id: RunId) -> tuple[RunEvent, ...]:
    events = (decode_event(payload, offset, run_id) for offset, payload in enumerate(payloads))
    return tuple(event for event in events if event is not None)


def status_time(state: WorkflowState) -> datetime:
    stamp = state.updated_at or state.created_at or 0
    return datetime.fromtimestamp(stamp / MILLISECONDS, UTC)


def synthesized_finish(state: WorkflowState, seq: int) -> RunFinished | None:
    terminal = TERMINAL_DBOS_STATUSES.get(str(state.status))
    if terminal is None:
        return None
    error = None if terminal != "failed" else RunError(code=EXECUTOR_CRASHED, message=str(state.error), address=None)
    return RunFinished(
        seq=seq,
        at=status_time(state),
        run_id=state.run_id,
        status=terminal,
        output_ref=None,
        error=error,
        cost_usd=Decimal(0),
        tokens_in=0,
        tokens_out=0,
    )


@dataclass(frozen=True, slots=True)
class StoredRun:
    events: tuple[RunEvent, ...]
    state: WorkflowState | None

    def closing(self) -> RunFinished | None:
        if self.events and isinstance(self.events[-1], RunFinished):
            return None
        if self.state is None:
            return None
        return synthesized_finish(self.state, (self.events[-1].seq if self.events else 0) + 1)


async def stream_payloads(
    run_id: RunId, key: str, offset: int, timeout: float | None, polling_interval_seconds: float
) -> AsyncGenerator[object]:
    stream = DBOS.read_stream_async(
        run_id,
        key,
        offset=offset,
        polling_interval_sec=polling_interval_seconds,
        timeout_seconds=timeout,
    )
    try:
        async for payload in stream:
            yield payload
    except dbos_errors.DBOSStreamTimeoutError:
        return
    finally:
        await stream.aclose()


class StoredStreamSource(Protocol):
    async def read(self, run_id: RunId, key: str) -> StoredStream: ...


@dataclass(frozen=True, slots=True)
class StreamApiSource:
    polling_interval_seconds: float = POLLING_INTERVAL_SECONDS

    async def read(self, run_id: RunId, key: str) -> StoredStream:
        stream = stream_payloads(run_id, key, 0, STORED_READ_TIMEOUT_SECONDS, self.polling_interval_seconds)
        payloads = tuple([payload async for payload in stream])
        status = await DBOS.get_workflow_status_async(run_id)
        return StoredStream(payloads=payloads, state=None if status is None else WorkflowState.of(status))


def preferred_stored_source() -> StoredStreamSource:
    table = system_stream_table()
    return StreamApiSource() if table is None else table


@dataclass(frozen=True, slots=True)
class RunEventLog:
    polling_interval_seconds: float = POLLING_INTERVAL_SECONDS
    stored_source: Callable[[], StoredStreamSource] = preferred_stored_source

    async def snapshot(self, run_id: RunId) -> tuple[RunEvent, ...]:
        stored = await self._stored(run_id)
        closing = stored.closing()
        return stored.events if closing is None else (*stored.events, closing)

    async def follow(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        async for event in self._live(run_id, after_seq):
            yield event
        closing = (await self._stored(run_id)).closing()
        if closing is not None and closing.seq > after_seq:
            yield closing

    async def stored(self, run_id: RunId) -> tuple[RunEvent, ...]:
        return (await self._stored(run_id)).events

    async def _stored(self, run_id: RunId) -> StoredRun:
        stream = await self.stored_source().read(run_id, RUN_EVENTS_STREAM)
        return StoredRun(events=decoded_events(stream.payloads, run_id), state=stream.state)

    async def _live(self, run_id: RunId, after_seq: int) -> AsyncIterator[RunEvent]:
        offset = after_seq
        live = stream_payloads(run_id, RUN_EVENTS_STREAM, after_seq, None, self.polling_interval_seconds)
        async with aclosing(live) as payloads:
            async for payload in payloads:
                event = decode_event(payload, offset, run_id)
                offset += 1
                if event is not None:
                    yield event
