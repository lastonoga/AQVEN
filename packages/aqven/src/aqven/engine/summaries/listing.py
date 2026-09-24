from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Final, Protocol

from aqven.engine.listing import (
    SUSPENDED,
    WaitPlan,
    cursor_start,
    page_of,
    utc_now,
    wait_plan,
    window_page,
)
from aqven.engine.summaries.model import SummarySelection, epoch_microseconds
from aqven.engine.summaries.store import SummaryPage, SummaryRecord
from aqven.ports.engine import DEADLINE_SORT, RunListQuery
from aqven.runtime.address import RunId
from aqven.runtime.human import HumanWait, OpenWaitFilter
from aqven.runtime.runs import Page, RunSummary
from aqven.runtime.vocabulary import RunStatus
from aqven.spec import FlowId

RUNNING: Final[RunStatus] = "running"
EVERY_WAIT: Final = OpenWaitFilter()


class SummaryRows(Protocol):
    async def page(self, selection: SummarySelection) -> SummaryPage: ...

    async def latest(self, flow_ids: Sequence[FlowId]) -> tuple[SummaryRecord, ...]: ...


class WaitRows(Protocol):
    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]: ...

    async def waits_of(self, run_ids: Sequence[RunId]) -> Mapping[RunId, tuple[HumanWait, ...]]: ...


def base_status_of(status: RunStatus | None) -> RunStatus | None:
    return RUNNING if status == SUSPENDED else status


def epoch_bound(moment: datetime | None) -> int | None:
    return None if moment is None else epoch_microseconds(moment)


def selection_of(
    query: RunListQuery, plan: WaitPlan | None, order: tuple[RunId, ...], busy: tuple[RunId, ...] | None
) -> SummarySelection:
    return SummarySelection(
        limit=query.limit,
        offset=cursor_start(query.cursor),
        flow_id=query.flow_id,
        base_status=base_status_of(query.status),
        mode=query.mode,
        parent_run_id=query.parent_run_id,
        since_us=epoch_bound(query.since),
        until_us=epoch_bound(query.until),
        only=order if plan is not None and plan.restricts else None,
        excluded=busy,
        ranks=order if query.sort == DEADLINE_SORT else None,
    )


@dataclass(frozen=True, slots=True)
class SummaryListing:
    rows: SummaryRows
    waits: WaitRows
    clock: Callable[[], datetime] = utc_now

    async def page(self, query: RunListQuery) -> Page[RunSummary]:
        plan = wait_plan(query, self.clock())
        order = () if plan is None else await self.waits.open_runs(plan.wanted)
        if plan is not None and plan.restricts and not order:
            return page_of((), query.cursor, query.limit)
        busy = await self._busy(query)
        found = await self.rows.page(selection_of(query, plan, order, busy))
        items = await self._summaries(found.rows)
        return window_page(items, cursor_start(query.cursor), query.limit, found.total)

    async def latest(self, flow_ids: Sequence[FlowId]) -> Mapping[FlowId, RunSummary]:
        items = await self._summaries(await self.rows.latest(flow_ids))
        return {item.flow_id: item for item in items}

    async def _busy(self, query: RunListQuery) -> tuple[RunId, ...] | None:
        if query.status != RUNNING:
            return None
        return await self.waits.open_runs(EVERY_WAIT)

    async def _summaries(self, rows: tuple[SummaryRecord, ...]) -> tuple[RunSummary, ...]:
        waits = await self.waits.waits_of(tuple(row.run_id for row in rows))
        return tuple(row.summary(waits.get(row.run_id, ())) for row in rows)
