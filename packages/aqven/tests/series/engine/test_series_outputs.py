import asyncio
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Final

import pytest
from series_fixture import write_project
from series_harness import ScriptedModels, SeriesHarness, series_engine, settled

from aqven.series.model import AttemptOutcome, SeriesId, SeriesStatus
from aqven.series.read_views import (
    SeriesBriefResult,
    SeriesOutputsPage,
    SeriesOutputsRequest,
    SeriesRowsPage,
    SeriesRowsQuery,
)
from aqven.series.views import SeriesGetRequest, SeriesGetResult, SeriesStartRequest
from aqven.server.errors import ApiFailure
from aqven.spec import ExperimentId, VariantId
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
SOLO: Final = ExperimentId("triage_solo")
CHEAP: Final = VariantId("cheap")
UNKNOWN: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2f")
ATTEMPTS: Final = 8


@dataclass(frozen=True, slots=True)
class Reads:
    series_id: SeriesId
    everything: SeriesOutputsPage
    first: SeriesOutputsPage
    second: SeriesOutputsPage
    projected: SeriesOutputsPage
    failing: SeriesOutputsPage
    brief: SeriesBriefResult
    paged: SeriesGetResult
    rows: SeriesRowsPage
    bad_cursor: str
    unknown_series: str


async def refused_code(pending: Awaitable[object]) -> str:
    try:
        await pending
    except ApiFailure as failure:
        return failure.code
    return "accepted"


async def read_back(harness: SeriesHarness) -> Reads:
    service = harness.service
    started = await service.start(SeriesStartRequest(experiment_id=SOLO), AGENT)
    await settled(service, started.series_id)
    series_id = started.series_id
    first = await service.outputs(SeriesOutputsRequest(series_id=series_id, page_size=3))
    fields = ("/label", "/missing", "answer", "answer/label")
    return Reads(
        series_id=series_id,
        everything=await service.outputs(SeriesOutputsRequest(series_id=series_id)),
        first=first,
        second=await service.outputs(SeriesOutputsRequest(series_id=series_id, page_size=3, cursor=first.next_cursor)),
        projected=await service.outputs(SeriesOutputsRequest(series_id=series_id, variant=CHEAP, fields=fields)),
        failing=await service.outputs(SeriesOutputsRequest(series_id=series_id, outcome=AttemptOutcome.FAILED)),
        brief=await service.brief(SeriesGetRequest(series_id=series_id, view="summary")),
        paged=await service.get(SeriesGetRequest(series_id=series_id, include_cases=True, case_limit=1)),
        rows=await service.rows(SeriesRowsQuery(experiment_id=SOLO)),
        bad_cursor=await refused_code(service.outputs(SeriesOutputsRequest(series_id=series_id, cursor="later"))),
        unknown_series=await refused_code(service.outputs(SeriesOutputsRequest(series_id=UNKNOWN))),
    )


@pytest.fixture(scope="module")
def reads(tmp_path_factory: pytest.TempPathFactory) -> Reads:
    root = write_project(tmp_path_factory.mktemp("outputs"))
    with series_engine(root, ScriptedModels()) as harness:
        return asyncio.run(read_back(harness))


def test_outputs_come_back_for_every_attempt_from_the_run_records(reads: Reads) -> None:
    rows = reads.everything.rows

    assert reads.everything.total == len(rows) == ATTEMPTS
    assert reads.everything.next_cursor is None
    assert {row.output == {"label": "ok"} for row in rows if row.outcome is AttemptOutcome.PASSED} == {True}
    assert all(row.node_outputs == {} for row in rows)
    assert all(set(row.checks) == {"matches"} for row in rows)
    assert {row.checks["matches"] for row in rows if row.outcome is AttemptOutcome.PASSED} == {1.0}
    assert all(row.latency_ms is not None and row.run_id for row in rows)


def test_output_pages_follow_the_cursor_in_attempt_order(reads: Reads) -> None:
    paged = [row.run_id for row in (*reads.first.rows, *reads.second.rows)]

    assert reads.first.next_cursor is not None
    assert paged == [row.run_id for row in reads.everything.rows[:6]]


def test_fields_project_the_output_and_name_node_outputs(reads: Reads) -> None:
    rows = reads.projected.rows

    assert reads.projected.total == ATTEMPTS // 2
    assert {row.variant for row in rows} == {CHEAP}
    assert all(isinstance(row.output, dict) and set(row.output) == {"/label", "/missing"} for row in rows)
    assert all(isinstance(row.output, dict) and row.output["/missing"] is None for row in rows)
    for row in rows:
        label = row.node_outputs["answer/label"]
        assert row.node_outputs["answer"] == {"label": label}
        assert isinstance(row.output, dict) and row.output["/label"] == label


def test_the_outcome_filter_keeps_the_failed_attempts(reads: Reads) -> None:
    assert reads.failing.rows
    assert {row.outcome for row in reads.failing.rows} == {AttemptOutcome.FAILED}
    assert "never_1" in {row.case for row in reads.failing.rows}


def test_the_summary_view_counts_each_variant(reads: Reads) -> None:
    briefs = reads.brief.series.variant_briefs

    assert [brief.variant_id for brief in briefs] == [VariantId("writer"), CHEAP]
    assert all(brief.finished == ATTEMPTS // 2 for brief in briefs)
    assert all(brief.passed + brief.failed + brief.errors == brief.finished for brief in briefs)
    assert {group.code for brief in briefs for group in brief.failures} == {"check:matches"}
    assert reads.brief.cases is None


def test_case_rows_page_past_the_first_page_with_a_cursor(reads: Reads) -> None:
    assert reads.paged.cases is not None and len(reads.paged.cases) == 1
    assert reads.paged.next_cursor == "1"
    assert reads.paged.hidden_cases >= 3


def test_the_series_list_is_compact_and_carries_project_totals(reads: Reads) -> None:
    [row] = reads.rows.items
    stats = reads.rows.stats

    assert row.series_id == reads.series_id
    assert (row.status, row.experiment_id, row.progress.done, row.progress.total) == (
        SeriesStatus.DONE,
        SOLO,
        ATTEMPTS,
        ATTEMPTS,
    )
    assert row.eta is None
    assert row.spend_usd == stats.spend_usd
    assert (stats.series, stats.attempts, stats.requests) == (1, ATTEMPTS, ATTEMPTS)
    assert stats.tokens >= 0
    assert stats.wall_seconds >= 0


def test_a_foreign_cursor_and_an_unknown_series_are_refused(reads: Reads) -> None:
    assert (reads.bad_cursor, reads.unknown_series) == ("REQUEST_INVALID", "NOT_FOUND")
