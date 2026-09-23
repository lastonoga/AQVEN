import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Final

from series_fixture import write_project
from series_harness import (
    CHEAP_NAME,
    FINDING_PATH,
    WRITER_NAME,
    ScriptedLabels,
    ScriptedModels,
    SeriesHarness,
    series_engine,
    settled,
)

from aqven.engine import DbosEngineFacade
from aqven.ports.engine import RunListQuery
from aqven.runtime.address import ClientOpId
from aqven.series.model import AttemptRecord, CheckState, OutcomeClass, SeriesRecord, SeriesStatus
from aqven.series.views import LookTarget, SeriesListQuery, SeriesStarted, SeriesStartRequest
from aqven.spec import ArmId, DatasetId, ExperimentId, FlowId, SeriesSplit, VerdictReason, VerdictState
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
CLIENT_OP: Final = ClientOpId("01J8Z3K4M5N6P7Q8R9S0T1V2W3")


async def finished(
    harness: SeriesHarness, request: SeriesStartRequest
) -> tuple[SeriesRecord, tuple[AttemptRecord, ...]]:
    started = await harness.service.start(request, AGENT)
    await harness.service.approve(started.series_id, HUMAN)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return record, await harness.services.store.attempts(started.series_id)


async def unattended(
    harness: SeriesHarness, request: SeriesStartRequest
) -> tuple[SeriesStarted, SeriesRecord, tuple[AttemptRecord, ...]]:
    started = await harness.service.start(request, AGENT)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return started, record, await harness.services.store.attempts(started.series_id)


def check_states(attempts: tuple[AttemptRecord, ...]) -> dict[str, list[CheckState]]:
    return {attempt.case_name: [check.state for check in attempt.checks] for attempt in attempts}


def test_a_range_series_runs_from_the_recorded_node_outputs(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        started, record, attempts = asyncio.run(
            unattended(harness, SeriesStartRequest(experiment_id=ExperimentId("triage_range")))
        )

    assert (started.status, started.estimate.usd_source, started.estimate.usd) == (
        SeriesStatus.RUNNING,
        "bound",
        Decimal(0),
    )
    assert record.status is SeriesStatus.DONE
    assert record.verdict is None
    assert [attempt.outcome for attempt in attempts] == [OutcomeClass.OK, OutcomeClass.OK]
    assert check_states(attempts) == {"range_1": [CheckState.PASSED], "range_4": [CheckState.FAILED]}
    assert [attempt.passed for attempt in attempts] == [True, False]
    assert all(attempt.models == {} for attempt in attempts)


type RunTags = set[tuple[FlowId, str | None, ExperimentId | None, ArmId | None]]


async def arm_runs(harness: SeriesHarness) -> tuple[SeriesRecord, tuple[AttemptRecord, ...], RunTags, RunTags]:
    record, attempts = await finished(harness, SeriesStartRequest(experiment_id=ExperimentId("triage_solo")))
    facade = DbosEngineFacade(runtime=harness.runtime)
    page = await facade.list_runs(RunListQuery(mode="experiment"))
    listed = {(row.flow_id, row.series_id, row.experiment_id, row.arm_id) for row in page.items}
    detail = await facade.get_run(attempts[0].run_id)
    return record, attempts, listed, {(detail.flow_id, detail.series_id, detail.experiment_id, detail.arm_id)}


def test_an_arm_series_runs_the_arm_flow_with_each_variant_agent(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        record, attempts, listed, detail = asyncio.run(arm_runs(harness))

    assert record.status is SeriesStatus.DONE
    assert record.flow_id is None
    assert len(attempts) == 8
    assert listed == detail == {("solo", record.series_id, "triage_solo", "solo")}
    assert {attempt.variant_id: attempt.models["answer"] for attempt in attempts} == {
        "writer": f"openai:{WRITER_NAME}",
        "cheap": f"openai:{CHEAP_NAME}",
    }


def test_a_holdout_series_publishes_its_finding(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    request = SeriesStartRequest(
        experiment_id=ExperimentId("triage_agents"), on=SeriesSplit.HOLDOUT, cases=2, repeats=1
    )

    with series_engine(root, ScriptedModels()) as harness:
        record, attempts = asyncio.run(finished(harness, request))
        published = list(harness.findings.published)

    assert record.on is SeriesSplit.HOLDOUT
    assert {attempt.split for attempt in attempts} == {SeriesSplit.HOLDOUT}
    assert record.verdict is not None and record.verdict.state is VerdictState.CONFIRMED
    assert record.finding_path == FINDING_PATH
    assert [item.series_id for item in published] == [record.series_id]
    assert published[0].status is SeriesStatus.DONE
    assert published[0].analysis is not None


async def edited_midway(harness: SeriesHarness, root: Path) -> SeriesRecord:
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_agents")), AGENT)
    code = root / "flows" / "triage" / "nodes" / "tidy" / "tidy.py"
    code.write_text(code.read_text(encoding="utf-8") + "\n\nTIDY_VERSION = 2\n", encoding="utf-8")
    await harness.service.approve(started.series_id, HUMAN)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return record


def test_code_changed_during_a_series_makes_it_invalid(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        record = asyncio.run(edited_midway(harness, root))
        changed = [source.inputs_changed for source in harness.analyst.inputs if source.status is SeriesStatus.DONE]

    assert changed == [True]
    assert record.verdict is not None
    assert (record.verdict.state, record.verdict.reason) == (VerdictState.INVALID, VerdictReason.INPUTS_CHANGED)


def test_a_series_whose_every_attempt_hit_an_infrastructure_error_fails(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        record, attempts = asyncio.run(
            finished(harness, SeriesStartRequest(experiment_id=ExperimentId("triage_broken")))
        )
        analysed = [source.status for source in harness.analyst.inputs]

    assert record.status is SeriesStatus.FAILED
    assert record.finished_at is not None
    assert SeriesStatus.FAILED in analysed
    assert SeriesStatus.DONE not in analysed
    assert record.verdict is None
    assert record.error is not None
    assert record.error.startswith("every attempt hit an infrastructure error (1 of 1); the first one: ")
    assert "the scorer broke" in record.error
    assert [attempt.outcome for attempt in attempts] == [OutcomeClass.INFRA_ERROR]
    assert attempts[0].error_message is not None and "the scorer broke" in attempts[0].error_message
    assert attempts[0].cost_usd > 0
    assert attempts[0].passed is None


async def started_twice(harness: SeriesHarness) -> tuple[str, str, int]:
    request = SeriesStartRequest(experiment_id=ExperimentId("triage_solo"), client_op_id=CLIENT_OP)
    first = await harness.service.start(request, AGENT)
    second = await harness.service.start(request, AGENT)
    page = await harness.service.list(SeriesListQuery(experiment_id=ExperimentId("triage_solo")))
    return first.series_id, second.series_id, len(page.items)


def test_the_same_client_op_id_returns_the_same_series(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        first, second, listed = asyncio.run(started_twice(harness))

    assert first == second == "91fb1e15-c48e-56df-adc0-f5152cf6a466"
    assert listed == 1


async def looked(harness: SeriesHarness) -> tuple[SeriesRecord, tuple[AttemptRecord, ...]]:
    look = LookTarget(
        flow_id=FlowId("triage"), dataset_id=DatasetId("triage_cases"), case_names=("never_1", "always_3")
    )
    return await finished(harness, SeriesStartRequest(look=look))


def test_an_implicit_look_scores_the_expected_output_of_named_cases(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    models = ScriptedModels(writer=ScriptedLabels(WRITER_NAME))

    with series_engine(root, models) as harness:
        record, attempts = asyncio.run(looked(harness))

    assert record.verdict is None
    assert record.on is SeriesSplit.DEV
    assert [(attempt.case_name, attempt.split) for attempt in attempts] == [
        ("never_1", SeriesSplit.DEV),
        ("always_3", SeriesSplit.HOLDOUT),
    ]
    assert check_states(attempts) == {"never_1": [CheckState.FAILED], "always_3": [CheckState.PASSED]}
