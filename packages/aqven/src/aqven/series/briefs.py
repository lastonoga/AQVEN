import math
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final

from aqven.runtime.address import RunId
from aqven.series.model import (
    AttemptOutcome,
    AttemptRecord,
    AttemptState,
    CheckState,
    MatrixRow,
    MetricCell,
    MetricRole,
    SeriesMatrix,
    SeriesRecord,
    SeriesStatus,
    VariantPlanRecord,
)
from aqven.series.presenter import attempt_outcome
from aqven.series.read_views import FailureGroup, MetricBrief, SeriesBriefView, VariantBrief
from aqven.series.views import SeriesCaseRow, SeriesDetailView, SeriesSummaryView
from aqven.server.errors import ApiFailure
from aqven.spec import SeriesMetric, SeriesSplit, VariantId

SHOWN_FAILURES: Final = 3
EXAMPLE_CHARS: Final = 100
ELLIPSIS: Final = "…"
SIGNIFICANT: Final = ".4g"
MEDIAN: Final = 0.5
TAIL: Final = 0.95
CHECK_PREFIX: Final = "check:"
STOPPED: Final = frozenset({SeriesStatus.CANCELLED, SeriesStatus.FAILED})
BRIEF_ROLES: Final = frozenset({MetricRole.PRIMARY})
FALLBACK_METRIC: Final = SeriesMetric.SUCCESS_RATE.value
SUMMARY_FIELDS: Final = frozenset(SeriesSummaryView.model_fields)
COUNTED_AS: Final[Mapping[AttemptOutcome, str]] = {
    AttemptOutcome.PASSED: "passed",
    AttemptOutcome.FAILED: "failed",
    AttemptOutcome.ERROR: "errors",
    AttemptOutcome.WAITING: "running",
    AttemptOutcome.RUNNING: "running",
}


def invalid(message: str) -> ApiFailure:
    return ApiFailure("REQUEST_INVALID", message)


def page_start(cursor: str | None) -> int:
    if cursor is None:
        return 0
    if not cursor.isdigit():
        raise invalid(f"cursor {cursor!r} is not a cursor this read returned")
    return int(cursor)


@dataclass(frozen=True, slots=True)
class CasePage:
    shown: tuple[SeriesCaseRow, ...] | None
    hidden: int
    next_cursor: str | None


def dev_order(rows: Sequence[SeriesCaseRow]) -> tuple[SeriesCaseRow, ...]:
    visible = [row for row in rows if row.split is SeriesSplit.DEV]
    return tuple(sorted(visible, key=lambda row: not row.failing))


def case_page(rows: Sequence[SeriesCaseRow], cursor: str | None, limit: int) -> CasePage:
    ordered = dev_order(rows)
    start = page_start(cursor)
    shown = ordered[start : start + limit]
    following = start + limit
    return CasePage(
        shown=shown,
        hidden=len(rows) - len(shown),
        next_cursor=str(following) if following < len(ordered) else None,
    )


def known_metrics(detail: SeriesDetailView) -> tuple[str, ...]:
    columns = (column.metric for column in detail.matrix.columns)
    measured = (name for row in detail.aggregates for name in (*row.metrics, *row.runtime_checks))
    return tuple(dict.fromkeys((*columns, *measured)))


def wanted_metrics(detail: SeriesDetailView, fields: Sequence[str] | None) -> frozenset[str] | None:
    if fields is None:
        return None
    known = known_metrics(detail)
    unknown = [name for name in fields if name not in known]
    if unknown and known:
        raise invalid(f"series {detail.series_id} has no metric {', '.join(unknown)}; it has {', '.join(known)}")
    return frozenset(fields)


def projected_matrix(matrix: SeriesMatrix, wanted: frozenset[str]) -> SeriesMatrix:
    return SeriesMatrix(
        columns=tuple(column for column in matrix.columns if column.metric in wanted),
        rows=tuple(
            row.model_copy(update={"cells": tuple(cell for cell in row.cells if cell.metric in wanted)})
            for row in matrix.rows
        ),
    )


def projected_detail(detail: SeriesDetailView, wanted: frozenset[str] | None) -> SeriesDetailView:
    if wanted is None:
        return detail
    aggregates = tuple(
        row.model_copy(
            update={
                "metrics": {name: value for name, value in row.metrics.items() if name in wanted},
                "runtime_checks": {name: value for name, value in row.runtime_checks.items() if name in wanted},
            }
        )
        for row in detail.aggregates
    )
    return detail.model_copy(
        update={
            "matrix": projected_matrix(detail.matrix, wanted),
            "aggregates": aggregates,
            "thresholds": tuple(cell for cell in detail.thresholds if cell.metric in wanted),
            "contrasts": tuple(contrast for contrast in detail.contrasts if contrast.metric in wanted),
        }
    )


def brief_metric_names(matrix: SeriesMatrix) -> frozenset[str]:
    primary = frozenset(column.metric for column in matrix.columns if column.role in BRIEF_ROLES)
    return primary or frozenset({FALLBACK_METRIC})


def rounded(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return value
    return float(format(value, SIGNIFICANT))


def metric_brief(cell: MetricCell) -> MetricBrief:
    return MetricBrief(
        metric=cell.metric,
        value=rounded(cell.value),
        low=rounded(cell.low),
        high=rounded(cell.high),
        verdict=cell.verdict,
    )


def clipped(text: str | None) -> str | None:
    if text is None or len(text) <= EXAMPLE_CHARS:
        return text
    return text[: EXAMPLE_CHARS - len(ELLIPSIS)] + ELLIPSIS


def nearest_rank(ordered: Sequence[int], share: float) -> int | None:
    if not ordered:
        return None
    return ordered[max(0, math.ceil(share * len(ordered)) - 1)]


@dataclass(frozen=True, slots=True)
class Failure:
    code: str
    message: str | None


def error_failure(row: AttemptRecord) -> Failure:
    code = row.error_code or (row.outcome.value if row.outcome is not None else AttemptOutcome.ERROR.value)
    return Failure(code=code, message=row.error_message)


def check_failure(row: AttemptRecord) -> Failure:
    if row.error_code is not None:
        return error_failure(row)
    failed = next((check for check in row.checks if check.state is CheckState.FAILED), None)
    if failed is None:
        return error_failure(row)
    return Failure(code=f"{CHECK_PREFIX}{failed.check_id}", message=failed.reason)


FAILURE_RULES: Final[Mapping[AttemptOutcome, Callable[[AttemptRecord], Failure]]] = {
    AttemptOutcome.ERROR: error_failure,
    AttemptOutcome.FAILED: check_failure,
}


def failure_of(row: AttemptRecord, outcome: AttemptOutcome) -> Failure | None:
    rule = FAILURE_RULES.get(outcome)
    return None if rule is None else rule(row)


def failure_groups(failures: Sequence[Failure]) -> tuple[tuple[FailureGroup, ...], int]:
    counted = Counter(failure.code for failure in failures)
    examples = {failure.code: failure.message for failure in reversed(failures)}
    ranked = counted.most_common()
    shown = tuple(
        FailureGroup(code=code, count=count, example=clipped(examples.get(code)))
        for code, count in ranked[:SHOWN_FAILURES]
    )
    return shown, sum(count for _, count in ranked[SHOWN_FAILURES:])


@dataclass(frozen=True, slots=True)
class JudgedAttempt:
    row: AttemptRecord
    outcome: AttemptOutcome


def outcome_counts(attempts: Sequence[JudgedAttempt]) -> Mapping[str, int]:
    counted = Counter(COUNTED_AS[attempt.outcome] for attempt in attempts)
    return {name: counted.get(name, 0) for name in ("passed", "failed", "errors", "running")}


def variant_brief(variant: VariantPlanRecord, attempts: Sequence[JudgedAttempt], row: MatrixRow | None) -> VariantBrief:
    finished = [attempt.row for attempt in attempts if attempt.row.state is AttemptState.FINISHED]
    latencies = sorted(item.latency_ms for item in finished if item.latency_ms is not None)
    failures = [failure for attempt in attempts if (failure := failure_of(attempt.row, attempt.outcome)) is not None]
    shown, others = failure_groups(failures)
    counts = outcome_counts(attempts)
    return VariantBrief(
        variant_id=variant.variant_id,
        role=variant.role,
        finished=len(finished),
        passed=counts["passed"],
        failed=counts["failed"],
        errors=counts["errors"],
        running=counts["running"],
        spend_usd=sum((item.cost_usd + item.check_cost_usd for item in finished), Decimal(0)),
        latency_p50_ms=nearest_rank(latencies, MEDIAN),
        latency_p95_ms=nearest_rank(latencies, TAIL),
        metrics=() if row is None else tuple(metric_brief(cell) for cell in row.cells),
        failures=shown,
        other_failures=others,
    )


@dataclass(frozen=True, slots=True)
class BriefSource:
    record: SeriesRecord
    attempts: tuple[AttemptRecord, ...]
    waiting: frozenset[RunId]
    detail: SeriesDetailView

    def judged(self) -> Mapping[VariantId, tuple[JudgedAttempt, ...]]:
        stopped = self.record.status in STOPPED
        grouped: dict[VariantId, list[JudgedAttempt]] = {}
        for row in self.attempts:
            judged = JudgedAttempt(row=row, outcome=attempt_outcome(row, self.waiting, stopped))
            grouped.setdefault(row.variant_id, []).append(judged)
        return {variant: tuple(rows) for variant, rows in grouped.items()}

    def brief(self, wanted: frozenset[str] | None) -> SeriesBriefView:
        matrix = projected_matrix(self.detail.matrix, wanted or brief_metric_names(self.detail.matrix))
        rows = {row.variant_id: row for row in matrix.rows}
        judged = self.judged()
        briefs = tuple(
            variant_brief(variant, judged.get(variant.variant_id, ()), rows.get(variant.variant_id))
            for variant in self.record.plan.variants
        )
        summary = self.detail.model_dump(include=set(SUMMARY_FIELDS))
        return SeriesBriefView(
            **summary,
            variant_briefs=briefs,
            error=self.detail.error,
            finding_path=self.detail.finding_path,
        )
