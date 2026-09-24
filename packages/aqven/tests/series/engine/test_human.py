import asyncio
from pathlib import Path
from typing import Final

from series_fixture import REVIEW_CASES, write_project
from series_harness import ScriptedModels, SeriesHarness, reached, series_engine, settled

from aqven.engine import DbosEngineFacade
from aqven.runtime.human import ResumeRequest
from aqven.series.model import AttemptOutcome, OutcomeClass, SeriesStatus
from aqven.series.views import LookTarget, SeriesCaseRow, SeriesCasesQuery, SeriesGetResult, SeriesStartRequest
from aqven.spec import DatasetId, FlowId
from aqven.testing.human import new_client_op_id
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")


async def answered(harness: SeriesHarness) -> tuple[SeriesGetResult, tuple[SeriesCaseRow, ...], SeriesGetResult]:
    look = LookTarget(flow_id=FlowId("review"), dataset_id=DatasetId("review_cases"), case_names=REVIEW_CASES)
    started = await harness.service.start(SeriesStartRequest(look=look), AGENT)
    waiting = await reached(harness.service, started.series_id, SeriesStatus.WAITING_HUMAN)
    rows = await harness.service.cases(started.series_id, SeriesCasesQuery())
    run_id = rows[0].attempts[0].run_id
    facade = DbosEngineFacade(runtime=harness.runtime)
    wait = (await facade.waits(run_id))[0]
    request = ResumeRequest(
        address=wait.address, attempt=wait.attempt, payload={"label": "ok"}, client_op_id=new_client_op_id()
    )
    await facade.resume(run_id, request)
    return waiting, rows, await settled(harness.service, started.series_id)


def test_a_human_wait_shows_on_the_series_and_the_answer_lets_it_finish(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        waiting, rows, done = asyncio.run(answered(harness))
        attempts = asyncio.run(harness.services.store.attempts(done.series.series_id))

    assert waiting.series.status is SeriesStatus.WAITING_HUMAN
    assert waiting.series.waits == 1
    assert [attempt.outcome for row in rows for attempt in row.attempts] == [AttemptOutcome.WAITING]
    assert done.series.status is SeriesStatus.DONE
    assert done.series.waits == 0
    assert [attempt.outcome for attempt in attempts] == [OutcomeClass.OK]
    assert [check.state.value for attempt in attempts for check in attempt.checks] == ["passed"]
