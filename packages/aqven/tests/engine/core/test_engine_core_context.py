import asyncio
from pathlib import Path
from typing import Final

import pytest
from engine_core_harness import TRACE_ENV, StaticPlanSource, launched_facade
from engine_core_plan import relay_project

from aqven.engine import DbosEngineFacade
from aqven.ir import CompiledProject
from aqven.ports.engine import EngineError
from aqven.runtime.address import JsonObject
from aqven.runtime.options import RunContext
from aqven.runtime.runs import RunStartRequest
from aqven.spec import FlowId, RunContextKey

BROKEN: Final = FlowId("broken")
LOW: Final[JsonObject] = {"text": "  hello   world ", "priority": "low"}


@pytest.fixture
def trace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    location = tmp_path / "trace.txt"
    monkeypatch.setenv(TRACE_ENV, str(location))
    return location


def dated_project() -> CompiledProject:
    plan = relay_project()
    flow = plan.flow(BROKEN).model_copy(update={"context": (RunContextKey.DATE,)})
    return plan.model_copy(update={"flows": {**plan.flows, BROKEN: flow}})


def test_run_start_refuses_a_flow_without_the_context_key(tmp_path: Path, trace: Path) -> None:
    source = StaticPlanSource(dated_project())

    async def scenario(facade: DbosEngineFacade) -> tuple[EngineError, str]:
        with pytest.raises(EngineError) as refused:
            await facade.start_run(RunStartRequest(flow_id=BROKEN, mode="replay", input=LOW))
        started = await facade.start_run(
            RunStartRequest(
                flow_id=BROKEN,
                mode="replay",
                input=LOW,
                context=RunContext.model_validate({"date": "2026-09-18"}),
            )
        )
        return refused.value, started.run_id

    with launched_facade(tmp_path / "state", source) as facade:
        error, run_id = asyncio.run(scenario(facade))

    paths = [".".join(str(part) for part in problem.path) for problem in error.problems]
    assert (error.code, paths) == ("CONTEXT_MISSING", ["context.date"])
    assert "date" in error.message
    assert run_id


def test_run_snapshot_reports_the_context_the_run_was_started_with(tmp_path: Path, trace: Path) -> None:
    source = StaticPlanSource(dated_project())
    context = RunContext.model_validate({"date": "2026-09-18"})

    async def scenario(facade: DbosEngineFacade) -> tuple[RunContext | None, RunContext | None]:
        started = await facade.start_run(RunStartRequest(flow_id=BROKEN, mode="replay", input=LOW, context=context))
        dated = await facade.get_run(started.run_id)
        plain = await facade.start_run(RunStartRequest(flow_id=FlowId("relay"), mode="replay", input=LOW))
        return dated.context, (await facade.get_run(plain.run_id)).context

    with launched_facade(tmp_path / "state", source) as facade:
        with_context, without_context = asyncio.run(scenario(facade))

    assert with_context == context
    assert without_context is None
