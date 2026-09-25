import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from aqven.series.model import TERMINAL_STATUSES, AttemptRecord, AttemptState, PauseSpan, SeriesRecord, SeriesStatus
from aqven.series.presenter import attempts_total, shown_status
from aqven.series.protocol import PROBE_WIDTH
from aqven.series.views import SeriesEta

ETA_WINDOW_SECONDS: Final = 300.0
ETA_SETTLING_SECONDS: Final = 30.0
ETA_SETTLING_ATTEMPTS: Final = 3
SECONDS_PER_MINUTE: Final = 60
RATE_DIGITS: Final = 2
PAUSED_STATUSES: Final = frozenset({SeriesStatus.AWAITING_APPROVAL, SeriesStatus.WAITING_HUMAN})
PAUSED_ETA: Final = SeriesEta(
    state="paused", attempts_per_minute=None, remaining_seconds=None, finish_at=None, window_seconds=0
)


def paused_seconds(span: PauseSpan, start: datetime, end: datetime) -> float:
    left = max(span.started_at, start)
    right = min(span.ended_at or end, end)
    return max(0.0, (right - left).total_seconds())


def running_seconds(start: datetime, end: datetime, pauses: Sequence[PauseSpan]) -> float:
    paused = sum(paused_seconds(span, start, end) for span in pauses)
    return max(0.0, (end - start).total_seconds() - paused)


def finish_times(attempts: Sequence[AttemptRecord]) -> tuple[datetime, ...]:
    return tuple(
        sorted(
            row.finished_at for row in attempts if row.state is AttemptState.FINISHED and row.finished_at is not None
        )
    )


@dataclass(frozen=True, slots=True)
class Throughput:
    after_probe: int
    recent: int
    window: float

    @property
    def settled(self) -> bool:
        return self.after_probe >= ETA_SETTLING_ATTEMPTS and self.window >= ETA_SETTLING_SECONDS and self.recent > 0

    @property
    def per_minute(self) -> float:
        return round(self.recent * SECONDS_PER_MINUTE / self.window, RATE_DIGITS)

    def seconds_for(self, remaining: int) -> int:
        return math.ceil(remaining * self.window / self.recent)


NO_THROUGHPUT: Final = Throughput(after_probe=0, recent=0, window=0.0)


def throughput(finished: Sequence[datetime], pauses: Sequence[PauseSpan], now: datetime) -> Throughput:
    if len(finished) < PROBE_WIDTH:
        return NO_THROUGHPUT
    after = finished[PROBE_WIDTH:]
    window = min(ETA_WINDOW_SECONDS, running_seconds(finished[PROBE_WIDTH - 1], now, pauses))
    recent = sum(1 for moment in after if running_seconds(moment, now, pauses) <= window)
    return Throughput(after_probe=len(after), recent=recent, window=window)


def estimating_eta(pace: Throughput) -> SeriesEta:
    return SeriesEta(
        state="estimating",
        attempts_per_minute=None,
        remaining_seconds=None,
        finish_at=None,
        window_seconds=round(pace.window),
    )


def measured_eta(pace: Throughput, remaining: int, now: datetime) -> SeriesEta:
    seconds = pace.seconds_for(remaining)
    return SeriesEta(
        state="running",
        attempts_per_minute=pace.per_minute,
        remaining_seconds=seconds,
        finish_at=now + timedelta(seconds=seconds),
        window_seconds=round(pace.window),
    )


def series_eta(record: SeriesRecord, attempts: Sequence[AttemptRecord], waits: int, now: datetime) -> SeriesEta | None:
    if record.status in TERMINAL_STATUSES:
        return None
    if shown_status(record, waits) in PAUSED_STATUSES:
        return PAUSED_ETA
    finished = finish_times(attempts)
    pace = throughput(finished, record.pauses, now)
    if not pace.settled:
        return estimating_eta(pace)
    return measured_eta(pace, max(0, attempts_total(record) - len(finished)), now)
