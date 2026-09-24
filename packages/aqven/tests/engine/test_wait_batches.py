import asyncio
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final

from aqven.engine.human import HumanWaits, SqliteWaitIndex, WaitIndexEntry
from aqven.engine.human.forms import FormModel
from aqven.engine.human.records import AnswerEnvelope, WaitRecord
from aqven.runtime.address import ExecutionAddress, RunId, node_address
from aqven.runtime.human import HumanWait
from aqven.runtime.vocabulary import RunStatus, WaitState
from aqven.spec import TypeId

NOW: Final = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)
RUNS: Final = 12


def run_id(number: int) -> RunId:
    return RunId(f"01a0aa21-b9a7-74fb-b1f3-{number:012d}")


def entry(number: int, node: str, hours: int, state: WaitState = "waiting") -> WaitIndexEntry:
    return WaitIndexEntry(
        run_id=run_id(number),
        workflow_id=run_id(number),
        address=node_address(node),
        wait_kind="form",
        attempt=1,
        state=state,
        assignee="support_lead",
        waiting_since=NOW,
        deadline_at=NOW + timedelta(hours=hours),
        on_timeout="fail",
        form_type_id=TypeId("ReviewDecision"),
    )


class UnusedChannel:
    async def read(self, workflow_id: str, address: ExecutionAddress) -> WaitRecord | None:
        raise AssertionError("waits are read from the index only")

    async def send(self, workflow_id: str, topic: str, envelope: AnswerEnvelope) -> None:
        raise AssertionError("waits are read from the index only")


class UnusedForms:
    def form(self, type_id: TypeId) -> FormModel:
        raise AssertionError("waits are read from the index only")


class UnusedStatuses:
    async def status(self, run_id: RunId) -> RunStatus:
        raise AssertionError("waits are read from the index only")


def human_waits(tmp_path: Path) -> HumanWaits:
    index = SqliteWaitIndex.open(tmp_path / "aqven.sqlite")

    async def fill() -> None:
        for number in range(RUNS):
            await index.record(entry(number, "review", (number * 5) % RUNS))
            await index.record(entry(number, "approve", -number))
        await index.record(entry(RUNS, "review", 1, state="resolved"))

    asyncio.run(fill())
    return HumanWaits(index=index, channel=UnusedChannel(), forms=UnusedForms(), statuses=UnusedStatuses())


async def one_by_one(waits: HumanWaits, run_ids: tuple[RunId, ...]) -> Mapping[RunId, tuple[HumanWait, ...]]:
    found = {owner: await waits.waits(owner) for owner in run_ids}
    return {owner: listed for owner, listed in found.items() if listed}


def test_a_batch_of_waits_equals_the_waits_asked_run_by_run(tmp_path: Path) -> None:
    waits = human_waits(tmp_path)
    asked = tuple(run_id(number) for number in (*range(0, RUNS, 2), RUNS, RUNS + 1))

    batched = asyncio.run(waits.waits_of(asked))

    assert batched == asyncio.run(one_by_one(waits, asked))
    assert set(batched) == {run_id(number) for number in range(0, RUNS, 2)}
    assert all(len(listed) == 2 for listed in batched.values())


def test_an_empty_batch_asks_nothing(tmp_path: Path) -> None:
    waits = human_waits(tmp_path)

    assert asyncio.run(waits.waits_of(())) == {}
