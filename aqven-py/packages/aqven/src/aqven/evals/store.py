import sqlite3
from collections.abc import Callable, Generator, Sequence
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Final, Protocol

from pydantic import Field

from aqven.evals.records import CaseRecord, EvalRunId, EvalRunRecord
from aqven.runtime.address import RequestModel
from aqven.spec import EvalId

RUNS_TABLE: Final = "aqven_eval_runs"
CASES_TABLE: Final = "aqven_eval_cases"
CONNECT_TIMEOUT: Final = 30

SCHEMA: Final = f"""
CREATE TABLE IF NOT EXISTS {RUNS_TABLE} (
    eval_run_id TEXT PRIMARY KEY,
    eval_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at REAL NOT NULL,
    record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {RUNS_TABLE}_recent ON {RUNS_TABLE} (eval_id, started_at DESC);
CREATE TABLE IF NOT EXISTS {CASES_TABLE} (
    eval_run_id TEXT NOT NULL,
    case_name TEXT NOT NULL,
    run_index INTEGER NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (eval_run_id, case_name, run_index)
);
"""

UPSERT_RUN: Final = f"""
INSERT INTO {RUNS_TABLE} (eval_run_id, eval_id, dataset_id, status, started_at, record)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (eval_run_id) DO UPDATE SET
    status = excluded.status,
    record = excluded.record
"""

UPSERT_CASE: Final = f"""
INSERT INTO {CASES_TABLE} (eval_run_id, case_name, run_index, record)
VALUES (?, ?, ?, ?)
ON CONFLICT (eval_run_id, case_name, run_index) DO UPDATE SET record = excluded.record
"""

FIND_RUN: Final = f"SELECT record FROM {RUNS_TABLE} WHERE eval_run_id = ?"
LIST_CASES: Final = f"SELECT record FROM {CASES_TABLE} WHERE eval_run_id = ? ORDER BY case_name, run_index"

type SqlParam = str | float | int
type SqlCondition = tuple[str, SqlParam]


class EvalRunQuery(RequestModel):
    eval_id: EvalId | None = None
    status: str | None = None
    limit: Annotated[int, Field(ge=1, le=500)] = 50


def _eval_rule(query: EvalRunQuery) -> SqlCondition | None:
    return None if query.eval_id is None else ("eval_id = ?", query.eval_id)


def _status_rule(query: EvalRunQuery) -> SqlCondition | None:
    return None if query.status is None else ("status = ?", query.status)


CONDITION_RULES: Final[tuple[Callable[[EvalRunQuery], SqlCondition | None], ...]] = (_eval_rule, _status_rule)


def search_statement(query: EvalRunQuery) -> tuple[str, tuple[SqlParam, ...]]:
    conditions = [condition for rule in CONDITION_RULES if (condition := rule(query)) is not None]
    where = " AND ".join(clause for clause, _ in conditions) or "1 = 1"
    statement = (
        f"SELECT record FROM {RUNS_TABLE} WHERE {where} ORDER BY started_at DESC, eval_run_id DESC LIMIT {query.limit}"
    )
    return statement, tuple(param for _, param in conditions)


class EvalStore(Protocol):
    async def save_run(self, record: EvalRunRecord) -> None: ...

    async def save_cases(self, eval_run_id: EvalRunId, cases: Sequence[CaseRecord]) -> None: ...

    async def run(self, eval_run_id: EvalRunId) -> EvalRunRecord | None: ...

    async def search(self, query: EvalRunQuery) -> tuple[EvalRunRecord, ...]: ...

    async def cases(self, eval_run_id: EvalRunId) -> tuple[CaseRecord, ...]: ...


@dataclass(frozen=True, slots=True)
class SqliteEvalStore:
    path: Path

    @classmethod
    def open(cls, path: Path) -> SqliteEvalStore:
        store = cls(path)
        store.migrate()
        return store

    def migrate(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)

    async def save_run(self, record: EvalRunRecord) -> None:
        self._save_run(record)

    async def save_cases(self, eval_run_id: EvalRunId, cases: Sequence[CaseRecord]) -> None:
        self._save_cases(eval_run_id, tuple(cases))

    async def run(self, eval_run_id: EvalRunId) -> EvalRunRecord | None:
        return self._run(eval_run_id)

    async def search(self, query: EvalRunQuery) -> tuple[EvalRunRecord, ...]:
        return self._search(query)

    async def cases(self, eval_run_id: EvalRunId) -> tuple[CaseRecord, ...]:
        return self._cases(eval_run_id)

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=CONNECT_TIMEOUT)) as connection, connection:
            yield connection

    def _save_run(self, record: EvalRunRecord) -> None:
        row = (
            record.eval_run_id,
            record.eval_id,
            record.dataset_id,
            record.status,
            record.started_at.timestamp(),
            record.model_dump_json(),
        )
        with self._connection() as connection:
            connection.execute(UPSERT_RUN, row)

    def _save_cases(self, eval_run_id: EvalRunId, cases: Sequence[CaseRecord]) -> None:
        rows = [(eval_run_id, case.case_name, case.run_index, case.model_dump_json()) for case in cases]
        with self._connection() as connection:
            connection.executemany(UPSERT_CASE, rows)

    def _run(self, eval_run_id: EvalRunId) -> EvalRunRecord | None:
        with self._connection() as connection:
            row: tuple[str] | None = connection.execute(FIND_RUN, (eval_run_id,)).fetchone()
        return None if row is None else EvalRunRecord.model_validate_json(row[0])

    def _search(self, query: EvalRunQuery) -> tuple[EvalRunRecord, ...]:
        statement, params = search_statement(query)
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(statement, params).fetchall()
        return tuple(EvalRunRecord.model_validate_json(row[0]) for row in rows)

    def _cases(self, eval_run_id: EvalRunId) -> tuple[CaseRecord, ...]:
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(LIST_CASES, (eval_run_id,)).fetchall()
        return tuple(CaseRecord.model_validate_json(row[0]) for row in rows)
