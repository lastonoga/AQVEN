import asyncio
import os
import signal
import subprocess
import sys
import time
from collections.abc import Callable, Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Final

import pytest
from dbos import DBOSClient, WorkflowStatusString
from engine_core_harness import (
    GATE_ENV,
    RELAY_TOKEN,
    TRACE_ENV,
    StampService,
    StaticPlanSource,
    launched_facade,
    trace_lines,
)
from engine_core_plan import FIXTURE_ROOT, ref, relay_project
from pydantic import JsonValue

from aqven.engine import (
    DbosEngineFacade,
    EnginePaths,
    RunOverrides,
    RunRecord,
    RunSpec,
    child_workflow_id,
    dbos_config,
)
from aqven.engine.blobs import FileBlobStore
from aqven.ports.engine import EngineError, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime import (
    CancelRequest,
    ForkRequest,
    NodeFinished,
    RunEvent,
    RunFinished,
    RunSnapshot,
    RunStartRequest,
    RunSummary,
    node_address,
)
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId
from aqven.runtime.replay import McpToolStub
from aqven.spec import FlowId, McpServerId, NodeId, RunContextKey

WORKER: Final = Path(__file__).parent / "engine_core_worker.py"
RESULT_PREFIX: Final = "RESULT "
HIGH: Final[JsonObject] = {"text": "  hello   world ", "priority": "high"}
LOW: Final[JsonObject] = {"text": "  hello   world ", "priority": "low"}
WAIT_SECONDS: Final = 60.0
FAST_BRANCH: Final = node_address("fan__fast", branch_key="fast")


def spec(flow_id: str) -> RunSpec:
    return RunSpec(flow_id=FlowId(flow_id), mode="replay")


async def launch(
    facade: DbosEngineFacade, flow_id: str, flow_input: JsonObject, service: StampService | None = None
) -> RunId:
    overrides = RunOverrides(tool_http=service.transport() if service is not None else None)
    started = await facade.launch(relay_project(), spec(flow_id), flow_input, overrides)
    return started.run_id


def finished_output(events: tuple[RunEvent, ...], node_id: str) -> JsonValue:
    finished = [event for event in events if isinstance(event, NodeFinished) and event.address.node_id == node_id]
    assert finished and finished[-1].output_ref is not None
    return finished[-1].output_ref.model_dump(mode="json")["value"]


@pytest.fixture
def trace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    location = tmp_path / "trace.txt"
    monkeypatch.setenv(TRACE_ENV, str(location))
    return location


def test_relay_runs_code_switch_and_tool_in_order(tmp_path: Path, trace: Path) -> None:
    service = StampService()

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, RunRecord, RunSnapshot, tuple[RunEvent, ...]]:
        high = await launch(facade, "relay", HIGH, service)
        high_record = await facade.result(high)
        low = await launch(facade, "relay", LOW, service)
        low_record = await facade.result(low)
        snapshot = await facade.get_run(high)
        events = (await facade.event_log(high, EventLogQuery(limit=200))).items
        return high_record, low_record, snapshot, events

    with launched_facade(tmp_path / "state") as facade:
        high_record, low_record, snapshot, events = asyncio.run(scenario(facade))

    stamped = finished_output(events, "stamp")
    assert high_record.status == "completed"
    assert high_record.output == {"text": "HELLO WORLD!."}
    assert low_record.output == {"text": "hello world!."}
    assert trace_lines(trace) == ["normalize", "shout", "stamp", "finalize", "normalize", "stamp", "finalize"]
    assert isinstance(stamped, dict)
    assert str(stamped["key"]).startswith("sha256-")
    assert stamped["token_tail"] == RELAY_TOKEN[-2:]
    assert FileBlobStore(tmp_path / "state" / "blobs").exists(str(stamped["blob_id"]))
    assert [request.url.host for request in service.requests] == ["stamp.example", "stamp.example"]
    assert snapshot.status == "completed"
    assert snapshot.node_counts.ok == 5
    assert node_address("route__loud", branch_key="high") in [execution.address for execution in snapshot.executions]


def test_call_node_runs_subflow_and_narrow_checks_output(tmp_path: Path, trace: Path) -> None:
    service = StampService()

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, tuple[RunEvent, ...]]:
        run_id = await launch(facade, "outer", LOW, service)
        record = await facade.result(run_id)
        return record, (await facade.event_log(run_id, EventLogQuery(limit=200))).items

    with launched_facade(tmp_path / "state") as facade:
        record, events = asyncio.run(scenario(facade))

    addresses = [event.address.node_id for event in events if isinstance(event, NodeFinished)]
    assert record.output == {"text": "hello world!."}
    assert addresses == ["inner__normalize", "inner__route", "inner__stamp", "inner__finish", "inner", "check"]


def test_failures_finish_the_run_with_typed_errors(tmp_path: Path, trace: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, RunRecord, tuple[RunEvent, ...]]:
        broken = await launch(facade, "broken", LOW)
        missing = await launch(facade, "thinking", LOW)
        broken_record = await facade.result(broken)
        missing_record = await facade.result(missing)
        return broken_record, missing_record, (await facade.event_log(broken, EventLogQuery(limit=200))).items

    with launched_facade(tmp_path / "state") as facade:
        broken, missing, events = asyncio.run(scenario(facade))

    assert broken.status == "failed" and broken.error is not None
    assert broken.error.code == "NODE_ERROR" and "ValueError" in broken.error.message
    assert missing.error is not None and missing.error.code == "EXECUTOR_MISSING"
    assert isinstance(events[-1], RunFinished) and events[-1].status == "failed"
    assert "never" not in {event.address.node_id for event in events if isinstance(event, NodeFinished)}
    assert trace_lines(trace) == ["normalize"]


def test_events_resume_after_seq_without_gaps(tmp_path: Path, trace: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[tuple[RunEvent, ...], list[RunEvent], tuple[RunEvent, ...]]:
        run_id = await launch(facade, "relay", LOW, StampService())
        await facade.result(run_id)
        full = (await facade.event_log(run_id, EventLogQuery(limit=200))).items
        tail = [event async for event in facade.run_events(run_id, after_seq=3)]
        page = (await facade.event_log(run_id, EventLogQuery(after_seq=len(full) - 2, limit=1))).items
        return full, tail, page

    with launched_facade(tmp_path / "state") as facade:
        full, tail, page = asyncio.run(scenario(facade))

    assert [event.seq for event in full] == list(range(1, len(full) + 1))
    assert full[0].type == "run_started" and isinstance(full[-1], RunFinished)
    assert [event.seq for event in tail] == list(range(4, len(full) + 1))
    assert [event.model_dump() for event in tail] == [event.model_dump() for event in full[3:]]
    assert [event.seq for event in page] == [len(full) - 1]


def test_fork_from_node_reuses_earlier_steps(tmp_path: Path, trace: Path) -> None:
    service = StampService()

    async def scenario(facade: DbosEngineFacade) -> tuple[RunId, RunSnapshot, RunRecord, tuple[RunEvent, ...]]:
        run_id = await launch(facade, "relay", LOW, service)
        await facade.result(run_id)
        forked = await facade.fork(run_id, ForkRequest(from_=node_address("stamp")))
        record = await facade.result(forked.run_id)
        snapshot = await facade.get_run(forked.run_id)
        return run_id, snapshot, record, (await facade.event_log(forked.run_id, EventLogQuery(limit=200))).items

    with launched_facade(tmp_path / "state") as facade:
        original, snapshot, record, events = asyncio.run(scenario(facade))

    assert record.output == {"text": "hello world!."}
    assert trace_lines(trace) == ["normalize", "stamp", "finalize", "stamp", "finalize"]
    assert snapshot.lineage is not None and snapshot.lineage.parent_run_id == original
    assert [event.seq for event in events] == list(range(1, len(events) + 1))
    assert events[0].type == "run_started" and isinstance(events[-1], RunFinished)
    assert len(service.requests) == 2


def test_cancel_marks_run_and_closes_event_stream(tmp_path: Path, trace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    gate = tmp_path / "gate"
    monkeypatch.setenv(GATE_ENV, str(gate))

    async def scenario(facade: DbosEngineFacade) -> tuple[str, RunRecord, RunSnapshot, str]:
        run_id = await launch(facade, "gated", LOW)
        await wait_for(lambda: "gate_started" in trace_lines(trace))
        cancelled = await facade.cancel(run_id, CancelRequest(reason="test"))
        gate.touch()
        record = await facade.result(run_id)
        snapshot = await facade.get_run(run_id)
        done = await launch(facade, "relay", LOW, StampService())
        await facade.result(done)
        with pytest.raises(EngineError) as conflict:
            await facade.cancel(done, CancelRequest(reason="too late"))
        return cancelled.status, record, snapshot, conflict.value.code

    with launched_facade(tmp_path / "state") as facade:
        cancelled, record, snapshot, conflict = asyncio.run(scenario(facade))

    assert (cancelled, record.status, snapshot.status, conflict) == (
        "cancelled",
        "cancelled",
        "cancelled",
        "RUN_STATE_CONFLICT",
    )


def test_start_run_validates_input_and_lists_runs(tmp_path: Path, trace: Path) -> None:
    source = StaticPlanSource(relay_project())

    async def scenario(facade: DbosEngineFacade) -> tuple[str, tuple[str, ...], str, int, int]:
        with pytest.raises(EngineError) as invalid:
            await facade.start_run(RunStartRequest(flow_id=FlowId("relay"), mode="replay", input={"text": "x"}))
        with pytest.raises(EngineError) as unknown:
            await facade.start_run(RunStartRequest(flow_id=FlowId("nope"), mode="replay", input=LOW))
        started = await facade.start_run(RunStartRequest(flow_id=FlowId("broken"), mode="replay", input=LOW))
        await facade.result(started.run_id)
        listed = len((await facade.list_runs(RunListQuery(flow_id=FlowId("broken")))).items)
        executions = await facade.list_executions(started.run_id, ExecutionQuery(status="ok"))
        paths = tuple(".".join(str(part) for part in problem.path) for problem in invalid.value.problems)
        return invalid.value.code, paths, unknown.value.code, listed, len(executions)

    with launched_facade(tmp_path / "state", source) as facade:
        invalid, paths, unknown, listed, ok_executions = asyncio.run(scenario(facade))

    assert (invalid, paths, unknown, listed, ok_executions) == ("INPUT_INVALID", ("input.priority",), "NOT_FOUND", 1, 1)


def test_selected_run_executes_dependencies_and_returns_selected_outputs(tmp_path: Path, trace: Path) -> None:
    source = StaticPlanSource(relay_project())

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, RunSnapshot, RunSummary]:
        started = await facade.launch(
            relay_project(),
            RunSpec(
                flow_id=FlowId("relay"),
                mode="replay",
                dataset_item_id="support_case_cases/bulb_app_offline_advice",
                selected_nodes=(NodeId("route"),),
            ),
            LOW,
            RunOverrides(),
        )
        record = await facade.result(started.run_id)
        snapshot = await facade.get_run(started.run_id)
        listed = await facade.list_runs(RunListQuery(flow_id=FlowId("relay")))
        return record, snapshot, listed.items[0]

    with launched_facade(tmp_path / "state", source) as facade:
        record, snapshot, summary = asyncio.run(scenario(facade))

    assert record.status == "completed"
    assert isinstance(record.output, dict) and set(record.output) == {"route"}
    assert snapshot.order == ("normalize", "route")
    assert snapshot.selected_nodes == ("route",)
    assert summary.dataset_item_id == "support_case_cases/bulb_app_offline_advice"
    assert summary.selected_nodes == ("route",)
    assert trace_lines(trace) == ["normalize"]


def test_dataset_range_runs_middle_node_from_fixture_without_upstream_execution(tmp_path: Path, trace: Path) -> None:
    source = StaticPlanSource(relay_project())

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, RunSnapshot]:
        started = await facade.start_run(
            RunStartRequest(
                flow_id=FlowId("relay"),
                mode="replay",
                input={"priority": "low"},
                start_node=NodeId("route"),
                end_node=NodeId("route"),
                node_outputs={NodeId("normalize"): {"text": "prepared"}},
            )
        )
        return await facade.result(started.run_id), await facade.get_run(started.run_id)

    with launched_facade(tmp_path / "state", source) as facade:
        record, snapshot = asyncio.run(scenario(facade))

    assert record.status == "completed"
    assert record.output == {"route": {"text": "prepared"}}
    assert snapshot.order == ("route",)
    assert (snapshot.start_node, snapshot.end_node) == ("route", "route")
    assert snapshot.node_outputs == {"normalize": {"text": "prepared"}}
    assert trace_lines(trace) == []


def test_range_uses_a_nested_output_fixture_from_an_earlier_stage(tmp_path: Path, trace: Path) -> None:
    plan = relay_project()
    flow = plan.flow(FlowId("relay"))
    finish = flow.node(NodeId("finish")).model_copy(update={"inputs": (ref("text", "$route__loud.out.text"),)})
    flow = flow.model_copy(update={"nodes": {**flow.nodes, NodeId("finish"): finish}})
    plan = plan.model_copy(update={"flows": {**plan.flows, FlowId("relay"): flow}})

    async def scenario(facade: DbosEngineFacade) -> RunRecord:
        started = await facade.start_run(
            RunStartRequest(
                flow_id=FlowId("relay"),
                mode="replay",
                input={},
                start_node=NodeId("finish"),
                end_node=NodeId("finish"),
                node_outputs={NodeId("route__loud"): {"text": "prepared"}},
            )
        )
        return await facade.result(started.run_id)

    with launched_facade(tmp_path / "state", StaticPlanSource(plan)) as facade:
        record = asyncio.run(scenario(facade))

    assert record.status == "completed"
    assert record.output == {"finish": {"text": "prepared."}}
    assert trace_lines(trace) == ["finalize"]


def test_dataset_range_rejects_missing_boundary_fixture(tmp_path: Path) -> None:
    source = StaticPlanSource(relay_project())

    async def scenario(facade: DbosEngineFacade) -> EngineError:
        with pytest.raises(EngineError) as error:
            await facade.start_run(
                RunStartRequest(
                    flow_id=FlowId("relay"),
                    mode="replay",
                    input={"priority": "low"},
                    start_node=NodeId("route"),
                    end_node=NodeId("route"),
                )
            )
        return error.value

    with launched_facade(tmp_path / "state", source) as facade:
        error = asyncio.run(scenario(facade))

    assert error.code == "INPUT_INVALID"
    assert "$normalize.out.text" in str(error)


def test_dataset_range_needs_only_context_referenced_inside_the_range(tmp_path: Path) -> None:
    plan = relay_project()
    relay = plan.flow(FlowId("relay")).model_copy(update={"context": (RunContextKey.DATE,)})
    plan = plan.model_copy(update={"flows": {**plan.flows, FlowId("relay"): relay}})

    async def scenario(facade: DbosEngineFacade) -> RunRecord:
        started = await facade.start_run(
            RunStartRequest(
                flow_id=FlowId("relay"),
                mode="replay",
                input={"priority": "low"},
                start_node=NodeId("route"),
                end_node=NodeId("route"),
                node_outputs={NodeId("normalize"): {"text": "prepared"}},
            )
        )
        return await facade.result(started.run_id)

    with launched_facade(tmp_path / "state", StaticPlanSource(plan)) as facade:
        record = asyncio.run(scenario(facade))

    assert record.status == "completed"


@contextmanager
def dbos_client(state: Path) -> Generator[DBOSClient]:
    config = dbos_config(EnginePaths(FIXTURE_ROOT, state))
    client = DBOSClient(system_database_url=config.get("system_database_url"))
    try:
        yield client
    finally:
        client.destroy()


def written_run_id(run_file: Path) -> str:
    return run_file.read_text(encoding="utf-8") if run_file.exists() else ""


def branch_succeeded(client: DBOSClient, run_id: str, branch: ExecutionAddress) -> bool:
    statuses = client.list_workflows(
        workflow_ids=[child_workflow_id(run_id, branch)],
        status=WorkflowStatusString.SUCCESS.value,
        load_input=False,
        load_output=False,
    )
    return bool(statuses)


def wait_branches_checkpointed(state: Path, run_id: str, branches: tuple[ExecutionAddress, ...]) -> None:
    if not branches:
        return
    with dbos_client(state) as client:
        wait_until(lambda: all(branch_succeeded(client, run_id, branch) for branch in branches))


def crash_and_recover(
    tmp_path: Path, flow_id: str, finished_branches: tuple[ExecutionAddress, ...] = ()
) -> tuple[str, list[str]]:
    trace = tmp_path / "trace.txt"
    run_file = tmp_path / "run_id"
    state = tmp_path / "state"
    environment = {**os.environ, TRACE_ENV: str(trace), GATE_ENV: str(tmp_path / "gate")}
    arguments = [str(state), str(run_file), flow_id]
    starter = subprocess.Popen([sys.executable, str(WORKER), "start", *arguments], env=environment)
    try:
        wait_until(lambda: "gate_started" in trace_lines(trace) and bool(written_run_id(run_file)))
        wait_branches_checkpointed(state, written_run_id(run_file), finished_branches)
    finally:
        os.kill(starter.pid, signal.SIGKILL)
        starter.wait(timeout=WAIT_SECONDS)
    recovered = subprocess.run(
        [sys.executable, str(WORKER), "recover", *arguments],
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    report = next(line for line in recovered.stdout.splitlines() if line.startswith(RESULT_PREFIX))
    return report, trace_lines(trace)


def test_sigkill_during_step_recovers_run_in_new_process(tmp_path: Path) -> None:
    report, lines = crash_and_recover(tmp_path, "gated")
    assert '"status": "completed"' in report and '"text": "[TICK]."' in report
    assert lines == ["shout", "gate_started", "gate_started", "gate_done", "finalize"]


def test_sigkill_inside_parallel_branch_recovers_only_that_branch(tmp_path: Path) -> None:
    report, lines = crash_and_recover(tmp_path, "gated_fan", finished_branches=(FAST_BRANCH,))
    assert '"status": "completed"' in report and '"text": "[tick]."' in report
    assert sorted(lines) == sorted(["normalize", "shout", "gate_started", "gate_started", "gate_done", "finalize"])
    assert lines.index("gate_done") < lines.index("finalize")


def wait_until(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while not condition():
        assert time.monotonic() < deadline
        time.sleep(0.05)


async def wait_for(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while not condition():
        assert time.monotonic() < deadline
        await asyncio.sleep(0.05)


def test_replay_tools_use_mcp_stubs_and_poll_long_jobs(tmp_path: Path, trace: Path) -> None:
    stub = McpToolStub(server=McpServerId("desk"), tool="find", result={"text": "from stub"})

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, RunRecord, RunRecord]:
        stubbed_spec = RunSpec(flow_id=FlowId("lookup"), mode="replay", mcp_stubs=(stub,))
        stubbed = await facade.launch(relay_project(), stubbed_spec, LOW, RunOverrides())
        unstubbed = await launch(facade, "lookup", LOW)
        rendered = await launch(facade, "render", {"text": "logo", "priority": "low"})
        return await facade.result(stubbed.run_id), await facade.result(unstubbed), await facade.result(rendered)

    with launched_facade(tmp_path / "state") as facade:
        stubbed, unstubbed, rendered = asyncio.run(scenario(facade))

    assert stubbed.output == {"text": "from stub"}
    assert unstubbed.error is not None and unstubbed.error.code == "TOOL_REPLAY_MISS"
    assert rendered.output == {"text": "job-logo"}
    assert trace_lines(trace) == ["render_started"]


def test_events_follow_a_live_run_until_it_finishes(
    tmp_path: Path, trace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = tmp_path / "gate"
    monkeypatch.setenv(GATE_ENV, str(gate))

    async def scenario(facade: DbosEngineFacade) -> tuple[list[RunEvent], RunSnapshot]:
        run_id = await launch(facade, "gated", LOW)
        await wait_for(lambda: "gate_started" in trace_lines(trace))
        running = await facade.get_run(run_id)
        follower = asyncio.create_task(collect(facade, run_id))
        await asyncio.sleep(0.2)
        gate.touch()
        return await asyncio.wait_for(follower, WAIT_SECONDS), running

    with launched_facade(tmp_path / "state") as facade:
        events, running = asyncio.run(scenario(facade))

    assert running.status == "running" and running.node_counts.running == 1
    assert [event.seq for event in events] == list(range(1, len(events) + 1))
    assert isinstance(events[-1], RunFinished) and events[-1].status == "completed"


async def collect(facade: DbosEngineFacade, run_id: RunId) -> list[RunEvent]:
    return [event async for event in facade.run_events(run_id)]
