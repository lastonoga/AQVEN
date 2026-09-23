import asyncio
import time
from collections.abc import Callable, Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Final

import pytest
from engine_core_harness import GATE_ENV, TRACE_ENV, relay_settings, trace_lines
from engine_core_plan import FIXTURE_ROOT, code_node, flow, relay_project

from aqven.engine import DbosEngineFacade, EngineLifecycle, EngineSetup, RunOverrides, RunSpec
from aqven.engine.events import BatchedOutputSink, NullOutputSink
from aqven.engine.interpreter import output_sink
from aqven.ir import CompiledNode, CompiledProject
from aqven.ports.engine import EventLogQuery
from aqven.runtime import NodeFinished, RunEvent, node_address
from aqven.runtime.address import JsonObject, RunId
from aqven.spec import FlowId

TEXT: Final[JsonObject] = {"text": "lamp"}
HELD_SECONDS: Final = 0.4
WAIT_SECONDS: Final = 60.0


def quick_plan() -> CompiledProject:
    plan = relay_project()
    nodes: tuple[CompiledNode, ...] = (code_node("first", "shout", "$input.text"),)
    quick = flow("quick", nodes, ("first",), "$first.out.text")
    return plan.model_copy(update={"flows": {**plan.flows, quick.flow_id: quick}})


@contextmanager
def single_worker(state: Path) -> Generator[DbosEngineFacade]:
    setup = EngineSetup(settings=relay_settings(), environ={}, max_parallel=1)
    lifecycle = EngineLifecycle(root=FIXTURE_ROOT, setup=setup, state_dir=state)
    runtime = lifecycle.launch()
    try:
        yield DbosEngineFacade(runtime=runtime)
    finally:
        lifecycle.shutdown()


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


def finished_first(events: tuple[RunEvent, ...]) -> NodeFinished:
    (found,) = (event for event in events if isinstance(event, NodeFinished) and event.address.node_id == "first")
    return found


def test_a_node_queued_behind_the_worker_pool_reports_the_wait_apart_from_its_work(
    tmp_path: Path, trace: Path, gate: Path
) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[RunEvent, ...]:
        plan = quick_plan()
        holder = await facade.launch(plan, RunSpec(flow_id=FlowId("gated")), TEXT, RunOverrides())
        await wait_for(lambda: "gate_started" in trace_lines(trace))
        queued = await facade.launch(plan, RunSpec(flow_id=FlowId("quick")), TEXT, RunOverrides())
        await asyncio.sleep(HELD_SECONDS)
        gate.touch()
        await facade.result(holder.run_id)
        await facade.result(queued.run_id)
        return (await facade.event_log(queued.run_id, EventLogQuery(limit=50))).items

    with single_worker(tmp_path / "state") as facade:
        events = asyncio.run(scenario(facade))

    first = finished_first(events)
    assert first.wait_ms >= HELD_SECONDS * 1000 * 0.5
    assert first.wait_ms <= first.latency_ms
    assert first.latency_ms - first.wait_ms < first.wait_ms


def test_attempt_runs_without_output_deltas_write_to_a_null_sink() -> None:
    address = node_address("first")
    quiet = RunSpec(flow_id=FlowId("quick"), output_deltas=False)
    loud = RunSpec(flow_id=FlowId("quick"))

    assert isinstance(output_sink(quiet, RunId("run-1"), address), NullOutputSink)
    assert isinstance(output_sink(loud, RunId("run-1"), address), BatchedOutputSink)
