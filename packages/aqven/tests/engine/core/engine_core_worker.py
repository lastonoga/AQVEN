import asyncio
import json
import os
import sys
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Final

sys.path.insert(0, str(Path(__file__).parent))

from engine_core_harness import with_parallel
from engine_core_plan import FIXTURE_ROOT, relay_project

from aqven.engine import DbosEngineFacade, EngineLifecycle, EngineSetup, RunOverrides, RunSpec
from aqven.ports.engine import EventLogQuery
from aqven.runtime.address import RunId
from aqven.spec import FlowId

RESULT_PREFIX: Final = "RESULT "
GATE_ENV: Final = "RELAY_GATE"
IDLE_SECONDS: Final = 3600


async def start(facade: DbosEngineFacade, run_file: Path, flow_id: str) -> None:
    started = await facade.launch(
        relay_project(), RunSpec(flow_id=FlowId(flow_id)), {"text": "tick", "priority": "low"}, RunOverrides()
    )
    run_file.write_text(started.run_id, encoding="utf-8")
    await asyncio.sleep(IDLE_SECONDS)


async def recover(facade: DbosEngineFacade, run_file: Path, flow_id: str) -> None:
    run_id = RunId(run_file.read_text(encoding="utf-8"))
    Path(os.environ[GATE_ENV]).touch()
    record = await facade.result(run_id)
    events = await facade.event_log(run_id, EventLogQuery(limit=200))
    report = {
        "record": record.model_dump(mode="json"),
        "types": [event.type for event in events.items],
        "seqs": [event.seq for event in events.items],
    }
    print(f"{RESULT_PREFIX}{json.dumps(report)}", flush=True)


type Mode = Callable[[DbosEngineFacade, Path, str], Awaitable[None]]

MODES: Final[Mapping[str, Mode]] = {"start": start, "recover": recover}


def main() -> None:
    mode, state, run_file, flow_id = sys.argv[1:5]
    lifecycle = EngineLifecycle(root=FIXTURE_ROOT, setup=EngineSetup(extensions=with_parallel), state_dir=Path(state))
    facade = DbosEngineFacade(runtime=lifecycle.launch())
    try:
        asyncio.run(MODES[mode](facade, Path(run_file), flow_id))
    finally:
        lifecycle.shutdown()


main()
