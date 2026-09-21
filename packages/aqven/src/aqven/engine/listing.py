from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final, Protocol

from aqven.ports.engine import DEADLINE_SORT, RunListQuery, RunSort
from aqven.runtime.address import RunId
from aqven.runtime.human import OpenWaitFilter
from aqven.runtime.runs import Page, RunSummary

FIRST_PAGE: Final = 0
SUSPENDED: Final = "suspended"


@dataclass(frozen=True, slots=True)
class WorkflowFilters:
    start_time: str | None = None
    end_time: str | None = None
    forked_from: str | None = None


class RunRows(Protocol):
    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]: ...

    async def summaries(self, filters: WorkflowFilters, run_ids: Sequence[RunId] | None) -> Sequence[RunSummary]: ...


@dataclass(frozen=True, slots=True)
class WaitPlan:
    wanted: OpenWaitFilter
    restricts: bool


def utc_now() -> datetime:
    return datetime.now(UTC)


def workflow_filters(query: RunListQuery) -> WorkflowFilters:
    return WorkflowFilters(
        start_time=None if query.since is None else query.since.isoformat(),
        end_time=None if query.until is None else query.until.isoformat(),
        forked_from=query.parent_run_id,
    )


def wait_filter(query: RunListQuery, now: datetime) -> OpenWaitFilter:
    return OpenWaitFilter(
        assignee=query.assignee,
        deadline_before=query.deadline_before,
        overdue_at=now if query.overdue is True else None,
        upcoming_at=now if query.overdue is False else None,
    )


def restricts_by_waits(query: RunListQuery) -> bool:
    return (
        query.assignee is not None
        or query.deadline_before is not None
        or query.overdue is not None
        or query.status == SUSPENDED
    )


def wait_plan(query: RunListQuery, now: datetime) -> WaitPlan | None:
    restricts = restricts_by_waits(query)
    if not restricts and query.sort != DEADLINE_SORT:
        return None
    return WaitPlan(wanted=wait_filter(query, now), restricts=restricts)


def matches(row: RunSummary, query: RunListQuery) -> bool:
    lineage = row.lineage
    checks = (
        query.flow_id is None or row.flow_id == query.flow_id,
        query.status is None or row.status == query.status,
        query.mode is None or row.mode == query.mode,
        query.parent_run_id is None or (lineage is not None and lineage.parent_run_id == query.parent_run_id),
        query.since is None or row.started_at >= query.since,
        query.until is None or row.started_at <= query.until,
    )
    return all(checks)


def ranks_of(order: Sequence[RunId]) -> Mapping[RunId, int]:
    return {run_id: place for place, run_id in enumerate(order)}


def ordered_rows(rows: Sequence[RunSummary], sort: RunSort, order: Sequence[RunId]) -> list[RunSummary]:
    if sort != DEADLINE_SORT:
        return list(rows)
    ranks = ranks_of(order)
    unranked = len(ranks)
    return sorted(rows, key=lambda row: (ranks.get(row.run_id, unranked), -row.started_at.timestamp(), row.run_id))


def page_of(rows: Sequence[RunSummary], cursor: str | None, limit: int) -> Page[RunSummary]:
    start = int(cursor) if cursor is not None and cursor.isdigit() else FIRST_PAGE
    following = start + limit
    return Page[RunSummary](
        items=tuple(rows[start:following]),
        next_cursor=str(following) if following < len(rows) else None,
        total_estimate=len(rows),
    )


@dataclass(frozen=True, slots=True)
class RunListing:
    rows: RunRows
    clock: Callable[[], datetime] = utc_now

    async def page(self, query: RunListQuery) -> Page[RunSummary]:
        plan = wait_plan(query, self.clock())
        order = () if plan is None else await self.rows.open_runs(plan.wanted)
        restricted = plan is not None and plan.restricts
        if restricted and not order:
            return page_of((), query.cursor, query.limit)
        selected = order if restricted else None
        found = await self.rows.summaries(workflow_filters(query), selected)
        matching = [row for row in found if matches(row, query)]
        return page_of(ordered_rows(matching, query.sort, order), query.cursor, query.limit)
