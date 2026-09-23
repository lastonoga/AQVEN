import asyncio
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Final

import pytest
from dbos import DBOS
from engine_core_harness import GATE_ENV, TRACE_ENV, launched_facade, trace_lines
from engine_core_plan import relay_project

from aqven.engine import (
    DbosEngineFacade,
    RunOverrides,
    RunRecord,
    RunSpec,
    SeriesTag,
    settled_record,
    start_run_workflow,
)
from aqven.ports.engine import RunListQuery
from aqven.runtime.address import JsonObject, RunId
from aqven.spec import FlowId

GATED: Final = FlowId("gated")
TEXT: Final[JsonObject] = {"text": "lamp"}
WAIT_SECONDS: Final = 60.0
SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"


def tagged_spec() -> RunSpec:
    tag = SeriesTag(series_id=SERIES, attempt_id="a", role="subject", variant_id="gpt", case_name="lamp", repeat=1)
    return RunSpec(flow_id=GATED, mode="experiment", series=tag, output_deltas=False)


async def wait_for(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while not condition():
        assert time.monotonic() < deadline
        await asyncio.sleep(0.05)


@pytest.fixture
def trace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    location = tmp_path / "trace.txt"
    monkeypatch.setenv(TRACE_ENV, str(location))
    return location


@pytest.fixture
def gate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    location = tmp_path / "gate"
    monkeypatch.setenv(GATE_ENV, str(location))
    return location


def test_the_same_run_id_returns_the_same_run(tmp_path: Path, trace: Path, gate: Path) -> None:
    gate.touch()

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, RunRecord, str, str]:
        ir_hash = facade.runtime.plans.register(relay_project())
        run_id = RunId(str(uuid.uuid7()))
        first = await start_run_workflow(run_id, ir_hash, TEXT, tagged_spec())
        record = await settled_record(first)
        again = await start_run_workflow(run_id, ir_hash, TEXT, tagged_spec())
        return record, await settled_record(again), first.get_workflow_id(), again.get_workflow_id()

    with launched_facade(tmp_path / "state") as facade:
        record, repeated, first_id, again_id = asyncio.run(scenario(facade))

    assert (record.status, record.output) == ("completed", {"text": "[LAMP]."})
    assert repeated == record
    assert first_id == again_id
    assert trace_lines(trace).count("shout") == 1


def test_a_cancelled_run_settles_as_cancelled(tmp_path: Path, trace: Path, gate: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> RunRecord:
        ir_hash = facade.runtime.plans.register(relay_project())
        run_id = RunId(str(uuid.uuid7()))
        handle = await start_run_workflow(run_id, ir_hash, TEXT, tagged_spec())
        await wait_for(lambda: "gate_started" in trace_lines(trace))
        await DBOS.cancel_workflow_async(run_id)
        gate.touch()
        return await settled_record(handle)

    with launched_facade(tmp_path / "state") as facade:
        record = asyncio.run(scenario(facade))

    assert (record.status, record.error) == ("cancelled", None)


def test_series_runs_stay_out_of_the_default_run_list(tmp_path: Path, trace: Path, gate: Path) -> None:
    gate.touch()

    async def scenario(facade: DbosEngineFacade) -> tuple[list[str | None], list[str | None], list[str | None]]:
        plan = relay_project()
        for spec in (tagged_spec(), RunSpec(flow_id=GATED, mode="replay")):
            started = await facade.launch(plan, spec, TEXT, RunOverrides())
            await facade.result(started.run_id)
        default = await facade.list_runs(RunListQuery(flow_id=GATED))
        series = await facade.list_runs(RunListQuery(flow_id=GATED, mode="experiment"))
        replay = await facade.list_runs(RunListQuery(flow_id=GATED, mode="replay"))
        return (
            [row.series_id for row in default.items],
            [row.series_id for row in series.items],
            [row.series_id for row in replay.items],
        )

    with launched_facade(tmp_path / "state") as facade:
        default, series, replay = asyncio.run(scenario(facade))

    assert (default, series, replay) == ([None], [SERIES], [None])
