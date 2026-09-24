import asyncio
import json
import sqlite3
from collections.abc import Callable, Generator, Mapping, Sequence
from contextlib import closing, contextmanager
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Final, Self

from pydantic import BaseModel, ConfigDict, TypeAdapter

from aqven.engine.listing import HIDDEN_MODE, SUSPENDED
from aqven.engine.reader import TERMINAL_DBOS_STATUSES
from aqven.engine.summaries.model import (
    QUEUED_DBOS_STATUSES,
    Admission,
    AdmittedRun,
    ObservedStatus,
    OpenRow,
    ProjectedRun,
    SummaryChanges,
    SummarySelection,
    epoch_time,
)
from aqven.runtime.address import RunId
from aqven.runtime.human import HumanWait
from aqven.runtime.runs import Lineage, NodeCounts, RunSummary
from aqven.runtime.vocabulary import RunMode, RunStatus, TerminalRunStatus
from aqven.spec import ArmId, ExperimentId, FlowId, NodeId

SUMMARY_DATABASE: Final = "aqven.sqlite"
SUMMARIES_TABLE: Final = "aqven_run_summaries"
VERSIONS_TABLE: Final = "aqven_schema_versions"
SCHEMA_COMPONENT: Final = "run_summaries"
SCHEMA_VERSION: Final = 1
CONNECT_TIMEOUT: Final = 30
RUNNING: Final[RunStatus] = "running"
QUEUED: Final[RunStatus] = "queued"
TERMINAL_RUN_STATUSES: Final[frozenset[RunStatus]] = frozenset(TERMINAL_DBOS_STATUSES.values())
ZERO_COUNTS: Final = NodeCounts(
    pending=0, running=0, ok=0, failed=0, skipped=0, suspended=0, cancelled=0
).model_dump_json()
NODE_IDS: Final[TypeAdapter[tuple[NodeId, ...]]] = TypeAdapter(tuple[NodeId, ...])
ADMISSION: Final[TypeAdapter[Admission]] = TypeAdapter(Admission)

type SqlParam = str | int
type SqlValue = str | int | None
type SqlCondition = tuple[str, tuple[SqlParam, ...]]
type SelectionRule = Callable[[SummarySelection], SqlCondition | None]


def status_cases() -> str:
    terminal = (f"WHEN '{raw}' THEN '{status}'" for raw, status in TERMINAL_DBOS_STATUSES.items())
    queued = (f"WHEN '{raw}' THEN '{QUEUED}'" for raw in sorted(QUEUED_DBOS_STATUSES))
    return " ".join((*terminal, *queued))


BASE_STATUS: Final = f"COALESCE(finished_status, CASE dbos_status {status_cases()} ELSE '{RUNNING}' END)"

VERSIONS_SCHEMA: Final = f"""
CREATE TABLE IF NOT EXISTS {VERSIONS_TABLE} (
    component TEXT PRIMARY KEY,
    version INTEGER NOT NULL
);
"""

STORED_VERSION: Final = f"SELECT version FROM {VERSIONS_TABLE} WHERE component = ?"

RECORD_VERSION: Final = f"""
INSERT INTO {VERSIONS_TABLE} (component, version) VALUES (?, ?)
ON CONFLICT (component) DO UPDATE SET version = excluded.version
"""

DROP_SUMMARIES: Final = f"DROP TABLE IF EXISTS {SUMMARIES_TABLE}"

SCHEMA: Final = f"""
CREATE TABLE IF NOT EXISTS {SUMMARIES_TABLE} (
    run_id TEXT PRIMARY KEY,
    admission TEXT NOT NULL DEFAULT 'pending' CHECK (admission IN ('pending', 'listed', 'rejected')),
    settled INTEGER NOT NULL DEFAULT 0,
    flow_id TEXT,
    mode TEXT,
    created_at INTEGER,
    forked_from TEXT,
    dataset_item_id TEXT,
    selected_nodes TEXT,
    start_node TEXT,
    end_node TEXT,
    series_id TEXT,
    experiment_id TEXT,
    arm_id TEXT,
    dbos_status TEXT,
    dbos_closed_at INTEGER,
    finished_status TEXT CHECK (finished_status IN ('completed', 'failed', 'cancelled')),
    finished_at TEXT,
    cost_usd TEXT NOT NULL DEFAULT '0',
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    node_counts TEXT NOT NULL DEFAULT '{ZERO_COUNTS}',
    content_hash TEXT NOT NULL DEFAULT '',
    last_seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS {SUMMARIES_TABLE}_by_start
    ON {SUMMARIES_TABLE} (created_at DESC, run_id DESC) WHERE admission = 'listed';
CREATE INDEX IF NOT EXISTS {SUMMARIES_TABLE}_by_flow
    ON {SUMMARIES_TABLE} (flow_id, created_at DESC, run_id DESC) WHERE admission = 'listed';
CREATE INDEX IF NOT EXISTS {SUMMARIES_TABLE}_open
    ON {SUMMARIES_TABLE} (run_id) WHERE admission = 'pending' OR (admission = 'listed' AND settled = 0);
"""

ADMIT: Final = f"""
INSERT INTO {SUMMARIES_TABLE} (
    run_id, admission, flow_id, mode, created_at, forked_from, dataset_item_id, selected_nodes,
    start_node, end_node, series_id, experiment_id, arm_id, dbos_status, dbos_closed_at
) VALUES (?, 'listed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (run_id) DO UPDATE SET
    admission = 'listed',
    flow_id = excluded.flow_id,
    mode = excluded.mode,
    created_at = excluded.created_at,
    forked_from = excluded.forked_from,
    dataset_item_id = excluded.dataset_item_id,
    selected_nodes = excluded.selected_nodes,
    start_node = excluded.start_node,
    end_node = excluded.end_node,
    series_id = excluded.series_id,
    experiment_id = excluded.experiment_id,
    arm_id = excluded.arm_id,
    dbos_status = excluded.dbos_status,
    dbos_closed_at = excluded.dbos_closed_at
"""

REJECT: Final = f"""
INSERT INTO {SUMMARIES_TABLE} (run_id, admission) VALUES (?, 'rejected')
ON CONFLICT (run_id) DO UPDATE SET admission = 'rejected'
"""

OBSERVE: Final = f"UPDATE {SUMMARIES_TABLE} SET dbos_status = ?, dbos_closed_at = ? WHERE run_id = ?"

PROJECT: Final = f"""
INSERT INTO {SUMMARIES_TABLE} (
    run_id, finished_status, finished_at, cost_usd, tokens_in, tokens_out, node_counts, content_hash, last_seq, settled
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (run_id) DO UPDATE SET
    finished_status = excluded.finished_status,
    finished_at = excluded.finished_at,
    cost_usd = excluded.cost_usd,
    tokens_in = excluded.tokens_in,
    tokens_out = excluded.tokens_out,
    node_counts = excluded.node_counts,
    content_hash = excluded.content_hash,
    last_seq = excluded.last_seq,
    settled = MAX({SUMMARIES_TABLE}.settled, excluded.settled)
WHERE excluded.last_seq > {SUMMARIES_TABLE}.last_seq
"""

SETTLE: Final = f"UPDATE {SUMMARIES_TABLE} SET settled = 1 WHERE run_id = ?"

OPEN_ROWS: Final = f"""
SELECT run_id, admission = 'pending', finished_status IS NOT NULL, dbos_status, dbos_closed_at FROM {SUMMARIES_TABLE}
WHERE admission = 'pending' OR (admission = 'listed' AND settled = 0)
"""

ADMISSIONS: Final = f"SELECT run_id, admission FROM {SUMMARIES_TABLE}"

RECORD_COLUMNS: Final = (
    "run_id",
    "flow_id",
    "mode",
    "created_at",
    "forked_from",
    "dataset_item_id",
    "selected_nodes",
    "start_node",
    "end_node",
    "series_id",
    "experiment_id",
    "arm_id",
    "finished_status",
    "finished_at",
    "dbos_closed_at",
    "cost_usd",
    "tokens_in",
    "tokens_out",
    "node_counts",
    "content_hash",
)
RECORD_FIELDS: Final = (*RECORD_COLUMNS, "base_status")
SELECTED: Final = ", ".join((*(f"s.{column}" for column in RECORD_COLUMNS), f"{BASE_STATUS} AS base_status"))
LISTED: Final = "s.admission = 'listed'"
IN_IDS: Final = "IN (SELECT value FROM json_each(?))"
STARTED_ORDER: Final = "s.created_at DESC, s.run_id DESC"

LATEST: Final = f"""
SELECT {SELECTED} FROM (
    SELECT inner_rows.*, ROW_NUMBER() OVER (
        PARTITION BY inner_rows.flow_id ORDER BY inner_rows.created_at DESC, inner_rows.run_id DESC
    ) AS place
    FROM {SUMMARIES_TABLE} AS inner_rows
    WHERE inner_rows.admission = 'listed' AND inner_rows.mode != ? AND inner_rows.flow_id {IN_IDS}
) AS s WHERE s.place = 1
"""


def id_list(values: Sequence[str]) -> str:
    return json.dumps(list(values))


class SummaryRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    run_id: RunId
    flow_id: FlowId
    mode: RunMode
    created_at: int
    forked_from: RunId | None
    dataset_item_id: str | None
    selected_nodes: str | None
    start_node: NodeId | None
    end_node: NodeId | None
    series_id: str | None
    experiment_id: ExperimentId | None
    arm_id: ArmId | None
    finished_status: TerminalRunStatus | None
    finished_at: str | None
    dbos_closed_at: int | None
    cost_usd: str
    tokens_in: int
    tokens_out: int
    node_counts: str
    content_hash: str
    base_status: RunStatus

    def finish_time(self) -> datetime | None:
        if self.finished_at is not None:
            return datetime.fromisoformat(self.finished_at)
        if self.base_status in TERMINAL_RUN_STATUSES:
            return epoch_time(self.dbos_closed_at)
        return None

    def shown_status(self, waits: tuple[HumanWait, ...]) -> RunStatus:
        if self.base_status == RUNNING and waits:
            return SUSPENDED
        return self.base_status

    def summary(self, waits: tuple[HumanWait, ...]) -> RunSummary:
        return RunSummary(
            run_id=self.run_id,
            flow_id=self.flow_id,
            status=self.shown_status(waits),
            mode=self.mode,
            started_at=epoch_time(self.created_at),
            finished_at=self.finish_time(),
            cost_usd=Decimal(self.cost_usd),
            tokens_in=self.tokens_in,
            tokens_out=self.tokens_out,
            node_counts=NodeCounts.model_validate_json(self.node_counts),
            content_hash=self.content_hash,
            definition_changed=False,
            waits=waits,
            lineage=None if self.forked_from is None else Lineage(relation="fork", parent_run_id=self.forked_from),
            dataset_item_id=self.dataset_item_id,
            selected_nodes=None if self.selected_nodes is None else NODE_IDS.validate_json(self.selected_nodes),
            start_node=self.start_node,
            end_node=self.end_node,
            series_id=self.series_id,
            experiment_id=self.experiment_id,
            arm_id=self.arm_id,
        )


def summary_record(row: Sequence[object]) -> SummaryRecord:
    return SummaryRecord.model_validate(dict(zip(RECORD_FIELDS, row, strict=True)))


@dataclass(frozen=True, slots=True)
class SummaryPage:
    rows: tuple[SummaryRecord, ...]
    total: int


def admitted_row(run: AdmittedRun) -> tuple[SqlValue, ...]:
    spec = run.call.spec
    series = spec.series
    selected = None if spec.selected_nodes is None else id_list(spec.selected_nodes)
    return (
        run.status.run_id,
        spec.flow_id,
        spec.mode,
        run.created_at,
        run.forked_from,
        spec.dataset_item_id,
        selected,
        spec.start_node,
        spec.end_node,
        None if series is None else series.series_id,
        None if series is None else series.experiment_id,
        None if series is None else series.arm_id,
        run.status.dbos_status,
        run.status.closed_at,
    )


def observed_row(status: ObservedStatus) -> tuple[SqlValue, ...]:
    return (status.dbos_status, status.closed_at, status.run_id)


def projected_row(run: ProjectedRun) -> tuple[SqlValue, ...]:
    return (
        run.run_id,
        run.finished_status,
        None if run.finished_at is None else run.finished_at.isoformat(),
        str(run.cost_usd),
        run.tokens_in,
        run.tokens_out,
        run.node_counts.model_dump_json(),
        run.content_hash,
        run.last_seq,
        int(run.settled),
    )


def change_batches(changes: SummaryChanges) -> tuple[tuple[str, list[tuple[SqlValue, ...]]], ...]:
    batches: tuple[tuple[str, list[tuple[SqlValue, ...]]], ...] = (
        (ADMIT, [admitted_row(run) for run in changes.admitted]),
        (REJECT, [(run_id,) for run_id in changes.rejected]),
        (OBSERVE, [observed_row(status) for status in changes.observed]),
        (PROJECT, [projected_row(run) for run in changes.projected]),
        (SETTLE, [(run_id,) for run_id in changes.settled]),
    )
    return tuple((statement, rows) for statement, rows in batches if rows)


def _flow_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.flow_id is None else ("s.flow_id = ?", (selection.flow_id,))


def _mode_rule(selection: SummarySelection) -> SqlCondition:
    if selection.mode is None:
        return "s.mode != ?", (HIDDEN_MODE,)
    return "s.mode = ?", (selection.mode,)


def _parent_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.parent_run_id is None else ("s.forked_from = ?", (selection.parent_run_id,))


def _since_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.since_us is None else ("s.created_at * 1000 >= ?", (selection.since_us,))


def _until_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.until_us is None else ("s.created_at * 1000 <= ?", (selection.until_us,))


def _status_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.base_status is None else (f"{BASE_STATUS} = ?", (selection.base_status,))


def _only_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.only is None else (f"s.run_id {IN_IDS}", (id_list(selection.only),))


def _excluded_rule(selection: SummarySelection) -> SqlCondition | None:
    return None if selection.excluded is None else (f"s.run_id NOT {IN_IDS}", (id_list(selection.excluded),))


SELECTION_RULES: Final[tuple[SelectionRule, ...]] = (
    _flow_rule,
    _mode_rule,
    _parent_rule,
    _since_rule,
    _until_rule,
    _status_rule,
    _only_rule,
    _excluded_rule,
)


def where_of(selection: SummarySelection) -> SqlCondition:
    conditions = [condition for rule in SELECTION_RULES if (condition := rule(selection)) is not None]
    clause = " AND ".join((LISTED, *(text for text, _ in conditions)))
    return clause, tuple(param for _, params in conditions for param in params)


@dataclass(frozen=True, slots=True)
class Ordering:
    join: str
    join_params: tuple[SqlParam, ...]
    order: str
    order_params: tuple[SqlParam, ...]


BY_START: Final = Ordering(join="", join_params=(), order=STARTED_ORDER, order_params=())


def ordering_of(selection: SummarySelection) -> Ordering:
    ranks = selection.ranks
    if ranks is None:
        return BY_START
    return Ordering(
        join="LEFT JOIN (SELECT value AS ranked_id, key AS place FROM json_each(?)) AS ranks "
        "ON ranks.ranked_id = s.run_id",
        join_params=(id_list(ranks),),
        order="COALESCE(ranks.place, ?), s.created_at DESC, s.run_id ASC",
        order_params=(len(ranks),),
    )


def page_statement(selection: SummarySelection) -> SqlCondition:
    where, params = where_of(selection)
    ordering = ordering_of(selection)
    statement = (
        f"SELECT {SELECTED} FROM {SUMMARIES_TABLE} AS s {ordering.join} "
        f"WHERE {where} ORDER BY {ordering.order} LIMIT ? OFFSET ?"
    )
    return statement, (*ordering.join_params, *params, *ordering.order_params, selection.limit, selection.offset)


def count_statement(selection: SummarySelection) -> SqlCondition:
    where, params = where_of(selection)
    return f"SELECT COUNT(*) FROM {SUMMARIES_TABLE} AS s WHERE {where}", params


@dataclass(frozen=True, slots=True)
class SqliteRunSummaryStore:
    path: Path

    @classmethod
    def open(cls, path: Path) -> Self:
        store = cls(path)
        store.migrate()
        return store

    def migrate(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(VERSIONS_SCHEMA)
            stored: tuple[int] | None = connection.execute(STORED_VERSION, (SCHEMA_COMPONENT,)).fetchone()
            if stored is not None and stored[0] != SCHEMA_VERSION:
                connection.execute(DROP_SUMMARIES)
            connection.executescript(SCHEMA)
            connection.execute(RECORD_VERSION, (SCHEMA_COMPONENT, SCHEMA_VERSION))

    async def apply(self, changes: SummaryChanges) -> None:
        await asyncio.to_thread(self._apply, changes)

    async def admissions(self) -> Mapping[RunId, Admission]:
        return await asyncio.to_thread(self._admissions)

    async def open_rows(self) -> tuple[OpenRow, ...]:
        return await asyncio.to_thread(self._open_rows)

    async def page(self, selection: SummarySelection) -> SummaryPage:
        return await asyncio.to_thread(self._page, selection)

    async def latest(self, flow_ids: Sequence[FlowId]) -> tuple[SummaryRecord, ...]:
        return await asyncio.to_thread(self._latest, tuple(flow_ids))

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=CONNECT_TIMEOUT)) as connection, connection:
            connection.execute("PRAGMA synchronous=NORMAL")
            yield connection

    def _apply(self, changes: SummaryChanges) -> None:
        with self._connection() as connection:
            for statement, rows in change_batches(changes):
                connection.executemany(statement, rows)

    def _admissions(self) -> Mapping[RunId, Admission]:
        with self._connection() as connection:
            rows: list[tuple[str, str]] = connection.execute(ADMISSIONS).fetchall()
        return {RunId(run_id): ADMISSION.validate_python(admission) for run_id, admission in rows}

    def _open_rows(self) -> tuple[OpenRow, ...]:
        with self._connection() as connection:
            rows: list[tuple[str, int, int, str | None, int | None]] = connection.execute(OPEN_ROWS).fetchall()
        return tuple(
            OpenRow(
                run_id=RunId(run_id),
                pending=bool(pending),
                finished=bool(finished),
                dbos_status=dbos_status,
                closed_at=closed_at,
            )
            for run_id, pending, finished, dbos_status, closed_at in rows
        )

    def _page(self, selection: SummarySelection) -> SummaryPage:
        statement, params = page_statement(selection)
        counting, counted = count_statement(selection)
        with self._connection() as connection:
            rows: list[tuple[object, ...]] = connection.execute(statement, params).fetchall()
            total: tuple[int] = connection.execute(counting, counted).fetchone()
        return SummaryPage(rows=tuple(summary_record(row) for row in rows), total=total[0])

    def _latest(self, flow_ids: tuple[FlowId, ...]) -> tuple[SummaryRecord, ...]:
        with self._connection() as connection:
            rows: list[tuple[object, ...]] = connection.execute(LATEST, (HIDDEN_MODE, id_list(flow_ids))).fetchall()
        return tuple(summary_record(row) for row in rows)
