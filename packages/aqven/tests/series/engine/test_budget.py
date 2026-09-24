import asyncio
import time
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from series_feed import RecordingFeed
from series_fixture import write_project
from series_harness import SETTLE_SECONDS, ScriptedModels, SeriesHarness, reached, series_engine, settled

from aqven.series.events import SeriesEventLog
from aqven.series.model import (
    ApprovalReason,
    AttemptRecord,
    AttemptState,
    OutcomeClass,
    SeriesPause,
    SeriesRecord,
    SeriesStatus,
    StopCause,
)
from aqven.series.protocol import PROBE_WIDTH
from aqven.series.views import (
    SeriesCancelRequest,
    SeriesEvent,
    SeriesGetRequest,
    SeriesStartRequest,
    SeriesStatusEvent,
    SeriesSummaryView,
)
from aqven.series.workflow import SpendLedger
from aqven.server.errors import ApiFailure
from aqven.spec import ExperimentId, VerdictReason, VerdictState
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
TINY_CAP: Final = Decimal("0.000001")
RAISED_CAP: Final = Decimal("1.00")
QUIET_SECONDS: Final = 1.0
ATTEMPTS: Final = 24
POLL_SECONDS: Final = 0.1


def test_the_ledger_opens_below_nine_tenths_of_the_cap_counting_in_flight_reserves() -> None:
    ledger = SpendLedger(cap=Decimal("1.00"), reserve=Decimal("0.30"))

    assert ledger.open_for(2) is True
    assert ledger.limit_micros(2) == 400_000
    assert ledger.open_for(3) is False
    ledger.add(Decimal("0.50"))
    assert ledger.reserve == Decimal("0.50")
    assert ledger.open_for(0) is True
    assert ledger.open_for(1) is False
    ledger.add(Decimal("0.40"))
    assert ledger.open_for(0) is False
    ledger.cap = Decimal("2.00")
    assert ledger.open_for(1) is True


def test_an_untouched_ledger_stays_open() -> None:
    ledger = SpendLedger(cap=Decimal("1.00"), reserve=Decimal(0))

    assert ledger.open_for(7) is True


async def paused(harness: SeriesHarness) -> tuple[SeriesSummaryView, SeriesRecord, tuple[AttemptRecord, ...], int]:
    request = SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), cap_usd=TINY_CAP)
    started = await harness.service.start(request, AGENT)
    assert started.status is SeriesStatus.RUNNING
    shown = await reached(harness.service, started.series_id, SeriesStatus.AWAITING_APPROVAL)
    attempts = await harness.services.store.attempts(started.series_id)
    await asyncio.sleep(QUIET_SECONDS)
    later = len(await harness.services.store.attempts(started.series_id))
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return shown.series, record, attempts, later


def test_a_probe_that_reaches_the_cap_is_the_only_attempt_before_the_series_waits_for_approval(
    tmp_path: Path,
) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        shown, record, attempts, later = asyncio.run(paused(harness))
        spend = asyncio.run(harness.services.store.spend(record.series_id))

    assert shown.status is SeriesStatus.AWAITING_APPROVAL
    assert shown.pause == SeriesPause(reason=ApprovalReason.SPEND_NEAR_CAP, spent_usd=spend)
    assert spend >= TINY_CAP
    assert len(attempts) == later == PROBE_WIDTH
    assert all(attempt.state is AttemptState.FINISHED for attempt in attempts)
    assert {attempt.outcome for attempt in attempts} == {OutcomeClass.BUDGET_CUT}
    assert record.approved_by is None


async def continued(
    harness: SeriesHarness,
) -> tuple[SeriesRecord, tuple[AttemptRecord, ...], tuple[SeriesEvent, ...]]:
    request = SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), cap_usd=TINY_CAP)
    started = await harness.service.start(request, AGENT)
    await reached(harness.service, started.series_id, SeriesStatus.AWAITING_APPROVAL)
    await harness.service.approve(started.series_id, HUMAN, RAISED_CAP)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    events = await SeriesEventLog().snapshot(started.series_id)
    return record, await harness.services.store.attempts(started.series_id), events


def test_approving_a_paused_series_with_a_new_cap_runs_the_remaining_attempts(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    feed = RecordingFeed()

    with series_engine(root, ScriptedModels(), feed=feed) as harness:
        record, attempts, events = asyncio.run(continued(harness))

    assert record.status is SeriesStatus.DONE
    assert (record.cap_usd, record.approved_by, record.stop) == (RAISED_CAP, HUMAN.id, StopCause.COMPLETED)
    assert len(attempts) == ATTEMPTS
    assert [attempt.outcome for attempt in attempts].count(OutcomeClass.OK) == ATTEMPTS - PROBE_WIDTH
    assert record.verdict is not None
    assert (record.verdict.state, record.verdict.reason) == (VerdictState.SIGNAL, VerdictReason.DEV_SPLIT)
    statuses = [event.status for event in events if isinstance(event, SeriesStatusEvent)]
    assert statuses == [SeriesStatus.AWAITING_APPROVAL, SeriesStatus.RUNNING]
    assert feed.transitions() == (
        (SeriesStatus.RUNNING, SeriesStatus.AWAITING_APPROVAL),
        (SeriesStatus.AWAITING_APPROVAL, SeriesStatus.RUNNING),
        (SeriesStatus.RUNNING, SeriesStatus.DONE),
    )


async def paused_at(harness: SeriesHarness, series_id: str, cap: Decimal) -> SeriesSummaryView:
    deadline = time.monotonic() + SETTLE_SECONDS
    request = SeriesGetRequest.model_validate({"series_id": series_id})
    shown = (await harness.service.get(request)).series
    while shown.status is not SeriesStatus.AWAITING_APPROVAL or shown.spend.cap_usd != cap:
        assert time.monotonic() < deadline, f"series {series_id} is {shown.status} at {shown.spend.cap_usd}"
        await asyncio.sleep(POLL_SECONDS)
        shown = (await harness.service.get(request)).series
    return shown


async def doubled_then_cancelled(
    harness: SeriesHarness,
) -> tuple[SeriesSummaryView, SeriesSummaryView, ApiFailure, SeriesSummaryView, int]:
    request = SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), cap_usd=TINY_CAP)
    started = await harness.service.start(request, AGENT)
    first = await paused_at(harness, started.series_id, TINY_CAP)
    await harness.service.approve(started.series_id, HUMAN)
    again = await paused_at(harness, started.series_id, TINY_CAP * 2)
    with pytest.raises(ApiFailure) as refused:
        await harness.service.approve(started.series_id, HUMAN, TINY_CAP * 2)
    cancelled = await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    attempts = await harness.services.store.attempts(started.series_id)
    return first, again, refused.value, cancelled, len(attempts)


def test_a_paused_series_doubles_its_cap_by_default_pauses_again_and_can_be_stopped(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        first, again, refused, cancelled, attempts = asyncio.run(doubled_then_cancelled(harness))
        published = list(harness.findings.published)

    assert first.pause is not None and again.pause is not None
    assert first.pause.reason is again.pause.reason is ApprovalReason.SPEND_NEAR_CAP
    assert again.pause.spent_usd == first.pause.spent_usd
    assert refused.code == "REQUEST_INVALID"
    assert cancelled.status is SeriesStatus.CANCELLED
    assert cancelled.verdict is not None and cancelled.verdict.reason is VerdictReason.CANCELLED
    assert attempts == PROBE_WIDTH
    assert published == []
