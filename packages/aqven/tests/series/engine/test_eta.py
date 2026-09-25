import asyncio
from collections.abc import Sequence
from datetime import datetime, timedelta
from pathlib import Path
from typing import Final

import pytest
from series_records import NOW, attempt, cases, record

from aqven.series.eta import ETA_WINDOW_SECONDS, running_seconds, series_eta
from aqven.series.model import (
    AttemptId,
    AttemptRecord,
    AttemptState,
    PauseSpan,
    SeriesChange,
    SeriesRecord,
    SeriesStatus,
)
from aqven.series.store import SqliteSeriesStore
from aqven.series.views import SeriesEta

SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"
TOTAL: Final = 100
PROBE_END: Final = NOW + timedelta(seconds=40)


def running(pauses: Sequence[PauseSpan] = ()) -> SeriesRecord:
    base = record(SERIES, NOW)
    return base.model_copy(
        update={
            "status": SeriesStatus.RUNNING,
            "plan": base.plan.model_copy(update={"case_count": TOTAL}),
            "pauses": tuple(pauses),
        }
    )


def seconds_after(anchor: datetime, offsets: Sequence[float]) -> tuple[datetime, ...]:
    return tuple(anchor + timedelta(seconds=offset) for offset in offsets)


def finished(moments: Sequence[datetime]) -> tuple[AttemptRecord, ...]:
    template = attempt(SERIES, 0, AttemptState.FINISHED)
    return tuple(
        template.model_copy(
            update={"attempt_id": AttemptId(f"{SERIES}-{index}"), "ordinal": index, "finished_at": moment}
        )
        for index, moment in enumerate(moments)
    )


def with_probe(moments: Sequence[datetime]) -> tuple[AttemptRecord, ...]:
    return finished((PROBE_END, *moments))


def estimate(series: SeriesRecord, rows: Sequence[AttemptRecord], now: datetime, waits: int = 0) -> SeriesEta | None:
    return series_eta(series, rows, waits, now)


def measured(eta: SeriesEta | None) -> SeriesEta:
    assert eta is not None
    assert eta.state == "running"
    return eta


@pytest.mark.parametrize("status", [SeriesStatus.DONE, SeriesStatus.CANCELLED, SeriesStatus.FAILED])
def test_an_ended_series_has_no_estimate(status: SeriesStatus) -> None:
    ended = running().model_copy(update={"status": status})
    rows = with_probe(seconds_after(PROBE_END, range(10, 70, 10)))

    assert estimate(ended, rows, PROBE_END + timedelta(minutes=1)) is None


def test_a_series_awaiting_approval_is_paused_without_a_timer() -> None:
    waiting = running().model_copy(update={"status": SeriesStatus.AWAITING_APPROVAL})
    rows = with_probe(seconds_after(PROBE_END, range(10, 70, 10)))

    eta = estimate(waiting, rows, PROBE_END + timedelta(minutes=1))

    assert eta == SeriesEta(
        state="paused", attempts_per_minute=None, remaining_seconds=None, finish_at=None, window_seconds=0
    )


def test_a_series_waiting_for_a_human_is_paused() -> None:
    rows = with_probe(seconds_after(PROBE_END, range(10, 70, 10)))

    eta = estimate(running(), rows, PROBE_END + timedelta(minutes=1), waits=1)

    assert eta is not None and eta.state == "paused"


def test_before_the_probe_finishes_the_series_is_estimating() -> None:
    eta = estimate(running(), (), NOW + timedelta(minutes=2))

    assert eta == SeriesEta(
        state="estimating", attempts_per_minute=None, remaining_seconds=None, finish_at=None, window_seconds=0
    )


def test_fewer_than_three_attempts_after_the_probe_keep_estimating() -> None:
    rows = with_probe(seconds_after(PROBE_END, (20, 40)))

    eta = estimate(running(), rows, PROBE_END + timedelta(minutes=2))

    assert eta is not None
    assert (eta.state, eta.window_seconds, eta.remaining_seconds) == ("estimating", 120, None)


def test_less_than_thirty_seconds_after_the_probe_keeps_estimating() -> None:
    rows = with_probe(seconds_after(PROBE_END, (5, 10, 15, 20)))

    eta = estimate(running(), rows, PROBE_END + timedelta(seconds=25))

    assert eta is not None and eta.state == "estimating"


def test_the_rate_counts_attempts_finished_after_the_probe_over_the_running_time_since_it() -> None:
    now = PROBE_END + timedelta(seconds=60)
    rows = (*with_probe(seconds_after(PROBE_END, range(10, 70, 10))), attempt(SERIES, 1, AttemptState.RUNNING))

    eta = measured(estimate(running(), rows, now))

    assert eta.attempts_per_minute == 6.0
    assert eta.window_seconds == 60
    assert eta.remaining_seconds == (TOTAL - 7) * 10
    assert eta.finish_at == now + timedelta(seconds=(TOTAL - 7) * 10)


def test_the_window_holds_only_the_last_five_minutes_of_running_time() -> None:
    slow = seconds_after(PROBE_END, range(20, 300, 20))
    fast = seconds_after(PROBE_END, range(310, 610, 10))
    now = PROBE_END + timedelta(seconds=600)

    eta = measured(estimate(running(), with_probe((*slow, *fast)), now))

    assert eta.window_seconds == ETA_WINDOW_SECONDS
    assert eta.attempts_per_minute == 6.0
    assert eta.remaining_seconds == (TOTAL - 1 - len(slow) - len(fast)) * 10


def test_paused_time_is_not_running_time() -> None:
    before = seconds_after(PROBE_END, range(10, 70, 10))
    pause = PauseSpan(started_at=PROBE_END + timedelta(seconds=60), ended_at=PROBE_END + timedelta(seconds=660))
    after = seconds_after(PROBE_END, (670, 680))
    now = PROBE_END + timedelta(seconds=690)

    eta = measured(estimate(running((pause,)), with_probe((*before, *after)), now))

    assert eta.window_seconds == 90
    assert eta.attempts_per_minute == round(8 / 90 * 60, 2)
    assert eta.remaining_seconds == 1024


def test_the_approval_wait_before_the_first_attempt_does_not_shorten_the_window() -> None:
    wait = PauseSpan(started_at=NOW, ended_at=PROBE_END - timedelta(seconds=5))
    rows = with_probe(seconds_after(PROBE_END, range(10, 70, 10)))

    eta = measured(estimate(running((wait,)), rows, PROBE_END + timedelta(seconds=60)))

    assert (eta.window_seconds, eta.attempts_per_minute) == (60, 6.0)


def test_running_seconds_leave_out_closed_and_open_pauses() -> None:
    closed = PauseSpan(started_at=NOW + timedelta(seconds=10), ended_at=NOW + timedelta(seconds=30))
    still_open = PauseSpan(started_at=NOW + timedelta(seconds=80))
    earlier = PauseSpan(started_at=NOW - timedelta(seconds=50), ended_at=NOW - timedelta(seconds=40))

    assert running_seconds(NOW, NOW + timedelta(seconds=100), (closed, still_open, earlier)) == 60
    assert running_seconds(NOW + timedelta(seconds=90), NOW + timedelta(seconds=100), (still_open,)) == 0


def test_a_pause_span_ends_once() -> None:
    first_end = NOW + timedelta(seconds=5)
    span = PauseSpan(started_at=NOW)

    ended = span.ended(first_end)

    assert ended.ended_at == first_end
    assert ended.ended(first_end + timedelta(seconds=5)) == ended


def test_the_store_keeps_the_pauses_of_a_series(tmp_path: Path) -> None:
    store = SqliteSeriesStore.open(tmp_path / ".aqven" / "aqven.sqlite")
    series = record(SERIES, NOW).model_copy(update={"pauses": (PauseSpan(started_at=NOW),)})
    resumed = (PauseSpan(started_at=NOW, ended_at=NOW + timedelta(seconds=30)),)
    asyncio.run(store.create(series, cases()))

    updated = asyncio.run(store.update(series.series_id, SeriesChange(status=SeriesStatus.RUNNING, pauses=resumed)))

    assert updated.pauses == resumed
    assert asyncio.run(store.series(series.series_id)) == updated
