import asyncio
from pathlib import Path
from typing import Final

import pytest
from series_fixture import ABOVE_PROJECT_CAP, write_project
from series_harness import ScriptedModels, SeriesHarness, series_engine, settled

from aqven.runtime.runs import Page
from aqven.series.model import SeriesId, SeriesRecord, SeriesStatus
from aqven.series.views import (
    SeriesCasesQuery,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesListQuery,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.server.errors import ApiFailure
from aqven.spec import ExperimentId
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
SOLO: Final = ExperimentId("triage_solo")
WAIT_SECONDS: Final = 30


async def waited(harness: SeriesHarness) -> tuple[SeriesGetResult, SeriesGetResult, SeriesRecord]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=SOLO, cap_usd=ABOVE_PROJECT_CAP), AGENT)
    pending = await harness.service.get(SeriesGetRequest(series_id=started.series_id, wait_seconds=WAIT_SECONDS))
    await harness.service.approve(started.series_id, HUMAN)
    done = await harness.service.get(SeriesGetRequest(series_id=started.series_id, wait_seconds=WAIT_SECONDS))
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return pending, done, record


def test_waiting_returns_at_once_for_approval_and_when_the_series_is_done(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        pending, done, record = asyncio.run(waited(harness))

    assert pending.series.status is SeriesStatus.AWAITING_APPROVAL
    assert pending.series.eta is not None and pending.series.eta.state == "paused"
    assert done.series.status is SeriesStatus.DONE
    assert done.series.progress.done == 8
    assert done.series.eta is None
    assert [(span.started_at, span.ended_at) for span in record.pauses] == [(record.created_at, record.approved_at)]


async def followed(harness: SeriesHarness) -> tuple[list[SeriesEvent], list[SeriesEvent]]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=SOLO), AGENT)
    everything = [event async for event in harness.service.events(started.series_id, 0)]
    tail = [event async for event in harness.service.events(started.series_id, len(everything) - 2)]
    return everything, tail


def test_following_the_events_ends_at_the_finish_and_resumes_after_a_cursor(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        everything, tail = asyncio.run(followed(harness))

    assert isinstance(everything[-1], SeriesFinishedEvent)
    assert len(everything) == 8 + 1
    assert [event.seq for event in tail] == [len(everything) - 1, len(everything)]


async def unknown_events(harness: SeriesHarness) -> None:
    async for _ in harness.service.events(SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2f"), 0):
        return


def test_events_of_an_unknown_series_are_not_found(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness, pytest.raises(ApiFailure) as raised:
        asyncio.run(unknown_events(harness))

    assert raised.value.code == "NOT_FOUND"


async def listed(
    harness: SeriesHarness,
) -> tuple[SeriesStarted, SeriesStarted, Page[SeriesSummaryView], Page[SeriesSummaryView], tuple[str, ...]]:
    first = await harness.service.start(SeriesStartRequest(experiment_id=SOLO), AGENT)
    await settled(harness.service, first.series_id)
    second = await harness.service.start(SeriesStartRequest(experiment_id=SOLO), AGENT)
    await settled(harness.service, second.series_id)
    head = await harness.service.list(SeriesListQuery(experiment_id=SOLO, limit=1))
    rest = await harness.service.list(SeriesListQuery(experiment_id=SOLO, limit=1, cursor=head.next_cursor))
    failing = await harness.service.cases(first.series_id, SeriesCasesQuery(failures=True))
    return first, second, head, rest, tuple(row.name for row in failing)


def test_the_list_pages_newest_first_and_cases_filter_failures(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        first, second, head, rest, failing = asyncio.run(listed(harness))

    assert (first.status, second.status) == (SeriesStatus.RUNNING, SeriesStatus.RUNNING)
    assert second.launch.cap_usd == second.launch.project_cap_usd
    assert [item.series_id for item in head.items] == [second.series_id]
    assert head.next_cursor is not None
    assert [item.series_id for item in rest.items] == [first.series_id]
    assert rest.next_cursor is None
    assert failing == ("never_1",)
