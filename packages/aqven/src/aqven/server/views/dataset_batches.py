"""Durable groups of flow runs launched from dataset cases."""

import asyncio
import sqlite3
from collections.abc import Generator, Sequence
from contextlib import closing, contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Final, Literal
from uuid import uuid7

from pydantic import Field, model_validator

from aqven.app.locations import ProjectState
from aqven.runtime.address import RequestModel, ResourceModel, RunId
from aqven.runtime.runs import RunStartRequest
from aqven.runtime.vocabulary import RunMode
from aqven.server.context import ServerContext
from aqven.server.errors import ApiFailure, not_found
from aqven.server.run_inputs import check_start
from aqven.server.views.common import loaded_project
from aqven.server.views.datasets import resolve_dataset_run
from aqven.spec import DatasetId, FlowId, NodeId

MAX_CASES: Final = 5000
MAX_PARALLEL_STARTS: Final = 4
MAX_PARALLEL_REFRESHES: Final = 8
TERMINAL: Final = frozenset({"completed", "failed", "cancelled", "start_failed"})
BATCHES_TABLE: Final = "aqven_dataset_batches"
CASES_TABLE: Final = "aqven_dataset_batch_cases"

SCHEMA: Final = f"""
CREATE TABLE IF NOT EXISTS {BATCHES_TABLE} (
    batch_id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {BATCHES_TABLE}_dataset_recent ON {BATCHES_TABLE} (dataset_id, batch_id DESC);
CREATE TABLE IF NOT EXISTS {CASES_TABLE} (
    batch_id TEXT NOT NULL,
    case_name TEXT NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (batch_id, case_name)
);
"""


class DatasetBatchStartRequest(RequestModel):
    flow_id: FlowId
    dataset_id: DatasetId
    case_names: Annotated[tuple[str, ...], Field(min_length=1, max_length=MAX_CASES)]
    selected_nodes: tuple[NodeId, ...] | None = None
    start_node: NodeId | None = None
    end_node: NodeId | None = None
    mode: RunMode = "live"

    @model_validator(mode="after")
    def valid_range(self) -> DatasetBatchStartRequest:
        if (self.start_node is None) != (self.end_node is None):
            raise ValueError("start_node and end_node must be provided together")
        if self.start_node is not None and self.selected_nodes is not None:
            raise ValueError("selected_nodes and a node range cannot be combined")
        return self


class DatasetBatchRecord(ResourceModel):
    batch_id: str
    flow_id: FlowId
    dataset_id: DatasetId
    dataset_file_hash: str
    case_names: tuple[str, ...]
    selected_nodes: tuple[NodeId, ...] | None
    mode: RunMode
    status: Literal["running", "completed", "failed"]
    started_at: datetime
    finished_at: datetime | None = None
    start_node: NodeId | None = None
    end_node: NodeId | None = None
    cases_total: int
    cases_completed: int = 0
    cases_failed: int = 0
    cost_usd: Decimal = Decimal(0)


class DatasetBatchCase(ResourceModel):
    case_name: str
    status: str
    run_id: RunId | None = None
    error: str | None = None
    cost_usd: Decimal = Decimal(0)


class StoredBatchCase(DatasetBatchCase):
    request: RunStartRequest
    dataset_item_id: str

    def public(self) -> DatasetBatchCase:
        return DatasetBatchCase.model_validate(self.model_dump(exclude={"request", "dataset_item_id"}))


@dataclass(frozen=True, slots=True)
class SqliteDatasetBatchStore:
    path: Path

    @classmethod
    def open(cls, root: Path) -> SqliteDatasetBatchStore:
        project = ProjectState(root)
        project.ensure()
        store = cls(project.database)
        with store.connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)
        return store

    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=30)) as connection, connection:
            yield connection

    def save_batch(self, record: DatasetBatchRecord) -> None:
        with self.connection() as connection:
            connection.execute(
                f"INSERT INTO {BATCHES_TABLE} (batch_id, flow_id, dataset_id, record) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (batch_id) DO UPDATE SET record = excluded.record",
                (record.batch_id, record.flow_id, record.dataset_id, record.model_dump_json()),
            )

    def create(self, record: DatasetBatchRecord, cases: Sequence[StoredBatchCase]) -> None:
        with self.connection() as connection:
            connection.execute(
                f"INSERT INTO {BATCHES_TABLE} (batch_id, flow_id, dataset_id, record) VALUES (?, ?, ?, ?)",
                (record.batch_id, record.flow_id, record.dataset_id, record.model_dump_json()),
            )
            connection.executemany(
                f"INSERT INTO {CASES_TABLE} (batch_id, case_name, record) VALUES (?, ?, ?)",
                ((record.batch_id, case.case_name, case.model_dump_json()) for case in cases),
            )

    def save_cases(self, batch_id: str, cases: Sequence[StoredBatchCase]) -> None:
        with self.connection() as connection:
            connection.executemany(
                f"INSERT INTO {CASES_TABLE} (batch_id, case_name, record) VALUES (?, ?, ?) "
                "ON CONFLICT (batch_id, case_name) DO UPDATE SET record = excluded.record",
                ((batch_id, case.case_name, case.model_dump_json()) for case in cases),
            )

    def batch(self, batch_id: str) -> DatasetBatchRecord | None:
        with self.connection() as connection:
            row = connection.execute(f"SELECT record FROM {BATCHES_TABLE} WHERE batch_id = ?", (batch_id,)).fetchone()
        return None if row is None else DatasetBatchRecord.model_validate_json(row[0])

    def batches(
        self, flow_id: FlowId, dataset_id: DatasetId, before: str | None, limit: int
    ) -> tuple[DatasetBatchRecord, ...]:
        with self.connection() as connection:
            rows = connection.execute(
                f"SELECT record FROM {BATCHES_TABLE} WHERE flow_id = ? AND dataset_id = ? "
                "AND (? IS NULL OR batch_id < ?) ORDER BY batch_id DESC LIMIT ?",
                (flow_id, dataset_id, before, before, limit),
            ).fetchall()
        return tuple(DatasetBatchRecord.model_validate_json(row[0]) for row in rows)

    def cases(self, batch_id: str) -> tuple[StoredBatchCase, ...]:
        with self.connection() as connection:
            rows = connection.execute(
                f"SELECT record FROM {CASES_TABLE} WHERE batch_id = ? ORDER BY case_name", (batch_id,)
            ).fetchall()
        return tuple(StoredBatchCase.model_validate_json(row[0]) for row in rows)


@dataclass(slots=True)
class DatasetBatchJobs:
    context: ServerContext
    store: SqliteDatasetBatchStore | None = None
    tasks: dict[str, asyncio.Task[None]] = field(default_factory=dict[str, asyncio.Task[None]])

    def opened(self) -> SqliteDatasetBatchStore:
        if self.store is None:
            self.store = SqliteDatasetBatchStore.open(self.context.workspace.root)
        return self.store

    async def start(self, body: DatasetBatchStartRequest) -> DatasetBatchRecord:
        state = await self.context.workspace.state()
        source = loaded_project(state).datasets.get(body.dataset_id)
        if source is None:
            raise not_found(f"dataset {body.dataset_id} is not in the project")
        if source.spec.flow != body.flow_id:
            raise ApiFailure("NOT_RUNNABLE", f"dataset {body.dataset_id} is not a flow dataset for {body.flow_id}")
        if len(set(body.case_names)) != len(body.case_names):
            raise ApiFailure("REQUEST_INVALID", "case_names must be unique")
        available = {case.name for case in source.spec.cases}
        missing = set(body.case_names) - available
        if missing:
            raise not_found(f"cases not in dataset {body.dataset_id}: {', '.join(sorted(missing))}")
        cases: list[StoredBatchCase] = []
        for case_name in body.case_names:
            item_id = f"{body.dataset_id}/{case_name}"
            request = resolve_dataset_run(
                state,
                RunStartRequest(
                    flow_id=body.flow_id,
                    mode=body.mode,
                    dataset_item_id=item_id,
                    selected_nodes=body.selected_nodes,
                    start_node=body.start_node,
                    end_node=body.end_node,
                ),
            )
            check_start(state, request)
            cases.append(
                StoredBatchCase(case_name=case_name, status="pending", request=request, dataset_item_id=item_id)
            )
        record = DatasetBatchRecord(
            batch_id=str(uuid7()),
            flow_id=body.flow_id,
            dataset_id=body.dataset_id,
            dataset_file_hash=source.file_hash,
            case_names=body.case_names,
            selected_nodes=body.selected_nodes,
            start_node=body.start_node,
            end_node=body.end_node,
            mode=body.mode,
            status="running",
            started_at=datetime.now(UTC),
            cases_total=len(cases),
        )
        store = self.opened()
        store.create(record, cases)
        self._launch(record.batch_id)
        return record

    def _launch(self, batch_id: str) -> None:
        if batch_id in self.tasks:
            return
        task = asyncio.create_task(self._start_pending(batch_id))
        self.tasks[batch_id] = task
        task.add_done_callback(lambda _: self.tasks.pop(batch_id, None))

    async def _start_pending(self, batch_id: str) -> None:
        store = self.opened()
        cases = store.cases(batch_id)
        semaphore = asyncio.Semaphore(MAX_PARALLEL_STARTS)

        async def start_one(case: StoredBatchCase) -> None:
            async with semaphore:
                starting = case.model_copy(update={"status": "starting"})
                store.save_cases(batch_id, (starting,))
                try:
                    started = await self.context.facade.start_run(case.request, dataset_item_id=case.dataset_item_id)
                    updated = case.model_copy(update={"status": started.status, "run_id": started.run_id})
                except Exception as error:
                    updated = case.model_copy(
                        update={"status": "start_failed", "error": f"{type(error).__name__}: {error}"}
                    )
                store.save_cases(batch_id, (updated,))

        await asyncio.gather(*(start_one(case) for case in cases if case.run_id is None and case.status == "pending"))
        await self.refresh(batch_id)

    async def get(self, batch_id: str) -> DatasetBatchRecord:
        record = self.opened().batch(batch_id)
        if record is None:
            raise not_found(f"dataset batch {batch_id} is not in the project database")
        if record.status == "running" and batch_id not in self.tasks:
            store = self.opened()
            interrupted = tuple(
                case.model_copy(update={"status": "start_failed", "error": "Server stopped while starting this case"})
                for case in store.cases(batch_id)
                if case.run_id is None and case.status == "starting"
            )
            if interrupted:
                store.save_cases(batch_id, interrupted)
            if any(case.run_id is None and case.status == "pending" for case in store.cases(batch_id)):
                self._launch(batch_id)
        return await self.refresh(batch_id)

    async def refresh(self, batch_id: str) -> DatasetBatchRecord:
        store = self.opened()
        record = store.batch(batch_id)
        if record is None:
            raise not_found(f"dataset batch {batch_id} is not in the project database")
        cases = store.cases(batch_id)
        semaphore = asyncio.Semaphore(MAX_PARALLEL_REFRESHES)

        async def refresh_one(case: StoredBatchCase) -> StoredBatchCase:
            if case.run_id is None or case.status in TERMINAL:
                return case
            async with semaphore:
                try:
                    snapshot = await self.context.facade.get_run(case.run_id)
                except Exception:
                    return case
            if snapshot.status == case.status and snapshot.cost_usd == case.cost_usd:
                return case
            return case.model_copy(update={"status": snapshot.status, "cost_usd": snapshot.cost_usd})

        refreshed = await asyncio.gather(*(refresh_one(case) for case in cases))
        changed = tuple(case for old, case in zip(cases, refreshed, strict=True) if case != old)
        if changed:
            store.save_cases(batch_id, changed)
        completed = sum(case.status == "completed" for case in refreshed)
        failed = sum(case.status in {"failed", "cancelled", "start_failed"} for case in refreshed)
        finished = completed + failed == len(refreshed)
        updated = record.model_copy(
            update={
                "status": ("failed" if failed else "completed") if finished else "running",
                "finished_at": record.finished_at or (datetime.now(UTC) if finished else None),
                "cases_completed": completed,
                "cases_failed": failed,
                "cost_usd": sum((case.cost_usd for case in refreshed), Decimal(0)),
            }
        )
        if updated != record:
            store.save_batch(updated)
        return updated
