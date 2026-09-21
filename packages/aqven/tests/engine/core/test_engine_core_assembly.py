import asyncio
from pathlib import Path
from typing import Final

import pytest
from engine_core_harness import TRACE_ENV, launched_facade, trace_lines
from engine_core_plan import relay_project

from aqven.engine import DbosEngineFacade, RunOverrides, RunRecord, RunSpec
from aqven.engine.assembly import StandardExtensions
from aqven.engine.forking import root_run_id
from aqven.ports.engine import EventLogQuery
from aqven.runtime import ForkRequest, NodeFinished, RunEvent, RunSnapshot, node_address
from aqven.runtime.address import JsonObject, RunId
from aqven.spec import FlowId

LOW: Final[JsonObject] = {"text": "  hello   world ", "priority": "low"}
LEFT: Final = node_address("fan__left", branch_key="left")


async def forked_fan(
    facade: DbosEngineFacade,
) -> tuple[RunId, RunRecord, RunRecord, RunSnapshot, tuple[RunEvent, ...]]:
    started = await facade.launch(relay_project(), RunSpec(flow_id=FlowId("fan")), LOW, RunOverrides())
    original = await facade.result(started.run_id)
    forked = await facade.fork(started.run_id, ForkRequest(from_=LEFT))
    record = await facade.result(forked.run_id)
    snapshot = await facade.get_run(forked.run_id)
    events = (await facade.event_log(forked.run_id, EventLogQuery(limit=200))).items
    return started.run_id, original, record, snapshot, events


def test_fork_inside_a_parallel_branch_reruns_only_that_branch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    trace = tmp_path / "trace.txt"
    monkeypatch.setenv(TRACE_ENV, str(trace))

    with launched_facade(tmp_path / "state", extensions=StandardExtensions()) as facade:
        parent, original, record, snapshot, events = asyncio.run(forked_fan(facade))

    finished = [event.address for event in events if isinstance(event, NodeFinished)]
    assert original.output == record.output == {"text": "HELLO WORLD."}
    assert snapshot.lineage is not None and snapshot.lineage.parent_run_id == parent
    assert sorted(trace_lines(trace)) == sorted(["normalize", "shout", "finalize", "finalize", "shout", "finalize"])
    assert LEFT in finished
    assert finished[-1].node_id == "after"
    assert {event.run_id for event in events} == {snapshot.run_id}


def test_branch_workflow_ids_resolve_to_their_root_run() -> None:
    assert root_run_id('run-1::{"node_id":"a"}::{"node_id":"b"}') == "run-1"
    assert root_run_id("run-2") == "run-2"
