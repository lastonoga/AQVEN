import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Final

from series_fixture import DEV_CASES, write_project
from series_harness import CHEAP_NAME, WRITER_NAME, ScriptedModels, SeriesHarness, series_engine, settled

from aqven.engine import DbosEngineFacade
from aqven.runtime.runs import RunSnapshot
from aqven.series.analysis import ScipySeriesAnalyst
from aqven.series.events import SeriesEventLog
from aqven.series.model import (
    AttemptRecord,
    AttemptState,
    CheckState,
    OutcomeClass,
    SeriesStatus,
    StopCause,
)
from aqven.series.views import (
    AttemptFinishedEvent,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesGetResult,
    SeriesStartRequest,
    SeriesStatusEvent,
)
from aqven.spec import ExperimentId, VariantId, VerdictReason, VerdictState
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
EXPERIMENT: Final = ExperimentId("triage_agents")
VARIANTS: Final = (VariantId("writer"), VariantId("cheap"))
REPEATS: Final = 3


async def run_agents_series(
    harness: SeriesHarness,
) -> tuple[SeriesGetResult, tuple[AttemptRecord, ...], tuple[SeriesEvent, ...]]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=EXPERIMENT), AGENT)
    assert started.status is SeriesStatus.RUNNING
    result = await settled(harness.service, started.series_id)
    attempts = await harness.services.store.attempts(started.series_id)
    events = await SeriesEventLog().snapshot(started.series_id)
    return result, attempts, events


def test_a_series_runs_every_attempt_round_robin_with_actual_models_and_spend(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    models = ScriptedModels()

    with series_engine(root, models) as harness:
        result, attempts, _ = asyncio.run(run_agents_series(harness))
        spend = asyncio.run(harness.services.store.spend(result.series.series_id))
        finals = [source for source in harness.analyst.inputs if source.status is SeriesStatus.DONE]

    expected_order = [
        (case, repeat, variant) for case in DEV_CASES for repeat in range(1, REPEATS + 1) for variant in VARIANTS
    ]
    assert result.series.status is SeriesStatus.DONE
    assert len(attempts) == len(expected_order) == 24
    assert [attempt.ordinal for attempt in attempts] == list(range(24))
    assert [(attempt.case_name, attempt.repeat, attempt.variant_id) for attempt in attempts] == expected_order
    assert all(attempt.state is AttemptState.FINISHED for attempt in attempts)
    assert all(attempt.outcome is OutcomeClass.OK for attempt in attempts)
    assert {attempt.variant_id: attempt.models["classify"] for attempt in attempts} == {
        "writer": f"openai:{WRITER_NAME}",
        "cheap": f"openai:{CHEAP_NAME}",
    }
    assert spend == sum((attempt.cost_usd + attempt.check_cost_usd for attempt in attempts), Decimal(0))
    assert all(attempt.cost_usd > 0 and attempt.check_cost_usd > 0 for attempt in attempts)
    assert result.series.spend.usd == spend
    assert result.series.progress.done == result.series.progress.total == 24
    assert result.series.verdict is not None
    assert (result.series.verdict.state, result.series.verdict.reason) == (VerdictState.SIGNAL, VerdictReason.DEV_SPLIT)
    assert [(source.stop, source.inputs_changed, source.case_names) for source in finals] == [
        (StopCause.COMPLETED, False, DEV_CASES)
    ]


def test_a_series_scores_always_never_and_flaky_cases(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        result, attempts, _ = asyncio.run(run_agents_series(harness))

    passes: dict[tuple[str, str], list[bool | None]] = {
        (case, variant): [
            attempt.passed for attempt in attempts if (attempt.case_name, attempt.variant_id) == (case, variant)
        ]
        for case in DEV_CASES
        for variant in VARIANTS
    }
    assert passes[("always_1", "writer")] == [True, True, True]
    assert passes[("never_1", "cheap")] == [False, False, False]
    assert sorted(passes[("sometimes_1", "writer")], key=bool) == [False, True, True]
    assert sorted(passes[("sometimes_1", "cheap")], key=bool) == [False, True, True]
    grades = {check.check_id: check for attempt in attempts for check in attempt.checks}
    assert grades["grade"].state is CheckState.PASSED
    assert grades["grade"].value == 0.8
    assert grades["grade"].judge_run_id is not None
    rows = {row.name: row for row in result.cases or ()}
    assert set(rows) == set(DEV_CASES)
    assert rows["sometimes_1"].failing and not rows["always_1"].failing
    assert result.hidden_cases == 0


def test_the_series_stream_carries_status_attempt_and_finish_events(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        _, attempts, events = asyncio.run(run_agents_series(harness))

    statuses = [event.status for event in events if isinstance(event, SeriesStatusEvent)]
    finished = [event for event in events if isinstance(event, AttemptFinishedEvent)]
    assert [event.seq for event in events] == list(range(1, len(events) + 1))
    assert statuses == []
    assert len(finished) == len(attempts)
    assert [event.done for event in finished] == list(range(1, len(attempts) + 1))
    assert finished[-1].spend_usd == sum(
        (attempt.cost_usd + attempt.check_cost_usd for attempt in attempts), Decimal(0)
    )
    assert isinstance(events[-1], SeriesFinishedEvent)
    assert events[-1].status is SeriesStatus.DONE


def test_the_scipy_analyst_finalizes_the_series_with_a_matrix_and_a_verdict(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels(), real=ScipySeriesAnalyst()) as harness:
        result, _, _ = asyncio.run(run_agents_series(harness))
        record = asyncio.run(harness.services.store.series(result.series.series_id))

    assert record is not None and record.analysis is not None
    assert record.verdict is not None
    assert (record.verdict.state, record.verdict.reason) == (VerdictState.SIGNAL, VerdictReason.DEV_SPLIT)
    assert [row.variant_id for row in record.analysis.matrix.rows] == ["writer", "cheap"]
    assert result.series.matrix == record.analysis.matrix


async def subject_and_judge_runs(harness: SeriesHarness) -> tuple[str, RunSnapshot, RunSnapshot]:
    result, attempts, _ = await run_agents_series(harness)
    facade = DbosEngineFacade(runtime=harness.runtime)
    judged = next(check.judge_run_id for check in attempts[0].checks if check.judge_run_id is not None)
    return result.series.series_id, await facade.get_run(attempts[0].run_id), await facade.get_run(judged)


def test_subject_and_judge_runs_name_their_series_and_experiment(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        series_id, subject, judge = asyncio.run(subject_and_judge_runs(harness))

    assert (subject.series_id, subject.experiment_id, subject.arm_id) == (series_id, EXPERIMENT, None)
    assert (judge.series_id, judge.experiment_id, judge.arm_id) == (series_id, EXPERIMENT, None)
    assert subject.flow_id == "triage"
