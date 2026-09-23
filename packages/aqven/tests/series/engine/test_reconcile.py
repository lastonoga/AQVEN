import asyncio
from datetime import timedelta
from pathlib import Path
from typing import Final, Literal

from dbos import WorkflowStatus
from series_fixture import write_project
from series_harness import ScriptedModels, SeriesHarness, series_engine
from series_records import NOW, cases, record

from aqven.series.jobs import UNSTARTED_MESSAGE, reconciliation
from aqven.series.model import SeriesId, SeriesStatus
from aqven.series.views import SeriesGetRequest, SeriesGetResult

UNSTARTED_ID: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2d"

type DbosStatus = Literal["ERROR", "MAX_RECOVERY_ATTEMPTS_EXCEEDED", "CANCELLED", "PENDING"]


def workflow_status(status: DbosStatus, error: Exception | None = None) -> WorkflowStatus:
    found = WorkflowStatus()
    found.status = status
    found.error = error
    return found


def test_a_failed_workflow_fails_the_series_with_its_error() -> None:
    change = reconciliation(record("a", NOW), workflow_status("ERROR", RuntimeError("boom")), NOW)

    assert change is not None
    assert (change.status, change.error, change.finished_at) == (SeriesStatus.FAILED, "boom", NOW)


def test_exhausted_recovery_also_fails_the_series() -> None:
    change = reconciliation(record("a", NOW), workflow_status("MAX_RECOVERY_ATTEMPTS_EXCEEDED"), NOW)

    assert change is not None and change.status is SeriesStatus.FAILED


def test_a_cancelled_workflow_cancels_the_series() -> None:
    change = reconciliation(record("a", NOW), workflow_status("CANCELLED"), NOW)

    assert change is not None and change.status is SeriesStatus.CANCELLED


def test_a_running_workflow_changes_nothing() -> None:
    assert reconciliation(record("a", NOW), workflow_status("PENDING"), NOW) is None


def test_a_missing_workflow_fails_only_after_the_grace_period() -> None:
    fresh = reconciliation(record("a", NOW), None, NOW + timedelta(seconds=10))
    stale = reconciliation(record("a", NOW), None, NOW + timedelta(seconds=61))

    assert fresh is None
    assert stale is not None
    assert (stale.status, stale.error) == (SeriesStatus.FAILED, UNSTARTED_MESSAGE)


async def read_unstarted(harness: SeriesHarness) -> SeriesGetResult:
    old = record(UNSTARTED_ID, NOW - timedelta(days=1)).model_copy(update={"status": SeriesStatus.RUNNING})
    await harness.services.store.create(old, cases())
    return await harness.service.get(SeriesGetRequest(series_id=SeriesId(UNSTARTED_ID)))


def test_reading_a_series_whose_workflow_never_started_writes_the_failure(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        result = asyncio.run(read_unstarted(harness))
        stored = asyncio.run(harness.services.store.series(SeriesId(UNSTARTED_ID)))

    assert result.series.status is SeriesStatus.FAILED
    assert result.series.error == UNSTARTED_MESSAGE
    assert stored is not None and stored.status is SeriesStatus.FAILED
