import asyncio
from dataclasses import dataclass, field
from typing import Final

import pytest
from series_records import NOW, attempt, record

from aqven.runtime.address import RunId
from aqven.series.model import AttemptRecord, AttemptState, SeriesId, SeriesStatus
from aqven.series.outputs import HOLDOUT_TOTALS_ONLY, SeriesOutputsReader, shown_splits
from aqven.series.ports import RunOutputRecord
from aqven.series.read_views import SeriesOutputsPage, SeriesOutputsRequest
from aqven.server.errors import ApiFailure
from aqven.spec import SeriesSplit

SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"
SPLITS: Final = (SeriesSplit.DEV, SeriesSplit.HOLDOUT)


@dataclass(slots=True)
class RecordedOutputs:
    read: list[RunId] = field(default_factory=list[RunId])

    async def outputs(self, run_id: RunId) -> RunOutputRecord:
        self.read.append(run_id)
        return RunOutputRecord(output={"label": run_id})


def attempts() -> tuple[AttemptRecord, ...]:
    return tuple(
        attempt(SERIES, ordinal, AttemptState.FINISHED).model_copy(update={"split": split})
        for ordinal, split in enumerate(SPLITS)
    )


def page(request: SeriesOutputsRequest, include_holdout: bool, runs: RecordedOutputs) -> SeriesOutputsPage:
    series = record(SERIES, NOW).model_copy(update={"status": SeriesStatus.DONE})
    reader = SeriesOutputsReader(runs)
    return asyncio.run(reader.page(series, attempts(), frozenset(), request, include_holdout=include_holdout))


def test_held_out_attempts_are_left_out_and_never_read_by_default() -> None:
    runs = RecordedOutputs()

    shown = page(SeriesOutputsRequest(series_id=SeriesId(SERIES)), False, runs)

    assert [row.split for row in shown.rows] == [SeriesSplit.DEV]
    assert shown.total == 1
    assert runs.read == [attempts()[0].run_id]


def test_the_holdout_split_is_refused_without_include_holdout() -> None:
    request = SeriesOutputsRequest(series_id=SeriesId(SERIES), split=SeriesSplit.HOLDOUT)

    with pytest.raises(ApiFailure) as refused:
        page(request, False, RecordedOutputs())

    assert (refused.value.code, refused.value.message) == ("REQUEST_INVALID", HOLDOUT_TOTALS_ONLY)


def test_include_holdout_returns_the_held_out_rows_with_their_split() -> None:
    every = page(SeriesOutputsRequest(series_id=SeriesId(SERIES)), True, RecordedOutputs())
    held_out = page(
        SeriesOutputsRequest(series_id=SeriesId(SERIES), split=SeriesSplit.HOLDOUT), True, RecordedOutputs()
    )

    assert [row.split for row in every.rows] == list(SPLITS)
    assert [row.split for row in held_out.rows] == [SeriesSplit.HOLDOUT]


@pytest.mark.parametrize(
    ("split", "include_holdout", "shown"),
    [
        (None, False, {SeriesSplit.DEV}),
        (SeriesSplit.DEV, False, {SeriesSplit.DEV}),
        (None, True, set(SPLITS)),
        (SeriesSplit.DEV, True, {SeriesSplit.DEV}),
        (SeriesSplit.HOLDOUT, True, {SeriesSplit.HOLDOUT}),
    ],
)
def test_shown_splits_follow_the_filter_and_the_owner_flag(
    split: SeriesSplit | None, include_holdout: bool, shown: set[SeriesSplit]
) -> None:
    request = SeriesOutputsRequest(series_id=SeriesId(SERIES), split=split)

    assert shown_splits(request, include_holdout) == shown
