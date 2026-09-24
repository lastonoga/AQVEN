import asyncio
from pathlib import Path
from typing import Final

import pytest
from series_fixture import ABOVE_PROJECT_CAP, write_project
from series_harness import ScriptedModels, SeriesHarness, reached, series_engine, settled

from aqven.engine import DbosEngineFacade
from aqven.ports.engine import RunListQuery
from aqven.series.events import SeriesEventLog
from aqven.series.model import ApprovalReason, SeriesStatus
from aqven.series.settings import RESEARCH_SCOPE, SPEND_CAP_KEY
from aqven.series.views import (
    SeriesCancelRequest,
    SeriesEvent,
    SeriesStarted,
    SeriesStartRequest,
    SeriesStatusEvent,
    SeriesSummaryView,
)
from aqven.server.errors import ApiFailure
from aqven.spec import ExperimentId
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
TINY_PROJECT_CAP: Final = "0.000001"
QUIET_SECONDS: Final = 1.0


async def experiment_runs(harness: SeriesHarness) -> int:
    page = await DbosEngineFacade(runtime=harness.runtime).list_runs(RunListQuery(mode="experiment"))
    return len(page.items)


async def under_a_tiny_cap(harness: SeriesHarness) -> tuple[SeriesStarted, SeriesSummaryView]:
    await harness.settings.set_value(RESEARCH_SCOPE, SPEND_CAP_KEY, TINY_PROJECT_CAP)
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_agents")), AGENT)
    paused = await reached(harness.service, started.series_id, SeriesStatus.AWAITING_APPROVAL)
    await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    return started, paused.series


def test_a_tiny_project_cap_starts_at_once_and_pauses_on_actual_spend(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        started, paused = asyncio.run(under_a_tiny_cap(harness))

    launch = started.launch
    assert started.status is SeriesStatus.RUNNING
    assert not launch.needs_approval
    assert launch.cap_usd == launch.project_cap_usd == started.spend.cap_usd
    assert paused.pause is not None and paused.pause.reason is ApprovalReason.SPEND_NEAR_CAP
    assert paused.progress.done > 0


async def gated(
    harness: SeriesHarness,
) -> tuple[SeriesStarted, int, int, list[SeriesSummaryView | BaseException], SeriesStatus, tuple[SeriesEvent, ...]]:
    request = SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), cap_usd=ABOVE_PROJECT_CAP)
    started = await harness.service.start(request, AGENT)
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


def test_a_series_cap_above_the_project_cap_waits_for_one_human_approval(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        started, attempts_before, runs_before, approvals, status, events = asyncio.run(gated(harness))

    launch = started.launch
    assert started.status is SeriesStatus.AWAITING_APPROVAL
    assert started.pause is not None and started.pause.reason is ApprovalReason.CAP_ABOVE_PROJECT
    assert (launch.needs_approval, launch.cap_usd) == (True, ABOVE_PROJECT_CAP)
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


def test_a_first_series_starts_at_once_under_the_project_cap(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        started, status = asyncio.run(first_start(harness))

    launch = started.launch
    assert not launch.needs_approval
    assert launch.cap_usd == launch.project_cap_usd
    assert started.status is SeriesStatus.RUNNING
    assert status is SeriesStatus.DONE
