from collections.abc import Sequence
from datetime import datetime
from functools import reduce

from aqven.series.model import ExperimentOrigin, SeriesRecord, SeriesStatus
from aqven.series.ports import SeriesTally, SeriesTotals
from aqven.series.presenter import attempts_total
from aqven.series.read_views import SeriesRow, SeriesStats
from aqven.series.views import SeriesEta, SeriesProgress
from aqven.spec import ExperimentId

type Span = tuple[datetime, datetime]


def experiment_id_of(record: SeriesRecord) -> ExperimentId | None:
    origin = record.origin
    return origin.experiment_id if isinstance(origin, ExperimentOrigin) else None


def series_row(record: SeriesRecord, status: SeriesStatus, tally: SeriesTally, eta: SeriesEta | None) -> SeriesRow:
    return SeriesRow(
        series_id=record.series_id,
        experiment_id=experiment_id_of(record),
        flow_id=record.flow_id,
        status=status,
        verdict=None if record.verdict is None else record.verdict.state,
        on=record.on,
        progress=SeriesProgress(done=tally.done, total=attempts_total(record)),
        spend_usd=tally.spend,
        started_at=record.created_at,
        finished_at=record.finished_at,
        eta=eta,
    )


def merged(spans: list[Span], span: Span) -> list[Span]:
    if not spans or span[0] > spans[-1][1]:
        return [*spans, span]
    start, end = spans[-1]
    return [*spans[:-1], (start, max(end, span[1]))]


def covered_seconds(spans: Sequence[tuple[datetime, datetime | None]], now: datetime) -> int:
    closed = sorted((start, end or now) for start, end in spans)
    union = reduce(merged, closed, list[Span]())
    return round(sum((end - start).total_seconds() for start, end in union))


def series_stats(totals: SeriesTotals, now: datetime) -> SeriesStats:
    return SeriesStats(
        series=len(totals.spans),
        attempts=totals.attempts,
        requests=totals.attempts + totals.judge_runs,
        tokens=totals.tokens,
        spend_usd=totals.spend,
        wall_seconds=covered_seconds(totals.spans, now),
    )
