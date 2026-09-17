import asyncio
import sqlite3
from collections.abc import Callable, Generator
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Final, Protocol

from pydantic import AwareDatetime, Field

from aqven.engine.human.keys import address_key
from aqven.engine.human.records import WaitRecord
from aqven.runtime.address import ExecutionAddress, RequestModel, ResourceModel, RunId
from aqven.runtime.human import HumanWait
from aqven.runtime.vocabulary import OnTimeoutAction, WaitKind, WaitState
from aqven.spec import TypeId

ASSIGNEE_ANYONE: Final = "me"


class WaitIndexEntry(ResourceModel):
    run_id: RunId
    workflow_id: str
    address: ExecutionAddress
    wait_kind: WaitKind
    attempt: Annotated[int, Field(ge=1)]
    state: WaitState
    assignee: str
    waiting_since: AwareDatetime
    deadline_at: AwareDatetime
    on_timeout: OnTimeoutAction
    form_type_id: TypeId


class WaitQuery(RequestModel):
    run_id: RunId | None = None
    state: WaitState | None = "waiting"
    assignee: str | None = None
    deadline_before: AwareDatetime | None = None
    overdue_at: AwareDatetime | None = None
    limit: Annotated[int, Field(ge=1)] | None = None


class WaitIndex(Protocol):
    async def record(self, entry: WaitIndexEntry) -> None: ...

    async def find(self, run_id: RunId, address: ExecutionAddress) -> WaitIndexEntry | None: ...

    async def search(self, query: WaitQuery) -> tuple[WaitIndexEntry, ...]: ...


def index_entry(record: WaitRecord) -> WaitIndexEntry:
    return WaitIndexEntry(
        run_id=record.run_id,
        workflow_id=record.workflow_id,
        address=record.address,
        wait_kind=record.wait_kind,
        attempt=record.attempt,
        state=record.state,
        assignee=record.assignee,
        waiting_since=record.waiting_since,
        deadline_at=record.deadline_at,
        on_timeout=record.on_timeout,
        form_type_id=record.form_type_id,
    )


def entry_wait(entry: WaitIndexEntry) -> HumanWait:
    return HumanWait.model_validate(entry.model_dump(exclude={"run_id", "workflow_id"}))


type SqlParam = str | float | int
type SqlCondition = tuple[str, SqlParam]
type ConditionRule = Callable[[WaitQuery], SqlCondition | None]

WAITS_TABLE: Final = "aqven_human_waits"

SCHEMA: Final = f"""
CREATE TABLE IF NOT EXISTS {WAITS_TABLE} (
    run_id TEXT NOT NULL,
    address_key TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    state TEXT NOT NULL,
    assignee TEXT NOT NULL,
    deadline_at REAL NOT NULL,
    entry TEXT NOT NULL,
    PRIMARY KEY (run_id, address_key)
);
CREATE INDEX IF NOT EXISTS {WAITS_TABLE}_open ON {WAITS_TABLE} (state, deadline_at, run_id);
"""

UPSERT: Final = f"""
INSERT INTO {WAITS_TABLE} (run_id, address_key, workflow_id, state, assignee, deadline_at, entry)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (run_id, address_key) DO UPDATE SET
    workflow_id = excluded.workflow_id,
    state = excluded.state,
    assignee = excluded.assignee,
    deadline_at = excluded.deadline_at,
    entry = excluded.entry
"""

FIND: Final = f"SELECT entry FROM {WAITS_TABLE} WHERE run_id = ? AND address_key = ?"


def _run_rule(query: WaitQuery) -> SqlCondition | None:
    return None if query.run_id is None else ("run_id = ?", query.run_id)


def _state_rule(query: WaitQuery) -> SqlCondition | None:
    return None if query.state is None else ("state = ?", query.state)


def _assignee_rule(query: WaitQuery) -> SqlCondition | None:
    if query.assignee is None or query.assignee == ASSIGNEE_ANYONE:
        return None
    return ("assignee = ?", query.assignee)


def _deadline_rule(query: WaitQuery) -> SqlCondition | None:
    return None if query.deadline_before is None else ("deadline_at < ?", query.deadline_before.timestamp())


def _overdue_rule(query: WaitQuery) -> SqlCondition | None:
    return None if query.overdue_at is None else ("deadline_at < ?", query.overdue_at.timestamp())


CONDITION_RULES: Final[tuple[ConditionRule, ...]] = (
    _run_rule,
    _state_rule,
    _assignee_rule,
    _deadline_rule,
    _overdue_rule,
)


def search_statement(query: WaitQuery) -> tuple[str, tuple[SqlParam, ...]]:
    conditions = [condition for rule in CONDITION_RULES if (condition := rule(query)) is not None]
    where = " AND ".join(clause for clause, _ in conditions) or "1 = 1"
    limit = "" if query.limit is None else f" LIMIT {query.limit}"
    statement = f"SELECT entry FROM {WAITS_TABLE} WHERE {where} ORDER BY deadline_at, run_id, address_key{limit}"
    return statement, tuple(param for _, param in conditions)


@dataclass(frozen=True, slots=True)
class SqliteWaitIndex:
    path: Path

    @classmethod
    def open(cls, path: Path) -> SqliteWaitIndex:
        index = cls(path)
        index.migrate()
        return index

    def migrate(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)

    async def record(self, entry: WaitIndexEntry) -> None:
        await asyncio.to_thread(self._record, entry)

    async def find(self, run_id: RunId, address: ExecutionAddress) -> WaitIndexEntry | None:
        return await asyncio.to_thread(self._find, run_id, address)

    async def search(self, query: WaitQuery) -> tuple[WaitIndexEntry, ...]:
        return await asyncio.to_thread(self._search, query)

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=30)) as connection, connection:
            yield connection

    def _record(self, entry: WaitIndexEntry) -> None:
        row = (
            entry.run_id,
            address_key(entry.address),
            entry.workflow_id,
            entry.state,
            entry.assignee,
            entry.deadline_at.timestamp(),
            entry.model_dump_json(),
        )
        with self._connection() as connection:
            connection.execute(UPSERT, row)

    def _find(self, run_id: RunId, address: ExecutionAddress) -> WaitIndexEntry | None:
        with self._connection() as connection:
            row: tuple[str] | None = connection.execute(FIND, (run_id, address_key(address))).fetchone()
        if row is None:
            return None
        return WaitIndexEntry.model_validate_json(row[0])

    def _search(self, query: WaitQuery) -> tuple[WaitIndexEntry, ...]:
        statement, params = search_statement(query)
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(statement, params).fetchall()
        return tuple(WaitIndexEntry.model_validate_json(row[0]) for row in rows)
