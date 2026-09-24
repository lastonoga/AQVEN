import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from series_fixture import CRITIC_MODEL, write_project
from series_harness import ScriptedModels, SeriesHarness, series_engine, settled
from series_prices import FIXTURE_PRICES, FixedPrices

from aqven.compiler import compile_root
from aqven.engine import DbosEngineFacade, RunSpec
from aqven.engine.runtime import NO_OVERRIDES
from aqven.ports.engine import RunListQuery
from aqven.series.events import SeriesEventLog
from aqven.series.model import SeriesStatus
from aqven.series.settings import RESEARCH_SCOPE, SPEND_CAP_KEY
from aqven.series.views import (
    LaunchRequest,
    SeriesEvent,
    SeriesStarted,
    SeriesStartRequest,
    SeriesStatusEvent,
    SeriesSummaryView,
)
from aqven.server.errors import ApiFailure
from aqven.spec import ExperimentId, FlowId
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
TRIAGE: Final = FlowId("triage")
TINY_PROJECT_CAP: Final = "0.000001"
QUIET_SECONDS: Final = 1.0


async def priced_history(harness: SeriesHarness, root: Path) -> None:
    facade = DbosEngineFacade(runtime=harness.runtime)
    started = await facade.launch(compile_root(root), RunSpec(flow_id=TRIAGE), {"text": "always right"}, NO_OVERRIDES)
    record = await facade.result(started.run_id)
    assert record.status == "completed"


async def experiment_runs(harness: SeriesHarness) -> int:
    page = await DbosEngineFacade(runtime=harness.runtime).list_runs(RunListQuery(mode="experiment"))
    return len(page.items)


async def gated(
    harness: SeriesHarness, root: Path
) -> tuple[SeriesStarted, int, int, list[SeriesSummaryView | BaseException], SeriesStatus, tuple[SeriesEvent, ...]]:
    await priced_history(harness, root)
    await harness.settings.set_value(RESEARCH_SCOPE, SPEND_CAP_KEY, TINY_PROJECT_CAP)
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_agents")), AGENT)
    await asyncio.sleep(QUIET_SECONDS)
    attempts_before = len(await harness.services.store.attempts(started.series_id))
    runs_before = await experiment_runs(harness)
    approvals = list(
        await asyncio.gather(
            harness.service.approve(started.series_id, HUMAN),
            harness.service.approve(started.series_id, HUMAN),
            return_exceptions=True,
        )
    )
    done = await settled(harness.service, started.series_id)
    events = await SeriesEventLog().snapshot(started.series_id)
    return started, attempts_before, runs_before, approvals, done.series.status, events


def test_an_estimate_above_the_project_cap_waits_for_one_human_approval(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels(), prices=FixedPrices(FIXTURE_PRICES)) as harness:
        started, attempts_before, runs_before, approvals, status, events = asyncio.run(gated(harness, root))

    estimate = started.estimate
    assert started.status is SeriesStatus.AWAITING_APPROVAL
    assert estimate.usd_source == "prices"
    assert estimate.usd is not None and estimate.usd > estimate.project_cap_usd
    assert estimate.needs_approval
    assert (attempts_before, runs_before) == (0, 0)
    accepted = [item for item in approvals if isinstance(item, SeriesSummaryView)]
    rejected = [item for item in approvals if isinstance(item, ApiFailure)]
    assert len(accepted) >= 1
    assert all(item.code == "SERIES_STATE_CONFLICT" for item in rejected)
    assert status is SeriesStatus.DONE
    statuses = [event.status for event in events if isinstance(event, SeriesStatusEvent)]
    assert statuses == [SeriesStatus.AWAITING_APPROVAL, SeriesStatus.RUNNING]


async def approve_running(harness: SeriesHarness) -> None:
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_solo")), AGENT)
    await harness.service.approve(started.series_id, HUMAN)
    await settled(harness.service, started.series_id)
    await harness.service.approve(started.series_id, HUMAN)


def test_approving_a_finished_series_is_a_state_conflict(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness, pytest.raises(ApiFailure) as raised:
        asyncio.run(approve_running(harness))

    assert raised.value.code == "SERIES_STATE_CONFLICT"


async def first_start(harness: SeriesHarness) -> tuple[SeriesStarted, SeriesStatus]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_agents")), AGENT)
    done = await settled(harness.service, started.series_id)
    return started, done.series.status


def test_a_first_series_starts_on_an_upper_bound_under_the_project_cap(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels(), prices=FixedPrices(FIXTURE_PRICES)) as harness:
        started, status = asyncio.run(first_start(harness))

    estimate = started.estimate
    assert estimate.usd_source == "bound"
    assert estimate.usd is not None and Decimal(0) < estimate.usd <= estimate.project_cap_usd
    assert not estimate.needs_approval
    assert started.status is SeriesStatus.RUNNING
    assert status is SeriesStatus.DONE


def test_an_unpriced_judge_leaves_the_first_series_without_an_estimate(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    unpriced = {model: price for model, price in FIXTURE_PRICES.items() if model != CRITIC_MODEL}
    request = LaunchRequest()

    with series_engine(root, ScriptedModels(), prices=FixedPrices(unpriced)) as harness:
        estimate = asyncio.run(harness.service.estimate(ExperimentId("triage_agents"), request))

    assert (estimate.usd, estimate.usd_source) == (None, "unknown")
    assert estimate.needs_approval
    assert f"price_unknown:{CRITIC_MODEL}" in estimate.warnings
