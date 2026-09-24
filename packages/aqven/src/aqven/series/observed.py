from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from decimal import Decimal

from aqven.series.feed import ResearchFeed, SeriesStartedNotice, SeriesStatusNotice, series_key
from aqven.series.model import AttemptRecord, CaseSnapshot, SeriesChange, SeriesId, SeriesRecord
from aqven.series.ports import SeriesStore
from aqven.series.presenter import attempts_total
from aqven.series.views import SeriesListQuery
from aqven.spec import ExperimentId, VariantId

type RecordWrite = Callable[[SeriesId, SeriesChange], Awaitable[SeriesRecord]]


def status_notice(before: SeriesRecord | None, after: SeriesRecord) -> SeriesStatusNotice | None:
    previous = None if before is None else before.status
    if previous is after.status:
        return None
    return SeriesStatusNotice(series=series_key(after), status=after.status, previous=previous)


@dataclass(frozen=True, slots=True)
class ObservedSeriesStore:
    inner: SeriesStore
    feed: ResearchFeed

    async def create(self, series: SeriesRecord, cases: Sequence[CaseSnapshot]) -> bool:
        created = await self.inner.create(series, cases)
        if created:
            notice = SeriesStartedNotice(series=series_key(series), status=series.status, total=attempts_total(series))
            self.feed.publish(notice)
        return created

    async def series(self, series_id: SeriesId) -> SeriesRecord | None:
        return await self.inner.series(series_id)

    async def update(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord:
        return await self._observed(series_id, change, self.inner.update)

    async def settle(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord:
        return await self._observed(series_id, change, self.inner.settle)

    async def search(self, query: SeriesListQuery, limit: int) -> tuple[SeriesRecord, ...]:
        return await self.inner.search(query, limit)

    async def case(self, series_id: SeriesId, case_index: int) -> CaseSnapshot:
        return await self.inner.case(series_id, case_index)

    async def cases(self, series_id: SeriesId) -> tuple[CaseSnapshot, ...]:
        return await self.inner.cases(series_id)

    async def open_attempt(self, attempt: AttemptRecord) -> None:
        await self.inner.open_attempt(attempt)

    async def close_attempt(self, attempt: AttemptRecord) -> None:
        await self.inner.close_attempt(attempt)

    async def attempts(self, series_id: SeriesId) -> tuple[AttemptRecord, ...]:
        return await self.inner.attempts(series_id)

    async def spend(self, series_id: SeriesId) -> Decimal:
        return await self.inner.spend(series_id)

    async def history(
        self, experiment_id: ExperimentId, variant_id: VariantId, limit: int
    ) -> tuple[AttemptRecord, ...]:
        return await self.inner.history(experiment_id, variant_id, limit)

    async def _observed(self, series_id: SeriesId, change: SeriesChange, write: RecordWrite) -> SeriesRecord:
        if change.status is None:
            return await write(series_id, change)
        before = await self.inner.series(series_id)
        after = await write(series_id, change)
        notice = status_notice(before, after)
        if notice is not None:
            self.feed.publish(notice)
        return after
