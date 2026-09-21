import asyncio
from pathlib import Path
from typing import Final

from pydantic import BaseModel

from aqven.engine import EngineSetup, configure_local_engines, shutdown_local_engines
from aqven.runtime import Project, RunEvent, RunFinished, RunResult

ALIAS_SHOP: Final = Path(__file__).parents[2] / "fixtures" / "alias_shop"


def test_project_flow_runs_on_the_local_engine(tmp_path: Path) -> None:
    configure_local_engines(EngineSetup(state_dir=tmp_path / "state", environ={}))
    project = Project.load(ALIAS_SHOP)
    handle = project.flow("audit")

    async def scenario() -> tuple[RunResult[BaseModel], list[RunEvent], str]:
        run = await handle.start(handle.input_model.model_validate({"text": "  note  "}))
        result = await run.result()
        events = [event async for event in run.events()]
        return result, events, await run.status()

    try:
        result, events, status = asyncio.run(scenario())
    finally:
        shutdown_local_engines()

    assert (result.status, status) == ("completed", "completed")
    assert result.output is not None and result.output.model_dump() == {"text": "  note  "}
    assert isinstance(events[-1], RunFinished)
