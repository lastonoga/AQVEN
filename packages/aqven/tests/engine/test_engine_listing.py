import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Final

from aqven.engine.listing import RunListing, WorkflowFilters
from aqven.ports.engine import RunListQuery
from aqven.runtime.address import RunId, node_address
from aqven.runtime.human import HumanWait, OpenWaitFilter
from aqven.runtime.runs import Lineage, NodeCounts, Page, RunSummary
from aqven.runtime.vocabulary import RunMode, RunStatus
from aqven.spec import FlowId, TypeId

NOW: Final = datetime(2026, 9, 18, 12, 0, tzinfo=UTC)
FLOW: Final = FlowId("support_case")
OTHER_FLOW: Final = FlowId("panel")
LEAD: Final = "support_lead"
EDITOR: Final = "brand_editor"
PAGE_LIMIT: Final = 5
MANY: Final = 30


def run_id(number: int) -> RunId:
    return RunId(f"01a0aa21-b9a7-74fb-b1f3-{number:012d}")


def human_wait(assignee: str, deadline: datetime) -> HumanWait:
    return HumanWait(
        address=node_address("review"),
        wait_kind="form",
        attempt=1,
        state="waiting",
        assignee=assignee,
        waiting_since=NOW,
        deadline_at=deadline,
        on_timeout="fail",
        form_type_id=TypeId("ReviewDecision"),
    )


def summary(
    number: int,
    *,
    status: RunStatus = "suspended",
    flow_id: FlowId = FLOW,
    mode: RunMode = "live",
    started_at: datetime = NOW,
    waits: tuple[HumanWait, ...] = (),
    parent: RunId | None = None,
) -> RunSummary:
    return RunSummary(
        run_id=run_id(number),
        flow_id=flow_id,
        status=status,
        mode=mode,
        started_at=started_at,
        finished_at=None,
        cost_usd=Decimal(0),
        tokens_in=0,
        tokens_out=0,
        node_counts=NodeCounts(pending=0, running=0, ok=1, failed=0, skipped=0, suspended=1, cancelled=0),
        content_hash="sha256-" + "0" * 64,
        definition_changed=False,
        waits=waits,
        lineage=None if parent is None else Lineage(relation="fork", parent_run_id=parent),
    )


@dataclass(slots=True)
class FakeRows:
    rows: list[RunSummary]
    deadlines: dict[RunId, tuple[str, datetime]] = field(default_factory=dict[RunId, tuple[str, datetime]])
    filters: list[WorkflowFilters] = field(default_factory=list[WorkflowFilters])
    wanted: list[OpenWaitFilter] = field(default_factory=list[OpenWaitFilter])
    selections: list[tuple[RunId, ...] | None] = field(default_factory=list[tuple[RunId, ...] | None])

    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]:
        self.wanted.append(wanted)
        matching = [item for item in self.deadlines.items() if self._matches(wanted, item[1])]
        return tuple(key for key, _ in sorted(matching, key=lambda item: (item[1][1], item[0])))

    async def summaries(self, filters: WorkflowFilters, run_ids: Sequence[RunId] | None) -> Sequence[RunSummary]:
        self.filters.append(filters)
        self.selections.append(None if run_ids is None else tuple(run_ids))
        chosen = None if run_ids is None else frozenset(run_ids)
        rows = [row for row in self.rows if chosen is None or row.run_id in chosen]
        ordered = sorted(rows, key=lambda row: row.started_at, reverse=True)
        return ordered if filters.needed is None else ordered[: filters.needed]

    def _matches(self, wanted: OpenWaitFilter, entry: tuple[str, datetime]) -> bool:
        assignee, deadline = entry
        checks = (
            wanted.assignee is None or wanted.assignee == assignee,
            wanted.deadline_before is None or deadline < wanted.deadline_before,
            wanted.overdue_at is None or deadline < wanted.overdue_at,
            wanted.upcoming_at is None or deadline >= wanted.upcoming_at,
        )
        return all(checks)


def inbox_rows(count: int = MANY) -> FakeRows:
    order = [(number * 7) % count for number in range(count)]
    rows: list[RunSummary] = []
    deadlines: dict[RunId, tuple[str, datetime]] = {}
    for number, place in enumerate(order):
        deadline = NOW + timedelta(hours=place - count // 2)
        assignee = LEAD if number % 2 == 0 else EDITOR
        rows.append(
            summary(number, waits=(human_wait(assignee, deadline),), started_at=NOW + timedelta(minutes=number))
        )
        deadlines[run_id(number)] = (assignee, deadline)
    return FakeRows(rows=rows, deadlines=deadlines)


def listed(rows: FakeRows, query: RunListQuery) -> Page[RunSummary]:
    return asyncio.run(RunListing(rows, clock=lambda: NOW).page(query))


def deadlines_of(page: Page[RunSummary]) -> list[datetime]:
    return [item.waits[0].deadline_at for item in page.items]


def test_deadline_sort_orders_every_wait_not_only_the_first_page() -> None:
    rows = inbox_rows()

    page = listed(rows, RunListQuery(status="suspended", sort="deadline_at", limit=PAGE_LIMIT))
    following = listed(rows, RunListQuery(status="suspended", sort="deadline_at", limit=PAGE_LIMIT, cursor="5"))

    earliest = sorted(deadline for _, deadline in rows.deadlines.values())
    assert deadlines_of(page) == earliest[:PAGE_LIMIT]
    assert deadlines_of(following) == earliest[PAGE_LIMIT : PAGE_LIMIT * 2]
    assert (page.next_cursor, page.total_estimate) == ("5", MANY)


def test_deadline_sort_asks_the_index_and_restricts_the_store_to_waiting_runs() -> None:
    rows = inbox_rows()

    listed(rows, RunListQuery(status="suspended", sort="deadline_at", limit=PAGE_LIMIT))

    assert rows.wanted[-1] == OpenWaitFilter(assignee=None, deadline_before=None, overdue_at=None, upcoming_at=None)
    assert rows.selections[-1] is not None
    assert len(rows.selections[-1] or ()) == MANY


def test_overdue_filter_keeps_only_waits_past_the_deadline() -> None:
    rows = inbox_rows()

    page = listed(rows, RunListQuery(overdue=True, sort="deadline_at", limit=MANY))

    assert rows.wanted[-1].overdue_at == NOW
    assert deadlines_of(page) == sorted(deadline for _, deadline in rows.deadlines.values() if deadline < NOW)


def test_not_overdue_filter_keeps_only_upcoming_waits() -> None:
    rows = inbox_rows()

    page = listed(rows, RunListQuery(overdue=False, sort="deadline_at", limit=MANY))

    assert rows.wanted[-1].upcoming_at == NOW
    assert all(item.waits[0].deadline_at >= NOW for item in page.items)


def test_deadline_before_and_assignee_reach_the_index() -> None:
    rows = inbox_rows()
    before = NOW + timedelta(hours=2)

    page = listed(rows, RunListQuery(assignee=LEAD, deadline_before=before, limit=MANY))

    assert (rows.wanted[-1].assignee, rows.wanted[-1].deadline_before) == (LEAD, before)
    assert all(item.waits[0].assignee == LEAD for item in page.items)
    assert all(item.waits[0].deadline_at < before for item in page.items)


def test_an_empty_index_answer_makes_an_empty_page_without_touching_the_store() -> None:
    rows = FakeRows(rows=[summary(1, status="completed")])

    page = listed(rows, RunListQuery(assignee="nobody"))

    assert (page.items, page.next_cursor, page.total_estimate) == ((), None, 0)
    assert rows.filters == []


def test_started_sort_keeps_store_order_and_filters_flow_and_mode() -> None:
    rows = FakeRows(
        rows=[
            summary(1, status="completed", started_at=NOW, mode="live"),
            summary(2, status="completed", started_at=NOW + timedelta(minutes=1), flow_id=OTHER_FLOW),
            summary(3, status="completed", started_at=NOW + timedelta(minutes=2), mode="replay"),
        ]
    )

    page = listed(rows, RunListQuery(flow_id=FLOW, mode="live"))

    assert [item.run_id for item in page.items] == [run_id(1)]
    assert rows.wanted == []
    assert rows.selections == [None]


def test_since_until_and_parent_are_pushed_to_the_store() -> None:
    parent = run_id(9)
    since = NOW - timedelta(days=1)
    until = NOW + timedelta(days=1)
    rows = FakeRows(rows=[summary(1, status="completed", parent=parent)])

    page = listed(rows, RunListQuery(since=since, until=until, parent_run_id=parent))

    assert rows.filters == [
        WorkflowFilters(start_time=since.isoformat(), end_time=until.isoformat(), forked_from=parent, needed=21)
    ]
    assert [item.run_id for item in page.items] == [run_id(1)]


def test_runs_outside_the_time_window_do_not_reach_the_page() -> None:
    rows = FakeRows(rows=[summary(1, status="completed", started_at=NOW - timedelta(days=2))])

    page = listed(rows, RunListQuery(since=NOW - timedelta(days=1)))

    assert page.items == ()


def test_runs_without_waits_follow_the_ranked_ones() -> None:
    deadline = NOW + timedelta(hours=1)
    rows = FakeRows(
        rows=[
            summary(1, status="completed", started_at=NOW + timedelta(minutes=5)),
            summary(2, waits=(human_wait(LEAD, deadline),), started_at=NOW),
        ],
        deadlines={run_id(2): (LEAD, deadline)},
    )

    page = listed(rows, RunListQuery(sort="deadline_at"))

    assert [item.run_id for item in page.items] == [run_id(2), run_id(1)]


def test_a_started_page_asks_the_store_for_one_row_past_the_page() -> None:
    rows = FakeRows(
        rows=[summary(index, status="completed", started_at=NOW + timedelta(minutes=index)) for index in range(5)]
    )

    page = listed(rows, RunListQuery(flow_id=FLOW, limit=2))

    assert rows.filters == [WorkflowFilters(flow_id=FLOW, needed=3)]
    assert [item.run_id for item in page.items] == [run_id(4), run_id(3)]
    assert page.next_cursor == "2"
    assert page.total_estimate is None


def test_a_status_filter_still_reads_every_candidate() -> None:
    rows = FakeRows(
        rows=[summary(1, status="completed"), summary(2, status="failed", started_at=NOW + timedelta(minutes=1))]
    )

    page = listed(rows, RunListQuery(status="completed", limit=1))

    assert rows.filters[0].needed is None
    assert [item.run_id for item in page.items] == [run_id(1)]
    assert page.total_estimate == 1
