from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Literal

from pydantic import AwareDatetime, Field

from aqven.engine.listing import HIDDEN_MODE, hides_experiments
from aqven.ports.engine import EngineFacade, RunListQuery
from aqven.runtime.address import ResourceModel, RunId
from aqven.runtime.runs import Page, RunSummary
from aqven.runtime.vocabulary import RunMode, RunStatus
from aqven.spec import ExperimentId, FlowId

type RunListView = Literal["full", "compact"]

COUNTING_LIMIT: Final = 1


class RunRow(ResourceModel):
    run_id: RunId
    flow_id: FlowId
    status: RunStatus
    mode: RunMode
    started_at: AwareDatetime
    finished_at: AwareDatetime | None
    cost_usd: Decimal
    waits: int = Field(ge=0)
    dataset_item_id: str | None = None
    series_id: str | None = None
    experiment_id: ExperimentId | None = None


class RunListPage[T](Page[T]):
    hidden_experiment_runs: int | None = Field(default=None, ge=0)


class RunListInput(RunListQuery):
    view: RunListView = "full"


def run_row(summary: RunSummary) -> RunRow:
    return RunRow(
        run_id=summary.run_id,
        flow_id=summary.flow_id,
        status=summary.status,
        mode=summary.mode,
        started_at=summary.started_at,
        finished_at=summary.finished_at,
        cost_usd=summary.cost_usd,
        waits=len(summary.waits),
        dataset_item_id=summary.dataset_item_id,
        series_id=summary.series_id,
        experiment_id=summary.experiment_id,
    )


def listed[T](page: RunListPage[RunSummary], items: tuple[T, ...], kind: type[RunListPage[T]]) -> RunListPage[T]:
    return kind(
        items=items,
        next_cursor=page.next_cursor,
        total_estimate=page.total_estimate,
        hidden_experiment_runs=page.hidden_experiment_runs,
    )


def query_of(request: RunListInput) -> RunListQuery:
    return RunListQuery.model_validate(request.model_dump(exclude={"view"}))


@dataclass(frozen=True, slots=True)
class RunListService:
    facade: EngineFacade

    async def page(self, query: RunListQuery) -> RunListPage[RunSummary]:
        found = await self.facade.list_runs(query)
        return RunListPage[RunSummary](
            items=found.items,
            next_cursor=found.next_cursor,
            total_estimate=found.total_estimate,
            hidden_experiment_runs=await self._hidden(query),
        )

    async def rows(self, query: RunListQuery) -> RunListPage[RunRow]:
        page = await self.page(query)
        return listed(page, tuple(run_row(item) for item in page.items), RunListPage[RunRow])

    async def listing(self, request: RunListInput) -> RunListPage[RunSummary | RunRow]:
        return await self._views()[request.view](query_of(request))

    def _views(self) -> Mapping[RunListView, Callable[[RunListQuery], Awaitable[RunListPage[RunSummary | RunRow]]]]:
        return {"full": self._full, "compact": self._compact}

    async def _full(self, query: RunListQuery) -> RunListPage[RunSummary | RunRow]:
        page = await self.page(query)
        items: tuple[RunSummary | RunRow, ...] = page.items
        return listed(page, items, RunListPage[RunSummary | RunRow])

    async def _compact(self, query: RunListQuery) -> RunListPage[RunSummary | RunRow]:
        page = await self.page(query)
        rows: tuple[RunSummary | RunRow, ...] = tuple(run_row(item) for item in page.items)
        return listed(page, rows, RunListPage[RunSummary | RunRow])

    async def _hidden(self, query: RunListQuery) -> int | None:
        if not hides_experiments(query):
            return None
        counting = query.model_copy(update={"mode": HIDDEN_MODE, "cursor": None, "limit": COUNTING_LIMIT})
        counted = await self.facade.list_runs(counting)
        return counted.total_estimate
