import asyncio
from pathlib import Path

import pytest
from series_feed import RecordingFeed
from series_records import EXPERIMENT, NOW, cases, record

from aqven.series.feed import SeriesKey, SeriesStartedNotice
from aqven.series.model import SeriesChange, SeriesId, SeriesStatus
from aqven.series.observed import ObservedSeriesStore
from aqven.series.store import SqliteSeriesStore
from aqven.spec import FlowId


@pytest.fixture
def feed() -> RecordingFeed:
    return RecordingFeed()


@pytest.fixture
def store(tmp_path: Path, feed: RecordingFeed) -> ObservedSeriesStore:
    return ObservedSeriesStore(SqliteSeriesStore.open(tmp_path / ".aqven" / "aqven.sqlite"), feed)


def test_a_created_series_is_announced_once_with_its_status_and_size(
    store: ObservedSeriesStore, feed: RecordingFeed
) -> None:
    first = record("a", NOW)

    created = asyncio.run(store.create(first, cases()))
    again = asyncio.run(store.create(first, cases()))

    assert (created, again) == (True, False)
    assert feed.seen() == (
        SeriesStartedNotice(
            series=SeriesKey(series_id=SeriesId("a"), experiment_id=EXPERIMENT, flow_id=FlowId("triage")),
            status=SeriesStatus.AWAITING_APPROVAL,
            total=2,
        ),
    )


def test_only_writes_that_move_the_status_are_announced_with_the_status_they_left(
    store: ObservedSeriesStore, feed: RecordingFeed
) -> None:
    first = record("a", NOW)
    asyncio.run(store.create(first, cases()))

    asyncio.run(store.update(first.series_id, SeriesChange(status=SeriesStatus.RUNNING, approved_by="kir")))
    asyncio.run(store.update(first.series_id, SeriesChange(finding_path="experiments/x/findings/a.yaml")))
    asyncio.run(store.update(first.series_id, SeriesChange(status=SeriesStatus.RUNNING)))
    asyncio.run(store.settle(first.series_id, SeriesChange(status=SeriesStatus.DONE, finished_at=NOW)))
    asyncio.run(store.settle(first.series_id, SeriesChange(status=SeriesStatus.CANCELLED, finished_at=NOW)))

    assert feed.transitions() == (
        (SeriesStatus.AWAITING_APPROVAL, SeriesStatus.RUNNING),
        (SeriesStatus.RUNNING, SeriesStatus.DONE),
    )
    stored = asyncio.run(store.series(first.series_id))
    assert stored is not None and stored.status is SeriesStatus.DONE


def test_reads_pass_through_without_a_notice(store: ObservedSeriesStore, feed: RecordingFeed) -> None:
    first = record("a", NOW)
    asyncio.run(store.create(first, cases()))
    before = feed.seen()

    asyncio.run(store.series(first.series_id))
    asyncio.run(store.cases(first.series_id))
    asyncio.run(store.attempts(first.series_id))
    asyncio.run(store.spend(first.series_id))

    assert feed.seen() == before
