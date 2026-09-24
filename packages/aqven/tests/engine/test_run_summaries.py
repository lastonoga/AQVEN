import asyncio
import sqlite3
from collections.abc import Iterable
from contextlib import closing
from dataclasses import replace
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from summary_fixtures import (
    EDITOR,
    FLOW,
    LEAD,
    NOW,
    OTHER_FLOW,
    CountingStore,
    FakeCatalog,
    FakeEvents,
    FakeWaits,
    FixtureRun,
    FoldedRows,
    completed_run,
    fixture_runs,
    fixture_waits,
    run_id,
    running_run,
    script,
    stamp,
)

from aqven.engine.listing import RunListing
from aqven.engine.summaries import (
    RunSummaries,
    SqliteRunSummaryStore,
    SummaryChanges,
    SummaryListing,
    SummarySelection,
    folded_run,
    sink_position,
)
from aqven.engine.summaries.store import RECORD_VERSION, SCHEMA_COMPONENT, SCHEMA_VERSION, SUMMARY_DATABASE
from aqven.ports.engine import RunListQuery
from aqven.runtime.address import RunId
from aqven.runtime.events import NodeAttemptDiscarded, NodeOutputDelta, RunFinished
from aqven.runtime.runs import Page, RunSummary
from aqven.spec import FlowId

PAGE: Final = 3
SMALL_PROJECT: Final = 100
LARGE_PROJECT: Final = 1000
ACTIVE_RUNS: Final = 3
STUDIO_PAGE: Final = 50

PARITY_QUERIES: Final = (
    RunListQuery(),
    RunListQuery(limit=PAGE),
    RunListQuery(limit=PAGE, cursor="3"),
    RunListQuery(limit=PAGE, cursor="9"),
    RunListQuery(limit=PAGE, cursor="99"),
    RunListQuery(limit=PAGE, cursor="not-a-number"),
    RunListQuery(flow_id=FLOW),
    RunListQuery(flow_id=OTHER_FLOW, limit=1),
    RunListQuery(status="queued"),
    RunListQuery(status="running"),
    RunListQuery(status="suspended"),
    RunListQuery(status="completed"),
    RunListQuery(status="failed"),
    RunListQuery(status="cancelled"),
    RunListQuery(mode="experiment"),
    RunListQuery(mode="replay"),
    RunListQuery(mode="live", flow_id=FLOW),
    RunListQuery(parent_run_id=run_id(3)),
    RunListQuery(parent_run_id=run_id(1)),
    RunListQuery(since=NOW + timedelta(minutes=4), until=NOW + timedelta(minutes=10)),
    RunListQuery(since=NOW + timedelta(minutes=5, microseconds=1)),
    RunListQuery(sort="deadline_at"),
    RunListQuery(sort="deadline_at", limit=2, cursor="2"),
    RunListQuery(status="suspended", sort="deadline_at"),
    RunListQuery(assignee=LEAD),
    RunListQuery(assignee=EDITOR, sort="deadline_at"),
    RunListQuery(assignee="nobody"),
    RunListQuery(overdue=True),
    RunListQuery(overdue=False, sort="deadline_at"),
    RunListQuery(deadline_before=NOW + timedelta(hours=3)),
    RunListQuery(status="running", assignee=LEAD),
    RunListQuery(flow_id=FLOW, status="completed", limit=1),
)


def fixture_catalog() -> dict[RunId, FixtureRun]:
    return {run.run_id: run for run in fixture_runs()}


def summaries_over(tmp_path: Path, runs: dict[RunId, FixtureRun]) -> tuple[RunSummaries, FakeEvents, FakeCatalog]:
    events = FakeEvents(runs)
    catalog = FakeCatalog(runs)
    store = SqliteRunSummaryStore.open(tmp_path / SUMMARY_DATABASE)
    return RunSummaries(store=store, catalog=catalog, events=events), events, catalog


async def project_live(summaries: RunSummaries, runs: Iterable[FixtureRun]) -> None:
    for run in runs:
        if not run.events:
            await summaries.track(run.run_id)
        projection = summaries.projection(run.run_id)
        written = [event for event in run.events if not isinstance(event, NodeOutputDelta | NodeAttemptDiscarded)]
        for position, event in enumerate(written, start=1):
            await projection.written(position, (event,))


def old_page(runs: dict[RunId, FixtureRun], waits: FakeWaits, query: RunListQuery) -> Page[RunSummary]:
    return asyncio.run(RunListing(FoldedRows(runs, waits), clock=lambda: NOW).page(query))


def new_page(summaries: RunSummaries, waits: FakeWaits, query: RunListQuery) -> Page[RunSummary]:
    return asyncio.run(SummaryListing(rows=summaries, waits=waits, clock=lambda: NOW).page(query))


@pytest.mark.parametrize("live", [True, False], ids=["projected", "backfilled"])
def test_the_summary_listing_matches_the_folding_listing(tmp_path: Path, live: bool) -> None:
    runs = fixture_catalog()
    waits = fixture_waits()
    summaries, _, _ = summaries_over(tmp_path, runs)
    if live:
        asyncio.run(project_live(summaries, runs.values()))

    for query in PARITY_QUERIES:
        expected = old_page(runs, waits, query).model_dump(mode="json")
        assert new_page(summaries, waits, query).model_dump(mode="json") == expected, query


def test_the_latest_run_of_each_flow_matches_a_one_item_listing(tmp_path: Path) -> None:
    runs = fixture_catalog()
    waits = fixture_waits()
    summaries, _, _ = summaries_over(tmp_path, runs)
    asyncio.run(project_live(summaries, runs.values()))

    latest = asyncio.run(SummaryListing(rows=summaries, waits=waits).latest((FLOW, OTHER_FLOW, FlowId("unknown"))))

    expected = {
        flow: old_page(runs, waits, RunListQuery(flow_id=flow, limit=1)).items[0] for flow in (FLOW, OTHER_FLOW)
    }
    assert latest == expected


def test_paging_by_cursor_walks_every_run_once_in_start_order(tmp_path: Path) -> None:
    runs = fixture_catalog()
    waits = fixture_waits()
    summaries, _, _ = summaries_over(tmp_path, runs)
    seen: list[RunId] = []
    cursor: str | None = None

    for _ in runs:
        page = new_page(summaries, waits, RunListQuery(limit=PAGE, cursor=cursor))
        seen.extend(item.run_id for item in page.items)
        cursor = page.next_cursor
        if cursor is None:
            break

    listed = [run for run in runs.values() if run.call is not None and run.call.spec.mode != "experiment"]
    assert seen == [run.run_id for run in sorted(listed, key=lambda run: run.created_at, reverse=True)]


def test_a_replayed_projection_never_moves_the_row_back(tmp_path: Path) -> None:
    run = FixtureRun(
        run_id(1),
        "PENDING",
        stamp(1),
        fixture_runs()[0].call,
        script(1).started(FLOW, "live").node("clean").done("clean").node("reply").done("reply").log(),
    )
    runs = {run.run_id: run}
    summaries, _, _ = summaries_over(tmp_path, runs)
    waits = FakeWaits()
    first = summaries.projection(run.run_id)
    for position, event in enumerate(run.events[:3], start=1):
        asyncio.run(first.written(position, (event,)))
    before = new_page(summaries, waits, RunListQuery()).items

    replayed = summaries.projection(run.run_id)
    asyncio.run(replayed.written(1, (run.events[0],)))
    after_replay = new_page(summaries, waits, RunListQuery()).items
    for position, event in enumerate(run.events[1:], start=2):
        asyncio.run(replayed.written(position, (event,)))
    caught_up = new_page(summaries, waits, RunListQuery()).items

    assert after_replay == before
    assert before[0].node_counts.ok == 1
    assert (caught_up[0].node_counts.ok, caught_up[0].cost_usd) == (2, Decimal("0.0024"))


@pytest.mark.parametrize("live", [True, False], ids=["projected", "backfilled"])
def test_items_recovered_by_on_item_error_reach_the_listed_node_counts(tmp_path: Path, live: bool) -> None:
    run = FixtureRun(
        run_id(1),
        "SUCCESS",
        stamp(1),
        fixture_runs()[0].call,
        script(1)
        .started(FLOW, "live")
        .node("clean")
        .recovered("clean", 0, "default")
        .recovered("clean", 2, "skip")
        .recovered("clean", 3, "default")
        .done("clean")
        .finished("completed")
        .log(),
        updated_at=stamp(1.5),
    )
    runs = {run.run_id: run}
    waits = FakeWaits()
    summaries, _, _ = summaries_over(tmp_path, runs)
    if live:
        asyncio.run(project_live(summaries, runs.values()))

    listed = new_page(summaries, waits, RunListQuery())

    assert listed.model_dump(mode="json") == old_page(runs, waits, RunListQuery()).model_dump(mode="json")
    counts = listed.items[0].node_counts
    assert (counts.items_replaced, counts.items_skipped) == (2, 1)


def test_a_replayed_finish_keeps_the_time_the_log_recorded(tmp_path: Path) -> None:
    template = fixture_runs()[0]
    runs = {template.run_id: template}
    summaries, _, _ = summaries_over(tmp_path, runs)
    asyncio.run(project_live(summaries, runs.values()))
    finish = template.events[-1]
    assert isinstance(finish, RunFinished)
    replayed = finish.model_copy(update={"at": finish.at + timedelta(minutes=5)})

    asyncio.run(summaries.projection(template.run_id).written(sink_position(template.events), (replayed,)))

    assert new_page(summaries, FakeWaits(), RunListQuery()).items[0].finished_at == finish.at


def test_backfill_folds_each_missing_run_once_and_never_again(tmp_path: Path) -> None:
    runs = fixture_catalog()
    summaries, events, _ = summaries_over(tmp_path, runs)

    asyncio.run(summaries.ready())
    asyncio.run(summaries.ready())
    first_pass = sorted(events.reads)
    restarted = RunSummaries(store=summaries.store, catalog=FakeCatalog(runs), events=events)
    asyncio.run(restarted.refresh())

    assert first_pass == sorted(runs)
    assert sorted(events.reads) == first_pass


def test_backfill_after_a_restart_reads_only_runs_the_store_has_not_seen(tmp_path: Path) -> None:
    runs = fixture_catalog()
    summaries, events, _ = summaries_over(tmp_path, runs)
    asyncio.run(summaries.refresh())
    newcomer = replace(completed_run(40), created_at=stamp(30), updated_at=stamp(31))
    grown = {**runs, newcomer.run_id: newcomer}
    events.runs = grown
    events.reads.clear()

    restarted = RunSummaries(store=summaries.store, catalog=FakeCatalog(grown), events=events)
    page = new_page(restarted, fixture_waits(), RunListQuery(limit=1))

    assert events.reads == [newcomer.run_id]
    assert page.items[0].run_id == newcomer.run_id


def test_a_run_that_left_the_workflow_store_leaves_the_listing(tmp_path: Path) -> None:
    runs = fixture_catalog()
    summaries, _, _ = summaries_over(tmp_path, runs)
    asyncio.run(summaries.refresh())
    remaining = {key: run for key, run in runs.items() if key != run_id(1)}

    restarted = RunSummaries(store=summaries.store, catalog=FakeCatalog(remaining), events=FakeEvents(remaining))
    page = new_page(restarted, fixture_waits(), RunListQuery(flow_id=FLOW, status="completed"))

    assert [item.run_id for item in page.items] == [run_id(2)]


def test_a_run_cancelled_out_of_band_is_folded_once_and_then_left_alone(tmp_path: Path) -> None:
    running = FixtureRun(
        run_id(1), "PENDING", stamp(1), fixture_runs()[0].call, script(1).started(FLOW, "live").node("clean").log()
    )
    runs = {running.run_id: running}
    summaries, events, catalog = summaries_over(tmp_path, runs)
    asyncio.run(project_live(summaries, runs.values()))
    waits = FakeWaits()
    active = new_page(summaries, waits, RunListQuery()).items[0]

    catalog.runs[running.run_id] = replace(running, dbos_status="CANCELLED", updated_at=stamp(2))
    cancelled = new_page(summaries, waits, RunListQuery()).items[0]
    observations = catalog.calls["observe"]
    settled = new_page(summaries, waits, RunListQuery()).items[0]

    assert (active.status, active.finished_at) == ("running", None)
    assert (cancelled.status, cancelled.finished_at) == ("cancelled", NOW + timedelta(minutes=2))
    assert events.reads == [running.run_id]
    assert settled == cancelled
    assert catalog.calls["observe"] == observations


def test_a_projection_failure_never_fails_the_run(tmp_path: Path) -> None:
    template = fixture_runs()[0]
    database = tmp_path / "missing" / SUMMARY_DATABASE
    summaries = RunSummaries(store=SqliteRunSummaryStore(database), catalog=FakeCatalog({}), events=FakeEvents({}))

    asyncio.run(summaries.projection(template.run_id).written(1, template.events[:1]))

    assert not database.exists()


def test_the_step_written_events_do_not_count_as_sink_positions() -> None:
    run = fixture_runs()[1]

    assert (len(run.events), sink_position(run.events)) == (5, 4)
    assert folded_run(run.run_id, run.events).last_seq == 4


async def listing_cost(tmp_path: Path, size: int) -> dict[str, object]:
    runs = {
        run.run_id: run
        for run in (
            *(completed_run(n) for n in range(1, size + 1)),
            *(running_run(size + n) for n in range(1, ACTIVE_RUNS + 1)),
        )
    }
    events = FakeEvents(runs)
    catalog = FakeCatalog(runs)
    store = CountingStore(SqliteRunSummaryStore.open(tmp_path / f"{size}.sqlite"))
    await store.inner.apply(
        SummaryChanges(projected=tuple(folded_run(run.run_id, run.events) for run in runs.values()))
    )
    summaries = RunSummaries(store=store, catalog=catalog, events=events)
    waits = FakeWaits()
    listing = SummaryListing(rows=summaries, waits=waits, clock=lambda: NOW)
    await listing.page(RunListQuery(limit=STUDIO_PAGE))
    for counter in (store.calls, catalog.calls, waits.calls):
        counter.clear()
    catalog.observed_ids.clear()
    waits.asked.clear()

    page = await listing.page(RunListQuery(limit=STUDIO_PAGE))
    latest = await listing.latest((FLOW, OTHER_FLOW))

    return {
        "items": len(page.items),
        "latest": len(latest),
        "event_reads": len(events.reads),
        "store": dict(store.calls),
        "catalog": dict(catalog.calls),
        "observed_ids": list(catalog.observed_ids),
        "waits": dict(waits.calls),
        "waits_asked": list(waits.asked),
    }


def test_a_page_costs_the_same_on_a_hundred_runs_and_on_a_thousand(tmp_path: Path) -> None:
    small = asyncio.run(listing_cost(tmp_path, SMALL_PROJECT))
    large = asyncio.run(listing_cost(tmp_path, LARGE_PROJECT))

    assert small == large
    assert large == {
        "items": STUDIO_PAGE,
        "latest": 2,
        "event_reads": 0,
        "store": {"open_rows": 2, "page": 1, "latest": 1},
        "catalog": {"observe": 2},
        "observed_ids": [ACTIVE_RUNS, ACTIVE_RUNS],
        "waits": {"waits_of": 2},
        "waits_asked": [STUDIO_PAGE, 2],
    }


def test_the_store_answers_a_page_without_admitting_pending_rows(tmp_path: Path) -> None:
    store = SqliteRunSummaryStore.open(tmp_path / SUMMARY_DATABASE)
    run = fixture_runs()[0]
    asyncio.run(store.apply(SummaryChanges(projected=(folded_run(run.run_id, run.events),))))

    page = asyncio.run(store.page(SummarySelection(limit=10)))

    assert (page.rows, page.total) == ((), 0)


def test_a_new_schema_version_rebuilds_the_projection_from_the_logs(tmp_path: Path) -> None:
    runs = fixture_catalog()
    summaries, events, _ = summaries_over(tmp_path, runs)
    before = new_page(summaries, fixture_waits(), RunListQuery()).model_dump(mode="json")
    database = tmp_path / SUMMARY_DATABASE
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute(RECORD_VERSION, (SCHEMA_COMPONENT, SCHEMA_VERSION - 1))
    events.reads.clear()

    reopened = RunSummaries(store=SqliteRunSummaryStore.open(database), catalog=FakeCatalog(runs), events=events)
    after = new_page(reopened, fixture_waits(), RunListQuery()).model_dump(mode="json")

    assert sorted(events.reads) == sorted(runs)
    assert after == before
