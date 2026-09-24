import asyncio
import time
from pathlib import Path
from typing import Final

import pytest
from series_fixture import ABOVE_PROJECT_CAP, write_project
from series_harness import ScriptedLabels, ScriptedModels, SeriesHarness, series_engine, wait_until

from aqven.series.model import AttemptState, SeriesId, SeriesRecord, SeriesStatus
from aqven.series.views import (
    SeriesCancelRequest,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesGetRequest,
    SeriesStartRequest,
    SeriesStatusEvent,
    SeriesSummaryView,
)
from aqven.server.errors import ApiFailure
from aqven.spec import ExperimentId, VerdictReason, VerdictState
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
SLOW_SECONDS: Final = 0.4
SETTLE_SECONDS: Final = 1.5
QUIET_SECONDS: Final = 2.0
WAIT_SECONDS: Final = 60.0
FOLLOW_SECONDS: Final = 30.0


def slow_models() -> ScriptedModels:
    return ScriptedModels(
        writer=ScriptedLabels("gpt-4o-mini", delay=SLOW_SECONDS),
        cheap=ScriptedLabels("gpt-4.1-mini", delay=SLOW_SECONDS),
    )


async def stored(harness: SeriesHarness, series_id: SeriesId) -> SeriesRecord:
    record = await harness.services.store.series(series_id)
    assert record is not None
    return record


def waiting_request() -> SeriesStartRequest:
    return SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), cap_usd=ABOVE_PROJECT_CAP)


async def cancel_waiting(harness: SeriesHarness) -> tuple[SeriesSummaryView, SeriesRecord, int, ApiFailure]:
    started = await harness.service.start(waiting_request(), AGENT)
    cancelled = await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    await asyncio.sleep(SETTLE_SECONDS)
    attempts = await harness.services.store.attempts(started.series_id)
    with pytest.raises(ApiFailure) as repeated:
        await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    return cancelled, await stored(harness, started.series_id), len(attempts), repeated.value


def test_cancelling_a_series_awaiting_approval_starts_nothing(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        cancelled, record, attempts, repeated = asyncio.run(cancel_waiting(harness))
        published = list(harness.findings.published)

    assert cancelled.status is SeriesStatus.CANCELLED
    assert record.status is SeriesStatus.CANCELLED
    assert record.finished_at is not None
    assert record.verdict is not None
    assert (record.verdict.state, record.verdict.reason) == (VerdictState.INVALID, VerdictReason.CANCELLED)
    assert record.verdict.text == "No finding: cancelled after 0 of 24 attempts."
    assert attempts == 0
    assert published == []
    assert repeated.code == "SERIES_STATE_CONFLICT"


async def follow_cancelled(harness: SeriesHarness) -> tuple[list[SeriesEvent], list[SeriesEvent], SeriesSummaryView]:
    started = await harness.service.start(waiting_request(), AGENT)
    live: list[SeriesEvent] = []

    async def follow() -> None:
        async for event in harness.service.events(started.series_id, 0):
            live.append(event)

    following = asyncio.create_task(follow())
    await wait_until(lambda: len(live) == 1, WAIT_SECONDS)
    cancelled = await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    await asyncio.wait_for(following, FOLLOW_SECONDS)
    replayed = [event async for event in harness.service.events(started.series_id, 0)]
    return live, replayed, cancelled


def test_cancelling_a_series_awaiting_approval_ends_its_events_with_the_finish(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        live, replayed, cancelled = asyncio.run(follow_cancelled(harness))

    assert cancelled.status is SeriesStatus.CANCELLED
    assert [event.seq for event in live] == [1, 2]
    waiting, finish = live
    assert isinstance(waiting, SeriesStatusEvent) and waiting.status is SeriesStatus.AWAITING_APPROVAL
    assert isinstance(finish, SeriesFinishedEvent)
    assert (finish.status, finish.verdict) == (SeriesStatus.CANCELLED, VerdictState.INVALID)
    assert replayed == live


async def finished_rows(harness: SeriesHarness, series_id: SeriesId) -> int:
    rows = await harness.services.store.attempts(series_id)
    return sum(1 for row in rows if row.state is AttemptState.FINISHED)


async def cancel_running(harness: SeriesHarness) -> tuple[SeriesRecord, int, int, SeriesStatus]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_agents")), AGENT)
    deadline = time.monotonic() + WAIT_SECONDS
    while await finished_rows(harness, started.series_id) < 1:
        assert time.monotonic() < deadline
        await asyncio.sleep(0.05)
    await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    await asyncio.sleep(SETTLE_SECONDS)
    rows_after_cancel = len(await harness.services.store.attempts(started.series_id))
    await asyncio.sleep(QUIET_SECONDS)
    rows_later = len(await harness.services.store.attempts(started.series_id))
    shown = await harness.service.get(SeriesGetRequest(series_id=started.series_id))
    return await stored(harness, started.series_id), rows_after_cancel, rows_later, shown.series.status


def test_cancelling_a_running_series_stops_new_attempts_and_writes_no_finding(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, slow_models()) as harness:
        record, rows_after_cancel, rows_later, shown = asyncio.run(cancel_running(harness))
        analysed = [source.status for source in harness.analyst.inputs]
        published = list(harness.findings.published)

    assert record.status is SeriesStatus.CANCELLED
    assert shown is SeriesStatus.CANCELLED
    assert rows_after_cancel == rows_later
    assert rows_later < 24
    assert SeriesStatus.DONE not in analysed
    assert published == []
