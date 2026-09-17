from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from dbos import DBOS, WorkflowStatus
from dbos import error as dbos_errors
from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.protocol import POLLING_INTERVAL_SECONDS, RUN_EVENTS_STREAM
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


def decode_event(payload: object, offset: int, run_id: RunId) -> RunEvent | None:
    try:
        document = STORED_EVENT.validate_python(payload)
        return RUN_EVENT_ADAPTER.validate_python({**document, "seq": offset + 1, "run_id": run_id})
    except ValidationError:
        return None


def status_time(status: WorkflowStatus) -> datetime:
    stamp = status.updated_at or status.created_at or 0
    return datetime.fromtimestamp(stamp / MILLISECONDS, UTC)


def synthesized_finish(status: WorkflowStatus, seq: int) -> RunFinished | None:
    terminal = TERMINAL_DBOS_STATUSES.get(str(status.status))
    if terminal is None:
        return None
    error = None if terminal != "failed" else RunError(code=EXECUTOR_CRASHED, message=str(status.error), address=None)
    return RunFinished(
        seq=seq,
        at=status_time(status),
        run_id=RunId(status.workflow_id),
        status=terminal,
        output_ref=None,
        error=error,
        cost_usd=Decimal(0),
        tokens_in=0,
        tokens_out=0,
    )


@dataclass(frozen=True, slots=True)
class RunEventLog:
    polling_interval_seconds: float = POLLING_INTERVAL_SECONDS

    async def snapshot(self, run_id: RunId) -> tuple[RunEvent, ...]:
        stored = await self.stored(run_id)
        closing = await self._closing(run_id, stored)
        return stored if closing is None else (*stored, closing)

    async def follow(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        async for event in self._read(run_id, after_seq, timeout=None):
            yield event
        closing = await self._closing(run_id, await self.stored(run_id))
        if closing is not None and closing.seq > after_seq:
            yield closing

    async def stored(self, run_id: RunId) -> tuple[RunEvent, ...]:
        return tuple([event async for event in self._read(run_id, 0, timeout=0)])

    async def _read(self, run_id: RunId, after_seq: int, timeout: float | None) -> AsyncIterator[RunEvent]:
        offset = after_seq
        stream = DBOS.read_stream_async(
            run_id,
            RUN_EVENTS_STREAM,
            offset=after_seq,
            polling_interval_sec=self.polling_interval_seconds,
            timeout_seconds=timeout,
        )
        try:
            async for payload in stream:
                event = decode_event(payload, offset, run_id)
                offset += 1
                if event is not None:
                    yield event
        except dbos_errors.DBOSStreamTimeoutError:
            return
        finally:
            await stream.aclose()

    async def _closing(self, run_id: RunId, stored: tuple[RunEvent, ...]) -> RunFinished | None:
        if stored and isinstance(stored[-1], RunFinished):
            return None
        status = await DBOS.get_workflow_status_async(run_id)
        if status is None:
            return None
        return synthesized_finish(status, (stored[-1].seq if stored else 0) + 1)
