import asyncio
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from series_records import NOW, attempt, cases, record

from aqven.engine.checking.model import CheckState
from aqven.runtime.address import RunId
from aqven.series.model import AttemptState, CheckValue, SeriesChange, SeriesId, SeriesStatus
from aqven.series.overview import covered_seconds, series_stats
from aqven.series.ports import SeriesTally, SeriesTotals
from aqven.series.store import SqliteSeriesStore
from aqven.spec import ExperimentId, MetricKind

OTHER: Final = ExperimentId("triage_other")


@pytest.fixture
def store(tmp_path: Path) -> SqliteSeriesStore:
    return SqliteSeriesStore.open(tmp_path / ".aqven" / "aqven.sqlite")


def judged(series_id: str, ordinal: int) -> CheckValue:
    return CheckValue(
        check_id="grade",
        kind=MetricKind.BINARY,
        state=CheckState.PASSED,
        value=0.8,
        cost_usd=Decimal("0.0002"),
        judge_run_id=RunId(f"judge-{series_id}-{ordinal}"),
    )


async def filled(store: SqliteSeriesStore) -> tuple[dict[SeriesId, SeriesTally], SeriesTotals, SeriesTotals]:
    await store.create(record("first", NOW), cases())
    await store.create(record("second", NOW + timedelta(minutes=30), experiment=OTHER), cases())
    finished = attempt("first", 0, AttemptState.FINISHED, cost="0.01").model_copy(
        update={"tokens_in": 100, "tokens_out": 20, "checks": (judged("first", 0),)}
    )
    await store.close_attempt(finished)
    await store.open_attempt(attempt("first", 1, AttemptState.RUNNING))
    await store.close_attempt(
        attempt("second", 0, AttemptState.FINISHED, cost="0.02").model_copy(update={"tokens_in": 7, "tokens_out": 3})
    )
    await store.settle(
        SeriesId("first"), SeriesChange(status=SeriesStatus.DONE, finished_at=NOW + timedelta(minutes=10))
    )
    tallies = await store.tallies((SeriesId("first"), SeriesId("second"), SeriesId("missing")))
    return dict(tallies), await store.totals(None), await store.totals(OTHER)


def test_tallies_count_finished_attempts_and_their_spend_per_series(store: SqliteSeriesStore) -> None:
    tallies, _, _ = asyncio.run(filled(store))

    assert tallies == {
        SeriesId("first"): SeriesTally(done=1, spend=Decimal("0.011")),
        SeriesId("second"): SeriesTally(done=1, spend=Decimal("0.021")),
    }


def test_totals_cover_the_project_or_one_experiment(store: SqliteSeriesStore) -> None:
    _, project, other = asyncio.run(filled(store))

    assert (len(project.spans), project.attempts, project.judge_runs, project.tokens) == (2, 2, 1, 130)
    assert project.spend == Decimal("0.032")
    assert (len(other.spans), other.attempts, other.judge_runs, other.tokens) == (1, 1, 0, 10)
    assert other.spend == Decimal("0.021")


def test_stats_merge_overlapping_series_into_wall_time() -> None:
    spans = (
        (NOW, NOW + timedelta(minutes=10)),
        (NOW + timedelta(minutes=5), NOW + timedelta(minutes=15)),
        (NOW + timedelta(minutes=30), None),
    )
    totals = SeriesTotals(spans=spans, attempts=4, judge_runs=3, tokens=500, spend=Decimal("0.5"))

    stats = series_stats(totals, NOW + timedelta(minutes=40))

    assert covered_seconds((), NOW) == 0
    assert (stats.series, stats.attempts, stats.requests, stats.tokens) == (3, 4, 7, 500)
    assert stats.wall_seconds == (15 + 10) * 60
