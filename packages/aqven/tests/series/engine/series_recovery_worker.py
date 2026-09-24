import asyncio
import json
import os
import sys
import time
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Final

sys.path.insert(0, str(Path(__file__).parent))

from series_harness import CHEAP_NAME, WRITER_NAME, ScriptedLabels, ScriptedModels, SeriesHarness, series_engine

from aqven.series.model import AttemptState, SeriesId, SeriesStatus
from aqven.series.views import SeriesStartRequest
from aqven.spec import ExperimentId
from aqven.write.model import WriteActor

RESULT_PREFIX: Final = "RESULT "
CRASH_AFTER: Final = 2
DELAY_SECONDS: Final = 0.5
POLL_SECONDS: Final = 0.05
WAIT_SECONDS: Final = 120.0
HUMAN: Final = WriteActor(kind="human", id="kir")


def slow_models(log: Path) -> ScriptedModels:
    return ScriptedModels(
        writer=ScriptedLabels(WRITER_NAME, delay=DELAY_SECONDS, log=log),
        cheap=ScriptedLabels(CHEAP_NAME, delay=DELAY_SECONDS, log=log),
    )


async def start(harness: SeriesHarness, series_file: Path) -> None:
    started = await harness.service.start(SeriesStartRequest(experiment_id=ExperimentId("triage_agents")), HUMAN)
    series_file.write_text(started.series_id, encoding="utf-8")
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        rows = await harness.services.store.attempts(started.series_id)
        if sum(1 for row in rows if row.state is AttemptState.FINISHED) >= CRASH_AFTER:
            os._exit(1)
        await asyncio.sleep(POLL_SECONDS)
    os._exit(2)


async def recover(harness: SeriesHarness, series_file: Path) -> None:
    series_id = SeriesId(series_file.read_text(encoding="utf-8"))
    store = harness.services.store
    deadline = time.monotonic() + WAIT_SECONDS
    record = await store.series(series_id)
    while record is None or record.status is not SeriesStatus.DONE:
        assert time.monotonic() < deadline, record
        await asyncio.sleep(POLL_SECONDS)
        record = await store.series(series_id)
    rows = await store.attempts(series_id)
    report = {
        "status": record.status.value,
        "planned": record.plan.case_count * record.plan.repeats * len(record.plan.variants),
        "attempts": [row.attempt_id for row in rows],
        "states": [row.state.value for row in rows],
        "outcomes": [None if row.outcome is None else row.outcome.value for row in rows],
        "spend": str(await store.spend(series_id)),
        "rows_spend": str(sum(row.cost_usd + row.check_cost_usd for row in rows)),
    }
    print(f"{RESULT_PREFIX}{json.dumps(report)}", flush=True)


type Mode = Callable[[SeriesHarness, Path], Awaitable[None]]

MODES: Final[Mapping[str, Mode]] = {"start": start, "recover": recover}


def main() -> None:
    mode, root, series_file, log = sys.argv[1:5]
    with series_engine(Path(root), slow_models(Path(log))) as harness:
        asyncio.run(MODES[mode](harness, Path(series_file)))


main()
