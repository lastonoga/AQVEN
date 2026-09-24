import asyncio
import time
from collections.abc import Callable
from pathlib import Path
from typing import Final

import pytest
from engine_core_harness import GATE_ENV, TRACE_ENV, StampService, launched_facade, trace_lines
from engine_core_plan import relay_project
from test_engine_core_runs import crash_and_recover

from aqven.engine import DbosEngineFacade, RunOverrides, RunSpec
from aqven.engine.summaries import SUMMARY_DATABASE
from aqven.ports.engine import RunListQuery
from aqven.runtime import CancelRequest, ForkRequest, RunSnapshot, RunSummary, node_address
from aqven.runtime.address import JsonObject, RunId
from aqven.runtime.vocabulary import RunMode
from aqven.spec import FlowId

LOW: Final[JsonObject] = {"text": "  hello   world ", "priority": "low"}
WAIT_SECONDS: Final = 60.0
FLOWS: Final = (FlowId("relay"), FlowId("broken"), FlowId("gated"))
SUMMARY_FIELDS: Final = set(RunSummary.model_fields)

type Rows = list[dict[str, object]]


def summary_of(snapshot: RunSnapshot) -> dict[str, object]:
    return RunSummary.model_validate(snapshot.model_dump(include=SUMMARY_FIELDS)).model_dump(mode="json")


async def launch(facade: DbosEngineFacade, flow_id: str, mode: RunMode = "replay") -> RunId:
    overrides = RunOverrides(tool_http=StampService().transport())
    started = await facade.launch(relay_project(), RunSpec(flow_id=FlowId(flow_id), mode=mode), LOW, overrides)
    return started.run_id


async def wait_for(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while not condition():
        assert time.monotonic() < deadline
        await asyncio.sleep(0.05)


async def listed_and_detailed(facade: DbosEngineFacade, query: RunListQuery) -> tuple[Rows, Rows]:
    page = await facade.list_runs(query)
    details = [summary_of(await facade.get_run(item.run_id)) for item in page.items]
    return [item.model_dump(mode="json") for item in page.items], details


async def mixed_history(facade: DbosEngineFacade, trace: Path, gate: Path) -> None:
    first = await launch(facade, "relay")
    await facade.result(first)
    await facade.result(await launch(facade, "broken"))
    await facade.result(await launch(facade, "relay", "experiment"))
    gated = await launch(facade, "gated")
    await wait_for(lambda: "gate_started" in trace_lines(trace))
    await facade.cancel(gated, CancelRequest(reason="listing"))
    gate.touch()
    await facade.result(gated)
    forked = await facade.fork(first, ForkRequest(from_=node_address("stamp")))
    await facade.result(forked.run_id)


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


def test_every_listed_run_matches_its_snapshot(tmp_path: Path, trace: Path, gate: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> list[tuple[Rows, Rows]]:
        await mixed_history(facade, trace, gate)
        queries = (
            RunListQuery(),
            RunListQuery(mode="experiment"),
            RunListQuery(status="cancelled"),
            RunListQuery(status="failed"),
            RunListQuery(flow_id=FlowId("relay"), limit=1),
        )
        return [await listed_and_detailed(facade, query) for query in queries]

    with launched_facade(tmp_path / "state") as facade:
        pairs = asyncio.run(scenario(facade))

    for listed, detailed in pairs:
        assert listed == detailed
    everything, experiment, cancelled, failed, newest = (listed for listed, _ in pairs)
    assert [row["status"] for row in everything] == ["completed", "cancelled", "failed", "completed"]
    assert everything[0]["lineage"] == {"relation": "fork", "parent_run_id": everything[3]["run_id"]}
    assert (len(experiment), len(cancelled), len(failed), len(newest)) == (1, 1, 1, 1)


def test_latest_runs_are_the_first_item_of_each_flow_listing(tmp_path: Path, trace: Path, gate: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[dict[FlowId, JsonObject], dict[FlowId, JsonObject]]:
        await mixed_history(facade, trace, gate)
        latest = await facade.latest_runs(FLOWS)
        pages = {flow: await facade.list_runs(RunListQuery(flow_id=flow, limit=1)) for flow in FLOWS}
        first = {flow: page.items[0].model_dump(mode="json") for flow, page in pages.items()}
        return {flow: run.model_dump(mode="json") for flow, run in latest.items()}, first

    with launched_facade(tmp_path / "state") as facade:
        latest, first = asyncio.run(scenario(facade))

    assert latest == first
    assert set(latest) == set(FLOWS)


def test_a_lost_summary_store_is_rebuilt_from_the_event_logs(tmp_path: Path, trace: Path, gate: Path) -> None:
    async def recorded(facade: DbosEngineFacade) -> dict[str, object]:
        await mixed_history(facade, trace, gate)
        return (await facade.list_runs(RunListQuery(limit=50))).model_dump(mode="json")

    state = tmp_path / "state"
    with launched_facade(state) as facade:
        before = asyncio.run(recorded(facade))
    for suffix in ("", "-wal", "-shm"):
        (state / f"{SUMMARY_DATABASE}{suffix}").unlink(missing_ok=True)

    with launched_facade(state) as facade:
        after = asyncio.run(facade.list_runs(RunListQuery(limit=50))).model_dump(mode="json")

    assert after == before


def test_a_run_recovered_after_a_crash_is_listed_as_its_snapshot(tmp_path: Path) -> None:
    crash_and_recover(tmp_path, "gated")

    with launched_facade(tmp_path / "state") as facade:
        listed, detailed = asyncio.run(listed_and_detailed(facade, RunListQuery()))

    assert listed == detailed
    assert [row["status"] for row in listed] == ["completed"]
