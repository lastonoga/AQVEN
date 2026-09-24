import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest
from dbos import DBOS

from aqven.runtime.address import RunId
from aqven.series import workflow
from aqven.series.facts import AttemptInspection
from aqven.series.model import AttemptId, OutcomeClass, SeriesId
from aqven.series.protocol import LOOKAHEAD, PROBE_WIDTH
from aqven.series.tickets import AttemptSummary
from aqven.series.workflow import (
    AttemptQueue,
    AttemptTry,
    AttemptWindow,
    PendingAttempt,
    SeriesRun,
    SpendLedger,
    requeues,
)
from aqven.spec import VariantId

SERIES: Final = SeriesId("01a0d355-aaaa-7bbb-8ccc-00005e71e5a1")
NOW: Final = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)
CAP: Final = Decimal("1.00")
CHEAP: Final = Decimal("0.05")
EXPENSIVE: Final = Decimal("0.30")


@dataclass(frozen=True, slots=True)
class FakeHandle:
    workflow_id: str

    def get_workflow_id(self) -> str:
        return self.workflow_id


@dataclass(slots=True)
class ScriptedAttempts:
    cost: Decimal = CHEAP
    requeued: frozenset[tuple[int, int]] = frozenset()
    enqueued: list[tuple[AttemptTry, int]] = field(default_factory=list[tuple[AttemptTry, int]])

    async def enqueue(self, series_id: SeriesId, run: SeriesRun, entry: AttemptTry, limit: int) -> FakeHandle:
        self.enqueued.append((entry, limit))
        return FakeHandle(f"{entry.ordinal}|{entry.tries}")

    async def first_finished(self, handles: Sequence[FakeHandle], polling_interval_sec: float) -> FakeHandle:
        return handles[0]

    async def summary(self, series_id: SeriesId, pending: PendingAttempt) -> AttemptSummary:
        entry = pending.entry
        return AttemptSummary(
            attempt_id=AttemptId(f"attempt-{entry.ordinal}"),
            ordinal=entry.ordinal,
            variant_id=VariantId("writer"),
            case_name="always_1",
            repeat=1,
            run_id=RunId(f"run-{entry.ordinal}-{entry.tries}"),
            outcome=OutcomeClass.OK,
            passed=True,
            cost_usd=self.cost,
            spend_usd=self.cost,
            finished_at=NOW,
            requeued=(entry.ordinal, entry.tries) in self.requeued,
        )

    def tries(self, start: int = 0) -> list[tuple[int, int]]:
        return [(entry.ordinal, entry.tries) for entry, _ in self.enqueued[start:]]


@pytest.fixture
def attempts(monkeypatch: pytest.MonkeyPatch) -> ScriptedAttempts:
    scripted = ScriptedAttempts()
    monkeypatch.setattr(workflow, "enqueue_attempt", scripted.enqueue)
    monkeypatch.setattr(workflow, "attempt_summary", scripted.summary)
    monkeypatch.setattr(DBOS, "wait_first_async", scripted.first_finished)
    return scripted


def series_run(total: int) -> SeriesRun:
    return SeriesRun(
        needs_approval=False,
        total=total,
        cap_usd=CAP,
        repeats=1,
        variant_ids=(VariantId("writer"),),
        case_names=tuple(f"case_{index}" for index in range(total)),
        created_at=NOW,
    )


def window_of(total: int) -> AttemptWindow:
    return AttemptWindow(SERIES, series_run(total), SpendLedger(cap=CAP), AttemptQueue(total=total))


async def driven(window: AttemptWindow) -> list[AttemptSummary]:
    counted: list[AttemptSummary] = []
    while window.active:
        await window.fill()
        summary = await window.next_finished()
        counted.extend(() if summary is None else (summary,))
    return counted


async def probe_then_fill(window: AttemptWindow) -> AttemptSummary | None:
    await window.fill()
    finished = await window.next_finished()
    await window.fill()
    return finished


def test_the_first_attempt_runs_alone_then_the_window_opens_to_its_full_width(attempts: ScriptedAttempts) -> None:
    window = window_of(24)

    asyncio.run(window.fill())
    alone = attempts.tries()
    probe = asyncio.run(window.next_finished())
    asyncio.run(window.fill())

    assert alone == [(0, 1)]
    assert attempts.enqueued[0][1] == 1_000_000
    assert probe is not None and probe.ordinal == 0
    assert window.ledger.reserve == CHEAP
    assert attempts.tries(1) == [(ordinal, 1) for ordinal in range(1, LOOKAHEAD + 1)]


def test_an_expensive_probe_keeps_the_window_inside_the_cap(attempts: ScriptedAttempts) -> None:
    attempts.cost = EXPENSIVE
    window = window_of(24)

    asyncio.run(probe_then_fill(window))

    assert window.ledger.reserve == EXPENSIVE
    assert attempts.tries(1) == [(1, 1), (2, 1)]
    assert window.ledger.committed(len(window.pending)) < CAP


def test_a_rate_limited_attempt_goes_to_the_end_of_the_queue_once(attempts: ScriptedAttempts) -> None:
    attempts.requeued = frozenset({(1, 1)})
    window = window_of(4)

    counted = asyncio.run(driven(window))

    assert attempts.tries() == [(0, 1), (1, 1), (2, 1), (3, 1), (1, 2)]
    assert sorted(summary.ordinal for summary in counted) == [0, 1, 2, 3]
    assert window.done == 4
    assert window.ledger.spent == CHEAP * 5


def test_only_the_first_try_of_a_rate_limited_attempt_is_requeued() -> None:
    limited = AttemptInspection(outcome=OutcomeClass.INFRA_ERROR, rate_limited=True)
    broken = AttemptInspection(outcome=OutcomeClass.INFRA_ERROR)

    assert (requeues(limited, 1), requeues(limited, 2), requeues(broken, 1)) == (True, False, False)


def test_a_second_rate_limit_counts_as_the_attempt_result() -> None:
    queue = AttemptQueue(total=1)
    first = queue.take()
    summary = AttemptSummary(
        attempt_id=AttemptId("attempt-0"),
        ordinal=0,
        variant_id=VariantId("writer"),
        case_name="always_1",
        repeat=1,
        run_id=RunId("run-0-2"),
        outcome=OutcomeClass.INFRA_ERROR,
        passed=None,
        cost_usd=Decimal(0),
        spend_usd=Decimal(0),
        finished_at=NOW,
    )

    requeued = queue.settle(first, summary.model_copy(update={"requeued": True}))
    second = queue.take()
    counted = queue.settle(second, summary)

    assert (requeued, counted) == (False, True)
    assert (second, queue.done, queue.waiting) == (AttemptTry(ordinal=0, tries=2), 1, False)


def test_a_requeued_probe_keeps_the_next_attempt_running_alone(attempts: ScriptedAttempts) -> None:
    attempts.requeued = frozenset({(0, 1)})
    window = window_of(24)

    first = asyncio.run(probe_then_fill(window))

    assert first is None
    assert window.queue.width() == PROBE_WIDTH
    assert attempts.tries() == [(0, 1), (1, 1)]
