from decimal import Decimal
from typing import Final

from pydantic import AwareDatetime, Field, JsonValue

from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from aqven.runtime.address import RequestModel, ResourceModel, RunId
from aqven.series.model import AttemptOutcome, SeriesId, SeriesStatus, VariantRole
from aqven.series.views import (
    SeriesCaseRow,
    SeriesDetailView,
    SeriesEta,
    SeriesGetResult,
    SeriesProgress,
    SeriesSummaryView,
)
from aqven.spec import CellVerdict, ExperimentId, FlowId, SeriesSplit, VariantId, VerdictState

MAX_OUTPUT_FIELDS: Final = 50
DEFAULT_OUTPUT_PAGE: Final = 50


class MetricBrief(ResourceModel):
    metric: str
    value: float | None
    low: float | None
    high: float | None
    verdict: CellVerdict


class FailureGroup(ResourceModel):
    code: str
    count: int = Field(ge=1)
    example: str | None


class VariantBrief(ResourceModel):
    variant_id: VariantId
    role: VariantRole
    finished: int = Field(ge=0)
    passed: int = Field(ge=0)
    failed: int = Field(ge=0)
    errors: int = Field(ge=0)
    running: int = Field(ge=0)
    spend_usd: Decimal
    latency_p50_ms: int | None
    latency_p95_ms: int | None
    metrics: tuple[MetricBrief, ...]
    failures: tuple[FailureGroup, ...]
    other_failures: int = Field(ge=0)


class SeriesBriefView(SeriesSummaryView):
    variant_briefs: tuple[VariantBrief, ...]
    error: str | None
    finding_path: str | None


class SeriesBriefResult(ResourceModel):
    series: SeriesBriefView
    cases: tuple[SeriesCaseRow, ...] | None
    hidden_cases: int
    next_cursor: str | None = None


class SeriesReading(ResourceModel):
    series: SeriesDetailView | SeriesBriefView
    cases: tuple[SeriesCaseRow, ...] | None
    hidden_cases: int
    next_cursor: str | None = None


def reading_of(result: SeriesGetResult | SeriesBriefResult) -> SeriesReading:
    return SeriesReading(
        series=result.series,
        cases=result.cases,
        hidden_cases=result.hidden_cases,
        next_cursor=result.next_cursor,
    )


class SeriesOutputsQuery(RequestModel):
    split: SeriesSplit | None = None
    variant: VariantId | None = None
    case: str | None = None
    outcome: AttemptOutcome | None = None
    fields: tuple[str, ...] | None = Field(default=None, min_length=1, max_length=MAX_OUTPUT_FIELDS)
    page_size: int = Field(default=DEFAULT_OUTPUT_PAGE, ge=1, le=MAX_PAGE_LIMIT)
    cursor: str | None = None


class SeriesOutputsRequest(SeriesOutputsQuery):
    series_id: SeriesId


class SeriesOutputRow(ResourceModel):
    case: str
    variant: VariantId
    repeat: int = Field(ge=1)
    split: SeriesSplit
    outcome: AttemptOutcome
    error_code: str | None
    cost_usd: Decimal
    latency_ms: int | None
    run_id: RunId
    output: JsonValue
    node_outputs: dict[str, JsonValue]
    checks: dict[str, float | None]


class SeriesOutputsPage(ResourceModel):
    series_id: SeriesId
    rows: tuple[SeriesOutputRow, ...]
    total: int = Field(ge=0)
    next_cursor: str | None


class SeriesRowsQuery(RequestModel):
    experiment_id: ExperimentId | None = None
    status: SeriesStatus | None = None
    cursor: str | None = None
    limit: int = Field(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT)


class SeriesRow(ResourceModel):
    series_id: SeriesId
    experiment_id: ExperimentId | None
    flow_id: FlowId | None
    status: SeriesStatus
    verdict: VerdictState | None
    on: SeriesSplit
    progress: SeriesProgress
    spend_usd: Decimal
    started_at: AwareDatetime
    finished_at: AwareDatetime | None
    eta: SeriesEta | None


class SeriesStats(ResourceModel):
    series: int = Field(ge=0)
    attempts: int = Field(ge=0)
    requests: int = Field(ge=0)
    tokens: int = Field(ge=0)
    spend_usd: Decimal
    wall_seconds: int = Field(ge=0)


class SeriesRowsPage(ResourceModel):
    items: tuple[SeriesRow, ...]
    next_cursor: str | None
    stats: SeriesStats
