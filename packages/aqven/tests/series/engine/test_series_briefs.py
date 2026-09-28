from datetime import timedelta
from decimal import Decimal
from typing import Final

import pytest
from pydantic import JsonValue
from series_records import NOW, record

from aqven.engine.checking.model import CheckState
from aqven.runtime.address import RunId
from aqven.series.briefs import BriefSource, case_page, nearest_rank, projected_detail, wanted_metrics
from aqven.series.model import (
    AttemptId,
    AttemptOutcome,
    AttemptRecord,
    AttemptState,
    CheckValue,
    Estimate,
    MatrixRow,
    MetricCell,
    MetricColumn,
    MetricRole,
    MetricUnit,
    OutcomeClass,
    SeriesAnalysis,
    SeriesId,
    SeriesMatrix,
    SeriesRecord,
    SeriesStatus,
    StatMethod,
    VariantAggregates,
    VariantPlanRecord,
    VariantRole,
)
from aqven.series.outputs import output_fields, pointed
from aqven.series.presenter import SeriesProgressFacts, detail_view
from aqven.series.read_views import SeriesBriefResult
from aqven.series.views import SeriesCaseRow, SeriesDetailView, SeriesGetResult
from aqven.server.errors import ApiFailure
from aqven.spec import AgentId, CellVerdict, MetricDirection, MetricKind, SeriesSplit, VariantId

SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"
CHECK: Final = "matches"
METRICS: Final = (
    ("success_rate", MetricRole.BUILTIN, MetricUnit.RATE),
    ("cost_usd", MetricRole.BUILTIN, MetricUnit.USD),
    ("cost_of_pass", MetricRole.BUILTIN, MetricUnit.USD),
    ("latency_p50_ms", MetricRole.BUILTIN, MetricUnit.MS),
    ("latency_p95_ms", MetricRole.BUILTIN, MetricUnit.MS),
    ("schema_valid_first_try", MetricRole.BUILTIN, MetricUnit.RATE),
    ("infra_error_rate", MetricRole.BUILTIN, MetricUnit.RATE),
    (CHECK, MetricRole.PRIMARY, MetricUnit.RATE),
)
INFRA_CODES: Final = ("E_MAP_ITEM_FAILED", "provider_error", "timeout", "MODEL_STREAM_STALLED", "INTERNAL")
LONG_REASON: Final = "the label names a condition the case does not show; " * 8
LONG_ERROR: Final = "the provider answered 502 Bad Gateway after 180 s while streaming the structured reply; " * 6
SMALL_SERIES_BUDGET: Final = 8 * 1024
WIDE_SERIES_BUDGET: Final = 20 * 1024


def variant_ids(count: int) -> tuple[VariantId, ...]:
    return tuple(VariantId(f"model_{index:02d}") for index in range(count))


def plans(variants: tuple[VariantId, ...], base: SeriesRecord) -> tuple[VariantPlanRecord, ...]:
    template = base.plan.variants[0]
    return tuple(template.model_copy(update={"variant_id": variant}) for variant in variants)


def wide_record(variants: tuple[VariantId, ...], cases: int, repeats: int) -> SeriesRecord:
    base = record(SERIES, NOW)
    plan = base.plan.model_copy(update={"variants": plans(variants, base), "case_count": cases, "repeats": repeats})
    return base.model_copy(update={"plan": plan, "status": SeriesStatus.DONE, "finished_at": NOW})


def estimate(value: float) -> Estimate:
    return Estimate(
        value=value,
        low=value - 0.1234567,
        high=value + 0.1234567,
        method=StatMethod.WILSON,
        p_value=0.0312345,
        cases=20,
        attempts=100,
    )


def cell(metric: str, value: float) -> MetricCell:
    return MetricCell(
        metric=metric,
        value=value,
        low=value - 0.1234567,
        high=value + 0.1234567,
        verdict=CellVerdict.UNCLEAR,
        method=StatMethod.WILSON,
        cases=20,
    )


def analysis_of(variants: tuple[VariantId, ...]) -> SeriesAnalysis:
    columns = tuple(
        MetricColumn(
            metric=name, role=role, direction=MetricDirection.HIGHER_IS_BETTER, unit=unit, margin=0.05, relative=False
        )
        for name, role, unit in METRICS
    )
    rows = tuple(
        MatrixRow(
            variant_id=variant,
            role=VariantRole.OTHER,
            cells=tuple(cell(name, 0.4 + index / 100) for name, _, _ in METRICS),
        )
        for index, variant in enumerate(variants)
    )
    aggregates = tuple(
        VariantAggregates(
            variant_id=variant,
            role=VariantRole.OTHER,
            cases=20,
            attempts=100,
            counted=90,
            infra_errors=10,
            spend_usd=Decimal("0.123456"),
            pass_k=0.5,
            icc=0.3,
            stability=None,
            metrics={name: estimate(0.5) for name, _, _ in METRICS},
            runtime_checks={},
            models=("openrouter:some/provider-model-name",),
        )
        for variant in variants
    )
    matrix = SeriesMatrix(columns=columns, rows=rows)
    return SeriesAnalysis(
        variants=aggregates, matrix=matrix, thresholds=(), contrasts=(), verdict=None, infra_error_share=0.1
    )


def outcome_at(ordinal: int) -> tuple[OutcomeClass, bool | None, str | None]:
    slot = ordinal % 20
    if slot < 12:
        return OutcomeClass.OK, True, None
    if slot < 16:
        return OutcomeClass.OK, False, None
    return OutcomeClass.INFRA_ERROR, None, INFRA_CODES[ordinal % len(INFRA_CODES)]


def synthetic_attempt(ordinal: int, variant: VariantId) -> AttemptRecord:
    outcome, passed, code = outcome_at(ordinal)
    state = CheckState.PASSED if passed else CheckState.FAILED
    check = CheckValue(
        check_id=CHECK, kind=MetricKind.BINARY, state=state, value=1.0 if passed else 0.0, reason=LONG_REASON
    )
    return AttemptRecord(
        attempt_id=AttemptId(f"attempt-{ordinal}"),
        series_id=SeriesId(SERIES),
        ordinal=ordinal,
        variant_id=variant,
        case_name=f"case_{ordinal % 25:03d}",
        split=SeriesSplit.DEV,
        repeat=1 + ordinal // 1000,
        run_id=RunId(f"run-{ordinal}"),
        state=AttemptState.FINISHED,
        outcome=outcome,
        passed=passed,
        error_code=code,
        error_message=None if code is None else f"{code}: {LONG_ERROR}",
        checks=() if code is not None else (check,),
        cost_usd=Decimal("0.000123"),
        check_cost_usd=Decimal("0.0000456"),
        latency_ms=800 + (ordinal * 37) % 5000,
        started_at=NOW,
        finished_at=NOW + timedelta(seconds=ordinal),
    )


def attempts_of(variants: tuple[VariantId, ...], total: int) -> tuple[AttemptRecord, ...]:
    return tuple(synthetic_attempt(ordinal, variants[ordinal % len(variants)]) for ordinal in range(total))


def unknown_model(agent_id: AgentId) -> str:
    return "unknown"


def detail_of(series: SeriesRecord, attempts: tuple[AttemptRecord, ...]) -> SeriesDetailView:
    spend = sum((row.cost_usd + row.check_cost_usd for row in attempts), Decimal(0))
    facts = SeriesProgressFacts(done=len(attempts), spend=spend, waits=0)
    variants = tuple(variant.variant_id for variant in series.plan.variants)
    return detail_view(series, facts, analysis_of(variants), unknown_model)


def brief_size(variants: int, attempts: int) -> tuple[int, int]:
    ids = variant_ids(variants)
    series = wide_record(ids, cases=25, repeats=max(1, attempts // (25 * variants)))
    rows = attempts_of(ids, attempts)
    detail = detail_of(series, rows)
    brief = BriefSource(series, rows, frozenset(), detail).brief(None)
    summary = SeriesBriefResult(series=brief, cases=None, hidden_cases=0).model_dump_json()
    full = SeriesGetResult(series=detail, cases=None, hidden_cases=0).model_dump_json()
    return len(summary.encode()), len(full.encode())


def test_the_summary_of_a_thousand_attempts_is_a_few_kilobytes() -> None:
    summary, full = brief_size(variants=8, attempts=1000)

    assert summary < SMALL_SERIES_BUDGET
    assert full > 3 * summary


def test_the_summary_grows_with_variants_and_not_with_attempts() -> None:
    wide, _ = brief_size(variants=23, attempts=1380)
    longer, _ = brief_size(variants=23, attempts=5000)

    assert wide < WIDE_SERIES_BUDGET
    assert abs(longer - wide) < wide // 20


def test_a_variant_brief_counts_outcomes_groups_failures_and_keeps_the_primary_metric() -> None:
    ids = variant_ids(2)
    series = wide_record(ids, cases=25, repeats=2)
    rows = attempts_of(ids, 100)
    brief = BriefSource(series, rows, frozenset(), detail_of(series, rows)).brief(None)
    first = brief.variant_briefs[0]
    own = [row for row in rows if row.variant_id == ids[0]]

    assert first.finished == len(own) == 50
    assert (first.passed, first.failed, first.errors, first.running) == (30, 10, 10, 0)
    assert [item.metric for item in first.metrics] == [CHECK]
    assert first.metrics[0].low == pytest.approx(0.2765)
    assert first.failures[0].code == f"check:{CHECK}"
    assert first.failures[0].count == 10
    assert first.failures[0].example is not None and len(first.failures[0].example) <= 100
    assert sum(group.count for group in first.failures) + first.other_failures == first.failed + first.errors
    assert first.latency_p50_ms is not None and first.latency_p95_ms is not None
    assert first.latency_p50_ms <= first.latency_p95_ms
    assert brief.series_id == SERIES and brief.status is SeriesStatus.DONE


def test_fields_choose_the_metrics_of_the_summary_and_of_the_full_view() -> None:
    ids = variant_ids(3)
    series = wide_record(ids, cases=25, repeats=1)
    rows = attempts_of(ids, 60)
    detail = detail_of(series, rows)
    wanted = wanted_metrics(detail, ("success_rate", "cost_usd"))
    projected = projected_detail(detail, wanted)
    brief = BriefSource(series, rows, frozenset(), detail).brief(wanted)

    assert [column.metric for column in projected.matrix.columns] == ["success_rate", "cost_usd"]
    assert all(len(row.cells) == 2 for row in projected.matrix.rows)
    assert set(projected.aggregates[0].metrics) == {"success_rate", "cost_usd"}
    assert [item.metric for item in brief.variant_briefs[0].metrics] == ["success_rate", "cost_usd"]
    assert projected_detail(detail, None) is detail


def test_an_unknown_metric_is_a_request_error_that_lists_the_known_ones() -> None:
    ids = variant_ids(1)
    series = wide_record(ids, cases=25, repeats=1)
    rows = attempts_of(ids, 10)

    with pytest.raises(ApiFailure) as raised:
        wanted_metrics(detail_of(series, rows), ("accuracy",))

    assert raised.value.code == "REQUEST_INVALID"
    assert "accuracy" in raised.value.message
    assert CHECK in raised.value.message


def case_row(name: str, split: SeriesSplit, failing: bool) -> SeriesCaseRow:
    return SeriesCaseRow(
        name=name, split=split, tags={}, variants=(), usd=Decimal(0), failing=failing, divergent=False, attempts=()
    )


def test_case_pages_put_failing_dev_cases_first_and_continue_with_the_cursor() -> None:
    rows = (
        case_row("a", SeriesSplit.DEV, False),
        case_row("b", SeriesSplit.DEV, True),
        case_row("c", SeriesSplit.HOLDOUT, True),
        case_row("d", SeriesSplit.DEV, False),
    )

    first = case_page(rows, None, 2)
    second = case_page(rows, first.next_cursor, 2)

    assert [row.name for row in first.shown or ()] == ["b", "a"]
    assert (first.hidden, first.next_cursor) == (2, "2")
    assert [row.name for row in second.shown or ()] == ["d"]
    assert second.next_cursor is None
    with pytest.raises(ApiFailure) as raised:
        case_page(rows, "later", 2)
    assert raised.value.code == "REQUEST_INVALID"


@pytest.mark.parametrize(
    ("share", "expected"),
    [(0.5, 50), (0.95, 95), (1.0, 100), (0.01, 1)],
)
def test_nearest_rank_percentiles(share: float, expected: int) -> None:
    assert nearest_rank(list(range(1, 101)), share) == expected
    assert nearest_rank([], share) is None


OUTPUT: Final[JsonValue] = {"label": "acne", "candidates": [{"name": "acne"}, {"name": "rosacea"}], "a/b": {"~x": 1}}


@pytest.mark.parametrize(
    ("pointer", "expected"),
    [
        ("", OUTPUT),
        ("/label", "acne"),
        ("/candidates/1/name", "rosacea"),
        ("/candidates/7/name", None),
        ("/missing", None),
        ("/a~1b/~0x", 1),
        ("/label/deeper", None),
    ],
)
def test_json_pointers_reach_into_the_output(pointer: str, expected: JsonValue) -> None:
    assert pointed(OUTPUT, pointer) == expected


def test_fields_split_into_output_pointers_and_node_outputs() -> None:
    fields = output_fields(("/label", "triage", "triage/summary"))
    nodes: dict[str, JsonValue] = {"triage": {"summary": "red patches"}}

    assert fields.output(OUTPUT) == {"/label": "acne"}
    assert fields.node_outputs(nodes) == {"triage": {"summary": "red patches"}, "triage/summary": "red patches"}
    assert output_fields(("triage",)).output(OUTPUT) is None
    assert output_fields(None).output(OUTPUT) == OUTPUT
    with pytest.raises(ApiFailure):
        output_fields(("/",))


def test_a_stopped_series_reports_unfinished_attempts_as_errors() -> None:
    ids = variant_ids(1)
    series = wide_record(ids, cases=25, repeats=1).model_copy(update={"status": SeriesStatus.CANCELLED})
    running = synthetic_attempt(0, ids[0]).model_copy(
        update={"state": AttemptState.RUNNING, "outcome": None, "finished_at": None}
    )
    brief = BriefSource(series, (running,), frozenset(), detail_of(series, ())).brief(None)

    assert (brief.variant_briefs[0].errors, brief.variant_briefs[0].finished) == (1, 0)
    assert brief.variant_briefs[0].failures[0].code == AttemptOutcome.ERROR.value
