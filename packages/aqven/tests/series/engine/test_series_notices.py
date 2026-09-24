import asyncio
from pathlib import Path
from typing import Final

from series_feed import RecordingFeed
from series_fixture import ABOVE_PROJECT_CAP, REVIEW_CASES, write_project
from series_harness import ScriptedModels, SeriesHarness, reached, series_engine, settled, wait_until

from aqven.engine import DbosEngineFacade
from aqven.runtime.human import ResumeRequest
from aqven.series.feed import SeriesKey, SeriesStartedNotice
from aqven.series.model import SeriesStatus
from aqven.series.views import LookTarget, SeriesCancelRequest, SeriesCasesQuery, SeriesGetResult, SeriesStartRequest
from aqven.spec import DatasetId, ExperimentId, FlowId
from aqven.testing.human import new_client_op_id
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
EXPERIMENT: Final = ExperimentId("triage_agents")
ATTEMPTS: Final = 24
NOTICE_SECONDS: Final = 30.0


async def approved_series(harness: SeriesHarness) -> SeriesGetResult:
    started = await harness.service.start(SeriesStartRequest(experiment_id=EXPERIMENT), AGENT)
    return await settled(harness.service, started.series_id)


def test_a_series_announces_its_start_every_attempt_and_each_status_it_moves_through(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    feed = RecordingFeed()

    with series_engine(root, ScriptedModels(), feed=feed) as harness:
        done = asyncio.run(approved_series(harness))

    series = done.series
    key = SeriesKey(series_id=series.series_id, experiment_id=EXPERIMENT, flow_id=series.flow_id)
    assert feed.started() == (SeriesStartedNotice(series=key, status=SeriesStatus.RUNNING, total=ATTEMPTS),)
    assert feed.seen()[0] == feed.started()[0]
    assert feed.transitions() == ((SeriesStatus.RUNNING, SeriesStatus.DONE),)
    progress = feed.progress()
    assert [notice.done for notice in progress] == list(range(1, ATTEMPTS + 1))
    assert {notice.total for notice in progress} == {ATTEMPTS}
    assert {notice.series for notice in progress} == {key}
    assert progress[-1].complete
    assert progress[-1].spend_usd == series.spend.usd


async def cancelled_while_waiting_for_approval(harness: SeriesHarness) -> SeriesGetResult:
    request = SeriesStartRequest(experiment_id=EXPERIMENT, cap_usd=ABOVE_PROJECT_CAP)
    started = await harness.service.start(request, AGENT)
    await harness.service.cancel(SeriesCancelRequest(series_id=started.series_id))
    return await settled(harness.service, started.series_id)


def test_a_cancelled_series_announces_the_cancel_without_progress(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    feed = RecordingFeed()

    with series_engine(root, ScriptedModels(), feed=feed) as harness:
        done = asyncio.run(cancelled_while_waiting_for_approval(harness))

    assert done.series.status is SeriesStatus.CANCELLED
    assert len(feed.started()) == 1
    assert feed.transitions() == ((SeriesStatus.AWAITING_APPROVAL, SeriesStatus.CANCELLED),)
    assert feed.progress() == ()


def announced(feed: RecordingFeed, status: SeriesStatus) -> bool:
    return any(current is status for _, current in feed.transitions())


async def answered_look(harness: SeriesHarness, feed: RecordingFeed) -> SeriesGetResult:
    look = LookTarget(flow_id=FlowId("review"), dataset_id=DatasetId("review_cases"), case_names=REVIEW_CASES)
    started = await harness.service.start(SeriesStartRequest(look=look), AGENT)
    await reached(harness.service, started.series_id, SeriesStatus.WAITING_HUMAN)
    await wait_until(lambda: announced(feed, SeriesStatus.WAITING_HUMAN), NOTICE_SECONDS)
    rows = await harness.service.cases(started.series_id, SeriesCasesQuery())
    run_id = rows[0].attempts[0].run_id
    facade = DbosEngineFacade(runtime=harness.runtime)
    wait = (await facade.waits(run_id))[0]
    request = ResumeRequest(
        address=wait.address, attempt=wait.attempt, payload={"label": "ok"}, client_op_id=new_client_op_id()
    )
    await facade.resume(run_id, request)
    return await settled(harness.service, started.series_id)


def test_a_human_wait_is_announced_as_waiting_human_and_the_answer_as_running_again(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    feed = RecordingFeed()

    with series_engine(root, ScriptedModels(), feed=feed) as harness:
        done = asyncio.run(answered_look(harness, feed))

    assert done.series.status is SeriesStatus.DONE
    assert feed.started()[0].series.experiment_id is None
    assert feed.transitions() == (
        (SeriesStatus.RUNNING, SeriesStatus.WAITING_HUMAN),
        (SeriesStatus.WAITING_HUMAN, SeriesStatus.RUNNING),
        (SeriesStatus.RUNNING, SeriesStatus.DONE),
    )
    assert [notice.done for notice in feed.progress()] == [1]
