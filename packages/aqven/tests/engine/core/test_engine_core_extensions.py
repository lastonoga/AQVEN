import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from dbos import DBOS
from engine_core_harness import TRACE_ENV, GatherParallel, launched_facade, trace_lines
from engine_core_plan import relay_project

from aqven.engine import (
    DbosEngineFacade,
    EngineExtensions,
    RunOverrides,
    RunRecord,
    RunSpec,
    StepIsolated,
)
from aqven.engine.runtime import ToolServices
from aqven.ir import CompiledLlmNode
from aqven.ports.engine import EventLogQuery
from aqven.ports.execution import (
    ExecutionScope,
    NodeOutcome,
    NodeSucceeded,
    OutputPart,
)
from aqven.runtime import NodeFinished, RunEvent, RunFinished
from aqven.runtime.address import JsonObject, RunId
from aqven.runtime.events import NodeOutputDelta
from aqven.spec import FlowId

PIECES: Final = ('{"text": "', "streamed", " answer", " arrives", " in", " small", " pieces", '"}')
LOW: Final[JsonObject] = {"text": "  hello   world ", "priority": "low"}


@dataclass(frozen=True, slots=True)
class StreamingEcho:
    async def execute(self, node: CompiledLlmNode, scope: ExecutionScope) -> NodeOutcome:
        text = str(scope.bind(node.inputs)["text"])
        part = OutputPart(kind="output_json", index=0)
        for piece in PIECES:
            await scope.output.append(1, part, piece)
            await asyncio.sleep(0.02)
        return NodeSucceeded(output={"text": text.strip()})


def with_extensions(services: ToolServices) -> EngineExtensions:
    return EngineExtensions(llm=StepIsolated(StreamingEcho()), parallel=GatherParallel())


async def run_flow(facade: DbosEngineFacade, flow_id: str) -> tuple[RunId, RunRecord, tuple[RunEvent, ...]]:
    started = await facade.launch(relay_project(), RunSpec(flow_id=FlowId(flow_id)), LOW, RunOverrides())
    record = await facade.result(started.run_id)
    events = (await facade.event_log(started.run_id, EventLogQuery(limit=200))).items
    return started.run_id, record, events


def test_parallel_branches_run_as_child_workflows(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    trace = tmp_path / "trace.txt"
    monkeypatch.setenv(TRACE_ENV, str(trace))

    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, tuple[RunEvent, ...], list[str]]:
        run_id, record, events = await run_flow(facade, "fan")
        children = await DBOS.list_workflows_async(parent_workflow_id=run_id, load_input=False, load_output=False)
        return record, events, sorted(child.name for child in children)

    with launched_facade(tmp_path / "state", extensions=with_extensions) as facade:
        record, events, children = asyncio.run(scenario(facade))

    finished = [event.address for event in events if isinstance(event, NodeFinished)]
    assert record.output == {"text": "HELLO WORLD."}
    assert children == ["aqven.run_branch", "aqven.run_branch"]
    assert [address.node_id for address in finished] == ["first", "fan__left", "fan__right", "fan", "after"]
    assert {address.branch_key for address in finished if address.node_id.startswith("fan__")} == {"left", "right"}
    assert [event.seq for event in events] == list(range(1, len(events) + 1))
    assert sorted(trace_lines(trace)) == sorted(["normalize", "shout", "finalize", "finalize"])


def test_output_deltas_are_batched_into_the_run_stream(tmp_path: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[RunRecord, tuple[RunEvent, ...]]:
        _, record, events = await run_flow(facade, "thinking")
        return record, events

    with launched_facade(tmp_path / "state", extensions=with_extensions) as facade:
        record, events = asyncio.run(scenario(facade))

    deltas = [event for event in events if isinstance(event, NodeOutputDelta)]
    assert record.output == {"text": "hello   world"}
    assert "".join(delta.delta for delta in deltas) == "".join(PIECES)
    assert 1 <= len(deltas) < len(PIECES)
    assert deltas[-1].cumulative_length == len("".join(PIECES))
    assert [event.seq for event in events] == list(range(1, len(events) + 1))
    assert isinstance(events[-1], RunFinished) and events[-1].status == "completed"
