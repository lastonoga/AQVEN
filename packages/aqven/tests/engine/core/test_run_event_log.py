import asyncio
import pickle
import sqlite3
import time
from collections.abc import Callable
from contextlib import closing, suppress
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Final

import pytest
from dbos import DBOS, WorkflowHandleAsync, WorkflowSerializationFormat
from dbos import error as dbos_errors
from dbos._schemas.system_database import SystemSchema
from dbos._serialization import serialize_value
from engine_core_harness import GATE_ENV, TRACE_ENV, StampService, launched_facade, trace_lines
from engine_core_plan import relay_project
from pydantic import JsonValue, TypeAdapter

from aqven.engine import DbosEngineFacade, RunOverrides, RunSpec
from aqven.engine.protocol import DBOS_DATABASE_FILE, RUN_EVENTS_STREAM
from aqven.engine.reader import RunEventLog, StoredStreamSource, StreamApiSource, preferred_stored_source
from aqven.engine.system_streams import (
    STATUS_COLUMNS,
    STREAM_COLUMNS,
    STREAM_PRIMARY_KEY,
    StoredStream,
    SystemStreamTable,
    WorkflowState,
    launched_system_database,
    system_tables_match,
)
from aqven.runtime import CancelRequest, ForkRequest, node_address
from aqven.runtime.address import JsonObject, RunId
from aqven.spec import FlowId

PINNED_DBOS: Final = "2.31.1"
LOW: Final[JsonObject] = {"text": "  hello   world ", "priority": "low"}
WAIT_SECONDS: Final = 60.0
PAYLOADS: Final[TypeAdapter[list[JsonValue]]] = TypeAdapter(list[JsonValue])
NOT_AN_EVENT: Final = "not an event"
AFTER_CLOSE: Final = "written after close"
CRASH_MESSAGE: Final = "crashed before finishing"
GAP_WIDTH: Final = 2


@DBOS.workflow(name="aqven_tests.reader.closed_stream")
async def closed_stream_workflow(payloads: list[JsonValue]) -> None:
    for payload in payloads:
        await DBOS.write_stream_async(RUN_EVENTS_STREAM, payload)
    await DBOS.write_stream_async(RUN_EVENTS_STREAM, NOT_AN_EVENT)
    await DBOS.write_stream_async(
        RUN_EVENTS_STREAM, payloads[-1], serialization_type=WorkflowSerializationFormat.PORTABLE
    )
    await DBOS.write_stream_async(RUN_EVENTS_STREAM, payloads[0], serialization_type=WorkflowSerializationFormat.NATIVE)
    await DBOS.close_stream_async(RUN_EVENTS_STREAM)
    await DBOS.write_stream_async(RUN_EVENTS_STREAM, AFTER_CLOSE)


@DBOS.workflow(name="aqven_tests.reader.crashed_stream")
async def crashed_stream_workflow(payloads: list[JsonValue]) -> None:
    for payload in payloads:
        await DBOS.write_stream_async(RUN_EVENTS_STREAM, payload)
    raise ValueError(CRASH_MESSAGE)


@DBOS.workflow(name="aqven_tests.reader.silent_stream")
async def silent_stream_workflow() -> None:
    return None


@dataclass(frozen=True, slots=True)
class Comparison:
    expected: StoredStream
    actual: StoredStream
    expected_snapshot: tuple[JsonObject, ...]
    actual_snapshot: tuple[JsonObject, ...]


@pytest.fixture
def trace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    location = tmp_path / "trace.txt"
    monkeypatch.setenv(TRACE_ENV, str(location))
    return location


def system_table() -> SystemStreamTable:
    database = launched_system_database()
    assert database is not None
    return SystemStreamTable(database)


def described(state: WorkflowState | None) -> tuple[object, ...]:
    assert state is not None
    return (state.run_id, state.status, str(state.error), state.created_at, state.updated_at)


def stream_api() -> StoredStreamSource:
    return StreamApiSource()


async def snapshot_documents(log: RunEventLog, run_id: RunId) -> tuple[JsonObject, ...]:
    return tuple(event.model_dump(mode="json") for event in await log.snapshot(run_id))


async def compare(run_id: RunId) -> Comparison:
    return Comparison(
        expected=await StreamApiSource().read(run_id, RUN_EVENTS_STREAM),
        actual=await system_table().read(run_id, RUN_EVENTS_STREAM),
        expected_snapshot=await snapshot_documents(RunEventLog(stored_source=stream_api), run_id),
        actual_snapshot=await snapshot_documents(RunEventLog(), run_id),
    )


def assert_same(comparison: Comparison) -> None:
    assert pickle.dumps(comparison.actual.payloads) == pickle.dumps(comparison.expected.payloads)
    assert described(comparison.actual.state) == described(comparison.expected.state)
    assert comparison.actual_snapshot == comparison.expected_snapshot


async def launch(facade: DbosEngineFacade, flow_id: str, service: StampService | None = None) -> RunId:
    overrides = RunOverrides(tool_http=service.transport() if service is not None else None)
    started = await facade.launch(relay_project(), RunSpec(flow_id=FlowId(flow_id), mode="replay"), LOW, overrides)
    return started.run_id


async def wait_for(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while not condition():
        assert time.monotonic() < deadline
        await asyncio.sleep(0.05)


async def settled(handle: WorkflowHandleAsync[None]) -> RunId:
    with suppress(ValueError):
        await handle.get_result()
    return RunId(handle.workflow_id)


def append_after_gap(run_id: RunId, payload: JsonValue, offset: int) -> None:
    database = launched_system_database()
    assert database is not None
    value, serialization = serialize_value(payload, None, database.serializer)
    row = SystemSchema.streams.insert().values(
        workflow_uuid=run_id,
        key=RUN_EVENTS_STREAM,
        value=value,
        serialization=serialization,
        offset=offset,
        function_id=0,
    )
    with database.engine.begin() as connection:
        connection.execute(row)


def test_reader_is_pinned_to_the_installed_dbos_system_tables(tmp_path: Path) -> None:
    state = tmp_path / "state"
    with launched_facade(state):
        launched = preferred_stored_source()

    with closing(sqlite3.connect(f"file:{state / DBOS_DATABASE_FILE}?mode=ro", uri=True)) as connection:
        streams = connection.execute("SELECT name, pk FROM pragma_table_info('streams')").fetchall()
        statuses = connection.execute("SELECT name FROM pragma_table_info('workflow_status')").fetchall()

    assert version("dbos") == PINNED_DBOS
    assert system_tables_match()
    assert isinstance(launched, SystemStreamTable)
    assert isinstance(preferred_stored_source(), StreamApiSource)
    assert {name for name, _ in streams} >= STREAM_COLUMNS
    assert tuple(name for name, key in sorted(streams, key=lambda column: column[1]) if key) == STREAM_PRIMARY_KEY
    assert {name for (name,) in statuses} >= STATUS_COLUMNS


def test_table_reader_returns_what_read_stream_returns_for_engine_runs(
    tmp_path: Path, trace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = tmp_path / "gate"
    monkeypatch.setenv(GATE_ENV, str(gate))
    service = StampService()

    async def scenario(facade: DbosEngineFacade) -> dict[str, Comparison]:
        completed = await launch(facade, "relay", service)
        await facade.result(completed)
        broken = await launch(facade, "broken")
        missing = await launch(facade, "thinking")
        forked = (await facade.fork(completed, ForkRequest(from_=node_address("stamp")))).run_id
        for run_id in (broken, missing, forked):
            await facade.result(run_id)
        gated = await launch(facade, "gated")
        await wait_for(lambda: "gate_started" in trace_lines(trace))
        running = await compare(gated)
        await facade.cancel(gated, CancelRequest(reason="parity"))
        gate.touch()
        await facade.result(gated)
        finished = {"completed": completed, "broken": broken, "missing": missing, "forked": forked, "cancelled": gated}
        return {"running": running} | {name: await compare(run_id) for name, run_id in finished.items()}

    with launched_facade(tmp_path / "state") as facade:
        comparisons = asyncio.run(scenario(facade))

    for comparison in comparisons.values():
        assert_same(comparison)
    assert comparisons["running"].actual.state is not None
    assert comparisons["running"].actual.state.status == "PENDING"
    assert comparisons["cancelled"].actual_snapshot[-1]["status"] == "cancelled"
    assert all(len(comparison.actual.payloads) > 1 for comparison in comparisons.values())


def test_table_reader_matches_dbos_on_closed_crashed_gapped_and_empty_streams(tmp_path: Path, trace: Path) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[dict[str, Comparison], int]:
        completed = await launch(facade, "relay", StampService())
        await facade.result(completed)
        payloads = PAYLOADS.validate_python(list((await system_table().read(completed, RUN_EVENTS_STREAM)).payloads))
        unfinished = payloads[:-1]
        closed = await settled(await DBOS.start_workflow_async(closed_stream_workflow, payloads))
        crashed = await settled(await DBOS.start_workflow_async(crashed_stream_workflow, unfinished))
        gapped = await settled(await DBOS.start_workflow_async(crashed_stream_workflow, unfinished))
        silent = await settled(await DBOS.start_workflow_async(silent_stream_workflow))
        append_after_gap(gapped, payloads[-1], len(unfinished) + GAP_WIDTH)
        runs = {"closed": closed, "crashed": crashed, "gapped": gapped, "silent": silent}
        return {name: await compare(run_id) for name, run_id in runs.items()}, len(payloads)

    with launched_facade(tmp_path / "state") as facade:
        comparisons, written = asyncio.run(scenario(facade))

    for comparison in comparisons.values():
        assert_same(comparison)
    assert len(comparisons["closed"].actual.payloads) == written + 3
    assert AFTER_CLOSE not in comparisons["closed"].actual.payloads
    assert len(comparisons["gapped"].actual.payloads) == written - 1
    assert comparisons["crashed"].actual_snapshot[-1]["status"] == "failed"
    assert comparisons["crashed"].actual_snapshot[-1]["error"] == {
        "code": "INTERNAL",
        "message": CRASH_MESSAGE,
        "address": None,
        "hint": None,
        "details": None,
    }
    assert comparisons["silent"].actual.payloads == ()
    assert [event["type"] for event in comparisons["silent"].actual_snapshot] == ["run_finished"]


def test_unknown_run_raises_like_the_stream_api(tmp_path: Path) -> None:
    unknown = RunId("no-such-run")

    async def scenario() -> list[type[BaseException]]:
        raised: list[type[BaseException]] = []
        for reader in (StreamApiSource(), system_table()):
            with pytest.raises(dbos_errors.DBOSNonExistentWorkflowError) as error:
                await reader.read(unknown, RUN_EVENTS_STREAM)
            raised.append(error.type)
        with pytest.raises(dbos_errors.DBOSNonExistentWorkflowError) as error:
            await RunEventLog().snapshot(unknown)
        return [*raised, error.type]

    with launched_facade(tmp_path / "state"):
        raised = asyncio.run(scenario())

    assert raised == [dbos_errors.DBOSNonExistentWorkflowError] * 3


def test_snapshot_reads_the_table_once_and_never_the_stream_api(
    tmp_path: Path, trace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reads: list[RunId] = []
    read_now = SystemStreamTable.read_now

    def counted(table: SystemStreamTable, run_id: RunId, key: str) -> StoredStream:
        reads.append(run_id)
        return read_now(table, run_id, key)

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("stored reads must not go through the stream API")

    async def scenario(facade: DbosEngineFacade) -> tuple[int, int]:
        run_id = await launch(facade, "relay", StampService())
        await facade.result(run_id)
        monkeypatch.setattr(SystemStreamTable, "read_now", counted)
        monkeypatch.setattr(DBOS, "read_stream_async", forbidden)
        monkeypatch.setattr(DBOS, "get_workflow_status_async", forbidden)
        log = RunEventLog()
        events = await log.snapshot(run_id)
        stored = await log.stored(run_id)
        return len(events), len(stored)

    with launched_facade(tmp_path / "state") as facade:
        events, stored = asyncio.run(scenario(facade))

    assert len(reads) == 2
    assert events == stored and events > 1


def test_failed_schema_check_falls_back_to_the_stream_api(
    tmp_path: Path, trace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def scenario(facade: DbosEngineFacade) -> tuple[tuple[JsonObject, ...], tuple[JsonObject, ...]]:
        run_id = await launch(facade, "relay", StampService())
        await facade.result(run_id)
        preferred = await snapshot_documents(RunEventLog(), run_id)
        monkeypatch.setattr("aqven.engine.system_streams.system_tables_match", lambda: False)
        assert isinstance(preferred_stored_source(), StreamApiSource)
        return preferred, await snapshot_documents(RunEventLog(), run_id)

    with launched_facade(tmp_path / "state") as facade:
        preferred, fallback = asyncio.run(scenario(facade))

    assert fallback == preferred
    assert fallback[-1]["type"] == "run_finished"
