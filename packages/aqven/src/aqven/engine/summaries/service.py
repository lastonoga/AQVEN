import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from itertools import batched
from typing import Final, Protocol

from aqven.engine.projection import RunFold
from aqven.engine.reader import RunEventLog
from aqven.engine.summaries.catalog import OBSERVE_BATCH, DbosWorkflowCatalog
from aqven.engine.summaries.model import (
    Admission,
    ObservedRun,
    OpenRow,
    ProjectedRun,
    StoredEvents,
    SummaryChanges,
    SummarySelection,
    SummaryWriter,
    WorkflowCatalog,
    admitted_run,
    folded_run,
    projected_run,
)
from aqven.engine.summaries.store import SummaryPage, SummaryRecord
from aqven.runtime.address import RunId
from aqven.runtime.events import RunEvent
from aqven.spec import FlowId

SUMMARY_LOGGER: Final = logging.getLogger("aqven.engine.summaries")
LISTED: Final[Admission] = "listed"


class SummaryStore(SummaryWriter, Protocol):
    async def admissions(self) -> Mapping[RunId, Admission]: ...

    async def open_rows(self) -> tuple[OpenRow, ...]: ...

    async def page(self, selection: SummarySelection) -> SummaryPage: ...

    async def latest(self, flow_ids: Sequence[FlowId]) -> tuple[SummaryRecord, ...]: ...


@dataclass(slots=True)
class RunProjection:
    run_id: RunId
    writer: SummaryWriter
    fold: RunFold = field(default_factory=RunFold)

    async def written(self, position: int, events: Sequence[RunEvent]) -> None:
        for event in events:
            self.fold.apply(event)
        projected = projected_run(self.run_id, position, self.fold)
        try:
            await self.writer.apply(SummaryChanges(projected=(projected,)))
        except Exception as error:
            SUMMARY_LOGGER.warning("run %s summary was not projected at seq %s: %s", self.run_id, position, error)


def materialized_changes(observed: Sequence[ObservedRun], projected: tuple[ProjectedRun, ...]) -> SummaryChanges:
    return SummaryChanges(
        admitted=tuple(found for item in observed if (found := admitted_run(item)) is not None),
        rejected=tuple(item.run_id for item in observed if item.call is None),
        projected=projected,
        settled=tuple(item.run_id for item in observed if item.status.terminal),
    )


def refresh_changes(
    rows: Sequence[OpenRow],
    admitted: Sequence[ObservedRun],
    seen: Sequence[ObservedRun],
    repaired: tuple[ProjectedRun, ...],
) -> SummaryChanges:
    answered = frozenset(item.run_id for item in (*admitted, *seen))
    unreadable = tuple(item.run_id for item in admitted if item.call is None)
    vanished = tuple(row.run_id for row in rows if row.run_id not in answered)
    stored = {row.run_id: row for row in rows}
    return SummaryChanges(
        admitted=tuple(found for item in admitted if (found := admitted_run(item)) is not None),
        rejected=(*unreadable, *vanished),
        observed=tuple(item.status for item in seen if not stored[item.run_id].unchanged(item.status)),
        projected=repaired,
        settled=tuple(run.run_id for run in repaired),
    )


def settled_out_of_band(observed: Sequence[ObservedRun], rows: Sequence[OpenRow]) -> tuple[RunId, ...]:
    finished = frozenset(row.run_id for row in rows if row.finished)
    return tuple(item.run_id for item in observed if item.status.terminal and item.run_id not in finished)


@dataclass(slots=True)
class RunSummaries:
    store: SummaryStore
    catalog: WorkflowCatalog = field(default_factory=DbosWorkflowCatalog)
    events: StoredEvents = field(default_factory=RunEventLog)
    backfilled: bool = False

    def projection(self, run_id: RunId) -> RunProjection:
        return RunProjection(run_id=run_id, writer=self.store)

    async def page(self, selection: SummarySelection) -> SummaryPage:
        await self.refresh()
        return await self.store.page(selection)

    async def latest(self, flow_ids: Sequence[FlowId]) -> tuple[SummaryRecord, ...]:
        await self.refresh()
        return await self.store.latest(flow_ids)

    async def ready(self) -> None:
        if self.backfilled:
            return
        known = await self.store.admissions()
        present = await self.catalog.run_ids()
        existing = frozenset(present)
        vanished = tuple(
            run_id for run_id, admission in known.items() if admission == LISTED and run_id not in existing
        )
        await self._apply(SummaryChanges(rejected=vanished))
        missing = tuple(run_id for run_id in present if run_id not in known)
        for chunk in batched(missing, OBSERVE_BATCH, strict=False):
            await self._materialize(await self.catalog.observe(chunk, with_call=True))
        self.backfilled = True

    async def warm(self) -> None:
        try:
            await self.ready()
        except Exception as error:
            SUMMARY_LOGGER.warning("run summaries were not backfilled at start, the first listing retries: %s", error)

    async def refresh(self) -> None:
        await self.ready()
        rows = await self.store.open_rows()
        if not rows:
            return
        admitted = await self.catalog.observe([row.run_id for row in rows if row.pending], with_call=True)
        seen = await self.catalog.observe([row.run_id for row in rows if not row.pending], with_call=False)
        broken = settled_out_of_band((*admitted, *seen), rows)
        repaired = tuple([await self._folded(run_id) for run_id in broken])
        await self._apply(refresh_changes(rows, admitted, seen, repaired))

    async def track(self, run_id: RunId) -> None:
        await self._materialize(await self.catalog.observe((run_id,), with_call=True))

    async def _materialize(self, observed: Sequence[ObservedRun]) -> None:
        projected = tuple([await self._folded(item.run_id) for item in observed])
        await self.store.apply(materialized_changes(observed, projected))

    async def _apply(self, changes: SummaryChanges) -> None:
        if changes.empty:
            return
        await self.store.apply(changes)

    async def _folded(self, run_id: RunId) -> ProjectedRun:
        return folded_run(run_id, await self.events.stored(run_id))
