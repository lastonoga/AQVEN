from collections.abc import AsyncIterator, Sequence
from decimal import Decimal
from typing import Protocol

from aqven.runtime.address import RunId
from aqven.runtime.runs import Page
from aqven.series.model import (
    AnalysisInput,
    AttemptRecord,
    CaseSnapshot,
    SeriesAnalysis,
    SeriesChange,
    SeriesEstimate,
    SeriesId,
    SeriesRecord,
)
from aqven.series.views import (
    LaunchRequest,
    SeriesCancelRequest,
    SeriesCaseRow,
    SeriesCasesQuery,
    SeriesEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesListQuery,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.spec import ExperimentId, VariantId
from aqven.write.model import WriteActor


class SeriesStore(Protocol):
    async def create(self, series: SeriesRecord, cases: Sequence[CaseSnapshot]) -> bool: ...

    async def series(self, series_id: SeriesId) -> SeriesRecord | None: ...

    async def update(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord: ...

    async def search(self, query: SeriesListQuery, limit: int) -> tuple[SeriesRecord, ...]: ...

    async def case(self, series_id: SeriesId, case_index: int) -> CaseSnapshot: ...

    async def cases(self, series_id: SeriesId) -> tuple[CaseSnapshot, ...]: ...

    async def open_attempt(self, attempt: AttemptRecord) -> None: ...

    async def close_attempt(self, attempt: AttemptRecord) -> None: ...

    async def attempts(self, series_id: SeriesId) -> tuple[AttemptRecord, ...]: ...

    async def spend(self, series_id: SeriesId) -> Decimal: ...

    async def history(
        self, experiment_id: ExperimentId, variant_id: VariantId, limit: int
    ) -> tuple[AttemptRecord, ...]: ...


class SeriesAnalyst(Protocol):
    def analyze(self, source: AnalysisInput) -> SeriesAnalysis: ...


class FindingsSink(Protocol):
    async def publish(self, record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> str | None: ...


class OpenWaits(Protocol):
    async def open_runs(self) -> frozenset[RunId]: ...


class SeriesJobs(Protocol):
    async def estimate(self, experiment_id: ExperimentId, request: LaunchRequest) -> SeriesEstimate: ...

    async def start(self, request: SeriesStartRequest, actor: WriteActor) -> SeriesStarted: ...

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult: ...

    async def list(self, query: SeriesListQuery) -> Page[SeriesSummaryView]: ...

    async def cases(self, series_id: SeriesId, query: SeriesCasesQuery) -> tuple[SeriesCaseRow, ...]: ...

    async def approve(self, series_id: SeriesId, actor: WriteActor) -> SeriesSummaryView: ...

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView: ...

    def events(self, series_id: SeriesId, after_seq: int) -> AsyncIterator[SeriesEvent]: ...
