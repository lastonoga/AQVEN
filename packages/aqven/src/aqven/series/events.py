from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Final

from dbos import DBOS
from dbos import error as dbos_errors
from pydantic import TypeAdapter, ValidationError

from aqven.engine.protocol import POLLING_INTERVAL_SECONDS
from aqven.series.model import SeriesId
from aqven.series.protocol import SERIES_EVENTS_STREAM
from aqven.series.views import SeriesEvent, SeriesFinishedEvent

SERIES_EVENT: Final[TypeAdapter[SeriesEvent]] = TypeAdapter(SeriesEvent)


def decode_series_event(payload: object) -> SeriesEvent | None:
    try:
        return SERIES_EVENT.validate_python(payload)
    except ValidationError:
        return None


@dataclass(frozen=True, slots=True)
class SeriesEventLog:
    polling_interval_seconds: float = POLLING_INTERVAL_SECONDS
    timeout_seconds: float | None = None

    async def follow(self, series_id: SeriesId, after_seq: int = 0) -> AsyncIterator[SeriesEvent]:
        stream = DBOS.read_stream_async(
            series_id,
            SERIES_EVENTS_STREAM,
            offset=after_seq,
            polling_interval_sec=self.polling_interval_seconds,
            timeout_seconds=self.timeout_seconds,
        )
        try:
            async for payload in stream:
                event = decode_series_event(payload)
                if event is None:
                    continue
                yield event
                if isinstance(event, SeriesFinishedEvent):
                    return
        except dbos_errors.DBOSStreamTimeoutError, dbos_errors.DBOSNonExistentWorkflowError:
            return
        finally:
            await stream.aclose()

    async def snapshot(self, series_id: SeriesId, after_seq: int = 0) -> tuple[SeriesEvent, ...]:
        reader = SeriesEventLog(self.polling_interval_seconds, timeout_seconds=0)
        return tuple([event async for event in reader.follow(series_id, after_seq)])
