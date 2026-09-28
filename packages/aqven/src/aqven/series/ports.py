from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Protocol

from pydantic import JsonValue

from aqven.runtime.address import RunId
from aqven.runtime.runs import Page
from aqven.series.model import (
    AnalysisInput,
    AttemptRecord,
    CaseSnapshot,
    LaunchPlan,
    SeriesAnalysis,
    SeriesChange,
    SeriesId,
    SeriesRecord,
)
from aqven.series.read_views import (
    SeriesBriefResult,
    SeriesOutputsPage,
    SeriesOutputsRequest,
    SeriesRowsPage,
    SeriesRowsQuery,
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

    async def settle(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord: ...

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


@dataclass(frozen=True, slots=True)
class RunOutputRecord:
    output: JsonValue = None
    nodes: Mapping[str, JsonValue] = field(default_factory=dict[str, JsonValue])


class RunOutputs(Protocol):
    async def outputs(self, run_id: RunId) -> RunOutputRecord: ...


@dataclass(frozen=True, slots=True)
class SeriesTally:
    done: int = 0
    spend: Decimal = Decimal(0)


@dataclass(frozen=True, slots=True)
class SeriesTotals:
    spans: tuple[tuple[datetime, datetime | None], ...]
    attempts: int
    judge_runs: int
    tokens: int
    spend: Decimal


class SeriesLedger(Protocol):
    async def tallies(self, series_ids: Sequence[SeriesId]) -> Mapping[SeriesId, SeriesTally]: ...

    async def totals(self, experiment_id: ExperimentId | None) -> SeriesTotals: ...


class SeriesAnalyst(Protocol):
    def analyze(self, source: AnalysisInput) -> SeriesAnalysis: ...


class FindingsSink(Protocol):
    async def publish(self, record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> str | None: ...


class OpenWaits(Protocol):
    async def open_runs(self) -> frozenset[RunId]: ...


class SeriesJobs(Protocol):
    async def launch_plan(self, experiment_id: ExperimentId, request: LaunchRequest) -> LaunchPlan: ...

    async def start(self, request: SeriesStartRequest, actor: WriteActor) -> SeriesStarted: ...

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult: ...

    async def brief(self, request: SeriesGetRequest) -> SeriesBriefResult: ...

    async def outputs(self, request: SeriesOutputsRequest) -> SeriesOutputsPage: ...

    async def list(self, query: SeriesListQuery) -> Page[SeriesSummaryView]: ...

    async def rows(self, query: SeriesRowsQuery) -> SeriesRowsPage: ...

    async def cases(self, series_id: SeriesId, query: SeriesCasesQuery) -> tuple[SeriesCaseRow, ...]: ...

    async def approve(
        self, series_id: SeriesId, actor: WriteActor, cap_usd: Decimal | None = None
    ) -> SeriesSummaryView: ...

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView: ...

    def events(self, series_id: SeriesId, after_seq: int) -> AsyncIterator[SeriesEvent]: ...
