import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Final

from series_fixture import write_project
from series_harness import ScriptedModels, SeriesHarness, series_engine, settled

from aqven.series.model import AttemptRecord, OutcomeClass, SeriesRecord, SeriesStatus, StopCause
from aqven.series.views import SeriesStartRequest
from aqven.series.workflow import SpendLedger
from aqven.spec import ExperimentId, VerdictReason, VerdictState
from aqven.write.model import WriteActor

HUMAN: Final = WriteActor(kind="human", id="kir")
TINY_CAP: Final = Decimal("0.000001")


def test_the_ledger_opens_only_while_the_cap_covers_spend_and_reserves() -> None:
    ledger = SpendLedger(cap=Decimal("1.00"), reserve=Decimal("0.30"))

    assert ledger.open_for(3) is True
    assert ledger.limit_micros(3) == 100_000
    assert ledger.open_for(4) is False
    ledger.add(Decimal("0.95"))
    assert ledger.open_for(0) is True
    assert ledger.limit_micros(0) == 50_000
    ledger.add(Decimal("0.05"))
    assert ledger.open_for(0) is False
    assert ledger.stop_cause(10, 24) is StopCause.BUDGET_CUT
    assert ledger.stop_cause(24, 24) is StopCause.COMPLETED


def test_an_untouched_ledger_completes() -> None:
    ledger = SpendLedger(cap=Decimal("1.00"), reserve=Decimal(0))

    assert ledger.open_for(7) is True
    assert ledger.stop_cause(24, 24) is StopCause.COMPLETED


async def run_capped(harness: SeriesHarness) -> tuple[SeriesRecord, tuple[AttemptRecord, ...]]:
    request = SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), cap_usd=TINY_CAP)
    started = await harness.service.start(request, HUMAN)
    await harness.service.approve(started.series_id, HUMAN)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return record, await harness.services.store.attempts(started.series_id)


def test_a_cap_below_one_attempt_cuts_the_attempt_and_stops_the_series(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        record, attempts = asyncio.run(run_capped(harness))

    assert record.status is SeriesStatus.DONE
    assert record.cap_usd == TINY_CAP
    assert record.stop is StopCause.BUDGET_CUT
    assert 0 < len(attempts) < 24
    assert {attempt.outcome for attempt in attempts} == {OutcomeClass.BUDGET_CUT}
    assert all(attempt.cost_usd > 0 for attempt in attempts)
    assert record.verdict is not None
    assert (record.verdict.state, record.verdict.reason) == (VerdictState.INVALID, VerdictReason.BUDGET_CUT)
