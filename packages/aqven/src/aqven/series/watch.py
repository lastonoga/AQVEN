import logging
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from aqven.engine.events import EventObserver
from aqven.engine.request import RunSpec
from aqven.runtime.address import RunId
from aqven.runtime.events import NodeResumed, NodeSuspended, NodeWaitTimedOut, RunEvent
from aqven.series.feed import SeriesStatusNotice, series_key
from aqven.series.model import SeriesId, SeriesStatus
from aqven.series.presenter import shown_status, waiting_attempts
from aqven.series.services import SeriesServices
from aqven.series.slot import SERIES_SLOT

WATCH_LOGGER: Final = logging.getLogger("aqven.series.watch")
SUBJECT_ROLE: Final = "subject"
WAIT_EVENTS: Final = (NodeSuspended, NodeResumed, NodeWaitTimedOut)
PREVIOUS_SHOWN: Final[Mapping[SeriesStatus, SeriesStatus]] = {
    SeriesStatus.WAITING_HUMAN: SeriesStatus.RUNNING,
    SeriesStatus.RUNNING: SeriesStatus.WAITING_HUMAN,
}


def touches_a_wait(events: Sequence[RunEvent]) -> bool:
    return any(isinstance(event, WAIT_EVENTS) for event in events)


@dataclass(slots=True)
class WaitingSeries:
    waiting: set[SeriesId] = field(default_factory=set[SeriesId])
    lock: threading.Lock = field(default_factory=threading.Lock)

    def flip(self, series_id: SeriesId, waiting: bool) -> bool:
        with self.lock:
            if (series_id in self.waiting) is waiting:
                return False
            self.waiting.symmetric_difference_update((series_id,))
            return True


@dataclass(frozen=True, slots=True)
class AttemptWaitObserver:
    series_id: SeriesId
    board: WaitingSeries
    services: SeriesServices

    async def written(self, position: int, events: Sequence[RunEvent]) -> None:
        if not touches_a_wait(events):
            return
        try:
            await self._announce()
        except Exception as error:
            WATCH_LOGGER.warning("series %s wait status was not announced: %s", self.series_id, error)

    async def _announce(self) -> None:
        store = self.services.store
        record = await store.series(self.series_id)
        if record is None or record.status is not SeriesStatus.RUNNING:
            return
        attempts = await store.attempts(self.series_id)
        waiting = await self.services.waits.open_runs()
        shown = shown_status(record, waiting_attempts(record, attempts, waiting))
        if not self.board.flip(self.series_id, shown is SeriesStatus.WAITING_HUMAN):
            return
        notice = SeriesStatusNotice(series=series_key(record), status=shown, previous=PREVIOUS_SHOWN.get(shown))
        self.services.feed.publish(notice)


@dataclass(frozen=True, slots=True)
class SeriesRunWatch:
    board: WaitingSeries = field(default_factory=WaitingSeries)

    def observer(self, run_id: RunId, spec: RunSpec) -> EventObserver | None:
        tag = spec.series
        services = SERIES_SLOT.current
        if tag is None or tag.role != SUBJECT_ROLE or services is None:
            return None
        return AttemptWaitObserver(series_id=SeriesId(tag.series_id), board=self.board, services=services)
