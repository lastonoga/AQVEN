import asyncio
import io
import json
from collections.abc import AsyncIterator, Generator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from contract_engine import FLOW_ID, RUN_ID, ScriptedEngine, completion_events, suspension_events
from contract_server import LiveServer, serving, shop_copy
from pydantic import BaseModel

from aqven.app.locations import ProjectState
from aqven.app.runtime_file import write_server_record
from aqven.console import run as run_module
from aqven.console.formats import EventFormat
from aqven.console.run import FlowRunRequest, run_flow
from aqven.console.run_watch import json_line, text_line
from aqven.engine.lifecycle import EngineSetup
from aqven.runtime import FlowHandle, RunContext, RunEvent, RunId, RunOptions

NOTE: Final = {"text": "the strip flickers"}
DEAD_PID: Final = 2**22 + 12345


@dataclass(slots=True)
class TailingEngine(ScriptedEngine):
    async def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        async for event in ScriptedEngine.run_events(self, run_id, after_seq):
            yield event
        await asyncio.Event().wait()


@dataclass(slots=True)
class LocalEngineSpy:
    setups: list[EngineSetup] = field(default_factory=list[EngineSetup])

    def __call__(self, setup: EngineSetup) -> None:
        self.setups.append(setup)


@dataclass(frozen=True, slots=True)
class Printed:
    code: int
    out: str
    err: str


@pytest.fixture
def local_engines(monkeypatch: pytest.MonkeyPatch) -> LocalEngineSpy:
    spy = LocalEngineSpy()
    monkeypatch.setattr(run_module, "configure_local_engines", spy)
    return spy


@pytest.fixture
def live(tmp_path: Path) -> Generator[LiveServer]:
    with serving(shop_copy(tmp_path), tmp_path / "data") as server:
        write_server_record(ProjectState(server.root), server.record())
        yield server


@pytest.fixture
def waiting(tmp_path: Path) -> Generator[LiveServer]:
    with serving(shop_copy(tmp_path), tmp_path / "data", TailingEngine()) as server:
        write_server_record(ProjectState(server.root), server.record())
        yield server


def note_file(root: Path) -> Path:
    note = root / "note.json"
    note.write_text(json.dumps(NOTE), encoding="utf-8")
    return note


def printed(request: FlowRunRequest) -> Printed:
    out, err = io.StringIO(), io.StringIO()
    code = asyncio.run(run_flow(request, out, err))
    return Printed(code=code, out=out.getvalue(), err=err.getvalue())


def test_a_live_project_server_runs_the_flow_with_its_agent_overrides(
    live: LiveServer, local_engines: LocalEngineSpy
) -> None:
    live.engine.resumed = True
    request = FlowRunRequest(
        root=live.root,
        flow_id=FLOW_ID,
        input_file=note_file(live.root),
        context=(("tenant_id", "lumen"),),
        agents=(("redo", "critic"),),
    )

    result = printed(request)

    [started] = live.engine.started
    assert result.code == 0
    assert local_engines.setups == []
    assert (started.flow_id, started.mode, started.input) == (FLOW_ID, "live", NOTE)
    assert started.agent_overrides == {"redo": "critic"}
    assert started.context == RunContext.model_validate({"tenant_id": "lumen"})
    assert result.out.splitlines() == [text_line(event) for event in (*suspension_events(), *completion_events())]
    assert f"run {RUN_ID}" in result.err.splitlines()
    assert f"through the project server {live.base_url}" in result.err


def test_json_events_through_the_server_are_the_lines_the_local_engine_prints(
    live: LiveServer, local_engines: LocalEngineSpy
) -> None:
    live.engine.resumed = True
    request = FlowRunRequest(
        root=live.root, flow_id=FLOW_ID, input_file=note_file(live.root), event_format=EventFormat.JSON
    )

    result = printed(request)

    assert result.code == 0
    assert result.out.splitlines() == [json_line(event) for event in (*suspension_events(), *completion_events())]


def test_a_run_suspended_on_the_server_exits_three_and_names_the_wait(
    waiting: LiveServer, local_engines: LocalEngineSpy
) -> None:
    result = printed(FlowRunRequest(root=waiting.root, flow_id=FLOW_ID, input_file=note_file(waiting.root)))

    lines = result.out.splitlines()
    assert result.code == 3
    assert local_engines.setups == []
    assert lines[: len(suspension_events())] == [text_line(event) for event in suspension_events()]
    assert lines[-1].startswith("run is waiting for an answer:") and "form ReplyApproval" in lines[-1]


def test_input_the_flow_rejects_fails_before_the_server_sees_a_run(
    live: LiveServer, local_engines: LocalEngineSpy
) -> None:
    bad = live.root / "bad.json"
    bad.write_text(json.dumps({"wrong": 1}), encoding="utf-8")

    result = printed(FlowRunRequest(root=live.root, flow_id=FLOW_ID, input_file=bad))

    assert result.code == 1
    assert live.engine.started == []
    assert local_engines.setups == []
    assert "text" in result.err


def test_cassettes_are_refused_while_the_project_server_runs(
    live: LiveServer, local_engines: LocalEngineSpy, tmp_path: Path
) -> None:
    request = FlowRunRequest(
        root=live.root, flow_id=FLOW_ID, input_file=note_file(live.root), cassettes=tmp_path / "cassettes"
    )

    result = printed(request)

    assert result.code == 2
    assert live.engine.started == []
    assert local_engines.setups == []
    assert "--cassettes replays on an engine of its own" in result.err


@dataclass(slots=True)
class LocalStarts:
    options: list[RunOptions] = field(default_factory=list[RunOptions])
    inputs: list[BaseModel] = field(default_factory=list[BaseModel])

    async def start(self, handle: FlowHandle[BaseModel, BaseModel], flow_input: BaseModel, options: RunOptions) -> None:
        self.inputs.append(flow_input)
        self.options.append(options)
        raise OSError("the local engine got the run")


@pytest.fixture
def local_starts(monkeypatch: pytest.MonkeyPatch) -> LocalStarts:
    starts = LocalStarts()

    async def start(handle: FlowHandle[BaseModel, BaseModel], flow_input: BaseModel, options: RunOptions) -> None:
        await starts.start(handle, flow_input, options)

    monkeypatch.setattr(FlowHandle, "start", start)
    return starts


def local_request(root: Path, data: Path) -> FlowRunRequest:
    return FlowRunRequest(
        root=root,
        flow_id=FLOW_ID,
        input_file=note_file(root),
        agents=(("redo", "critic"),),
        data_dir=data,
        max_parallel=1,
    )


def test_without_a_server_record_the_run_goes_to_the_local_engine_with_its_agent_overrides(
    tmp_path: Path, local_engines: LocalEngineSpy, local_starts: LocalStarts
) -> None:
    root = shop_copy(tmp_path)

    result = printed(local_request(root, tmp_path / "studio"))

    [options] = local_starts.options
    assert result.code == 1
    assert "the local engine got the run" in result.err
    assert len(local_engines.setups) == 1
    assert options.agent_overrides == {"redo": "critic"}
    assert [item.model_dump() for item in local_starts.inputs] == [NOTE]


def test_a_record_of_a_dead_server_falls_back_to_the_local_engine(
    tmp_path: Path, local_engines: LocalEngineSpy, local_starts: LocalStarts
) -> None:
    root = shop_copy(tmp_path)
    with serving(root, tmp_path / "data") as live:
        write_server_record(ProjectState(root), live.record().model_copy(update={"pid": DEAD_PID}))
        result = printed(local_request(root, tmp_path / "studio"))

    [options] = local_starts.options
    assert result.code == 1
    assert live.engine.started == []
    assert len(local_engines.setups) == 1
    assert options.agent_overrides == {"redo": "critic"}
