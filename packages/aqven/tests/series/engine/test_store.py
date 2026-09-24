import asyncio
import sqlite3
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from series_records import EXPERIMENT, NOW, WRITER, attempt, cases, record

from aqven.series.model import AttemptState, SeriesChange, SeriesId, SeriesStatus
from aqven.series.store import InvalidCursor, SeriesMissing, SqliteSeriesStore, series_cursor
from aqven.series.views import SeriesListQuery


@pytest.fixture
def store(tmp_path: Path) -> SqliteSeriesStore:
    return SqliteSeriesStore.open(tmp_path / ".aqven" / "aqven.sqlite")


def test_opening_writes_the_schema_version_and_keeps_user_version(store: SqliteSeriesStore) -> None:
    with sqlite3.connect(store.path) as connection:
        version = connection.execute("SELECT version FROM aqven_schema_versions WHERE component = 'series'").fetchone()
        user_version = connection.execute("PRAGMA user_version").fetchone()

    assert version == (1,)
    assert user_version == (0,)


def test_create_stores_the_series_and_its_cases_once(store: SqliteSeriesStore) -> None:
    first = record("a", NOW)

    created = asyncio.run(store.create(first, cases()))
    again = asyncio.run(store.create(first.model_copy(update={"cap_usd": Decimal(5)}), cases()))

    assert (created, again) == (True, False)
    assert asyncio.run(store.series(first.series_id)) == first
    assert [item.name for item in asyncio.run(store.cases(first.series_id))] == ["always_1", "never_1"]
    assert asyncio.run(store.case(first.series_id, 1)).name == "never_1"


def test_update_merges_only_the_given_fields(store: SqliteSeriesStore) -> None:
    first = record("a", NOW)
    asyncio.run(store.create(first, cases()))

    updated = asyncio.run(
        store.update(first.series_id, SeriesChange(status=SeriesStatus.RUNNING, approved_by="kir", approved_at=NOW))
    )
    finished = asyncio.run(store.update(first.series_id, SeriesChange(status=SeriesStatus.DONE, finished_at=NOW)))

    assert (updated.status, updated.approved_by) == (SeriesStatus.RUNNING, "kir")
    assert (finished.status, finished.approved_by, finished.finished_at) == (SeriesStatus.DONE, "kir", NOW)
    assert asyncio.run(store.series(first.series_id)) == finished


def test_settling_an_ended_series_keeps_its_first_end(store: SqliteSeriesStore) -> None:
    first = record("a", NOW)
    asyncio.run(store.create(first, cases()))
    later = NOW + timedelta(milliseconds=2)

    settled = asyncio.run(store.settle(first.series_id, SeriesChange(status=SeriesStatus.CANCELLED, finished_at=NOW)))
    again = asyncio.run(store.settle(first.series_id, SeriesChange(status=SeriesStatus.FAILED, finished_at=later)))

    assert (settled.status, settled.finished_at) == (SeriesStatus.CANCELLED, NOW)
    assert again == settled
    assert asyncio.run(store.series(first.series_id)) == settled


def test_updating_a_missing_series_fails(store: SqliteSeriesStore) -> None:
    with pytest.raises(SeriesMissing):
        asyncio.run(store.update(SeriesId("missing"), SeriesChange(status=SeriesStatus.DONE)))


def test_an_opened_attempt_is_not_overwritten_but_a_closed_one_replaces_it(store: SqliteSeriesStore) -> None:
    asyncio.run(store.create(record("a", NOW), cases()))
    running = attempt("a", 0, AttemptState.RUNNING)

    asyncio.run(store.open_attempt(running))
    asyncio.run(store.open_attempt(running.model_copy(update={"repeat": 2})))
    first = asyncio.run(store.attempts(SeriesId("a")))
    asyncio.run(store.close_attempt(attempt("a", 0, AttemptState.FINISHED, "0.01")))
    closed = asyncio.run(store.attempts(SeriesId("a")))

    assert [row.repeat for row in first] == [1]
    assert [(row.state, row.cost_usd) for row in closed] == [(AttemptState.FINISHED, Decimal("0.01"))]


def test_spend_sums_finished_attempts_with_their_checks(store: SqliteSeriesStore) -> None:
    asyncio.run(store.create(record("a", NOW), cases()))
    asyncio.run(store.close_attempt(attempt("a", 0, AttemptState.FINISHED, "0.02")))
    asyncio.run(store.open_attempt(attempt("a", 1, AttemptState.RUNNING)))

    assert asyncio.run(store.spend(SeriesId("a"))) == Decimal("0.021")


def test_history_reads_finished_attempts_of_the_experiment_variant(store: SqliteSeriesStore) -> None:
    asyncio.run(store.create(record("a", NOW), cases()))
    asyncio.run(store.create(record("b", NOW, experiment="other_experiment"), cases()))
    asyncio.run(store.close_attempt(attempt("a", 0, AttemptState.FINISHED, "0.02")))
    asyncio.run(store.open_attempt(attempt("a", 1, AttemptState.RUNNING)))
    asyncio.run(store.close_attempt(attempt("b", 0, AttemptState.FINISHED, "0.05")))

    history = asyncio.run(store.history(EXPERIMENT, WRITER, 10))

    assert [row.attempt_id for row in history] == ["a-0"]


def test_search_filters_orders_newest_first_and_pages_by_cursor(store: SqliteSeriesStore) -> None:
    records = [record(name, NOW - timedelta(minutes=index)) for index, name in enumerate(("c", "b", "a"))]
    for item in records:
        asyncio.run(store.create(item, cases()))
    asyncio.run(store.update(SeriesId("b"), SeriesChange(status=SeriesStatus.RUNNING)))

    first = asyncio.run(store.search(SeriesListQuery(experiment_id=EXPERIMENT), 2))
    rest = asyncio.run(store.search(SeriesListQuery(cursor=series_cursor(first[-1])), 2))
    running = asyncio.run(store.search(SeriesListQuery(status=SeriesStatus.WAITING_HUMAN), 5))

    assert [item.series_id for item in first] == ["c", "b"]
    assert [item.series_id for item in rest] == ["a"]
    assert [item.series_id for item in running] == ["b"]


def test_a_bad_cursor_is_rejected(store: SqliteSeriesStore) -> None:
    with pytest.raises(InvalidCursor):
        asyncio.run(store.search(SeriesListQuery(cursor="nonsense"), 5))
