import asyncio
import sqlite3
from collections.abc import Callable, Generator, Mapping, Sequence
from contextlib import closing, contextmanager
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Final, Self

from aqven.series.model import (
    AttemptRecord,
    CaseSnapshot,
    ExperimentOrigin,
    SeriesChange,
    SeriesId,
    SeriesRecord,
    SeriesStatus,
)
from aqven.series.views import SeriesListQuery
from aqven.spec import ExperimentId, VariantId

SERIES_TABLE: Final = "aqven_series"
CASES_TABLE: Final = "aqven_series_cases"
ATTEMPTS_TABLE: Final = "aqven_series_attempts"
VERSIONS_TABLE: Final = "aqven_schema_versions"
SCHEMA_COMPONENT: Final = "series"
SCHEMA_VERSION: Final = 1
CONNECT_TIMEOUT: Final = 30
LOOK_QUESTION: Final = "look"
CURSOR_SEPARATOR: Final = "/"
ZERO: Final = Decimal(0)

SCHEMA: Final = f"""
CREATE TABLE IF NOT EXISTS {VERSIONS_TABLE} (
    component TEXT PRIMARY KEY,
    version INTEGER NOT NULL
);
INSERT OR IGNORE INTO {VERSIONS_TABLE} (component, version) VALUES ('{SCHEMA_COMPONENT}', {SCHEMA_VERSION});

CREATE TABLE IF NOT EXISTS {SERIES_TABLE} (
    series_id TEXT PRIMARY KEY,
    experiment_id TEXT,
    flow_id TEXT,
    dataset_id TEXT NOT NULL,
    split TEXT NOT NULL CHECK (split IN ('dev', 'holdout')),
    question TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'running', 'done', 'cancelled', 'failed')),
    created_at REAL NOT NULL,
    finished_at REAL,
    record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {SERIES_TABLE}_by_experiment ON {SERIES_TABLE} (experiment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS {SERIES_TABLE}_by_flow ON {SERIES_TABLE} (flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS {SERIES_TABLE}_by_status ON {SERIES_TABLE} (status, created_at DESC);

CREATE TABLE IF NOT EXISTS {CASES_TABLE} (
    series_id TEXT NOT NULL,
    case_index INTEGER NOT NULL,
    case_name TEXT NOT NULL,
    split TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (series_id, case_index),
    UNIQUE (series_id, case_name)
);

CREATE TABLE IF NOT EXISTS {ATTEMPTS_TABLE} (
    attempt_id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    variant_id TEXT NOT NULL,
    case_name TEXT NOT NULL,
    repeat INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('running', 'finished')),
    outcome TEXT,
    cost_usd TEXT NOT NULL DEFAULT '0',
    check_cost_usd TEXT NOT NULL DEFAULT '0',
    started_at REAL NOT NULL,
    finished_at REAL,
    record TEXT NOT NULL,
    UNIQUE (series_id, ordinal)
);
CREATE INDEX IF NOT EXISTS {ATTEMPTS_TABLE}_by_case ON {ATTEMPTS_TABLE} (series_id, case_name, variant_id, repeat);
CREATE INDEX IF NOT EXISTS {ATTEMPTS_TABLE}_by_run ON {ATTEMPTS_TABLE} (run_id);
CREATE INDEX IF NOT EXISTS {ATTEMPTS_TABLE}_by_variant ON {ATTEMPTS_TABLE} (variant_id, finished_at DESC);
"""

INSERT_SERIES: Final = f"""
INSERT INTO {SERIES_TABLE}
    (series_id, experiment_id, flow_id, dataset_id, split, question, status, created_at, finished_at, record)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (series_id) DO NOTHING
"""

INSERT_CASE: Final = f"""
INSERT OR IGNORE INTO {CASES_TABLE} (series_id, case_index, case_name, split, payload) VALUES (?, ?, ?, ?, ?)
"""

UPDATE_SERIES: Final = f"UPDATE {SERIES_TABLE} SET status = ?, finished_at = ?, record = ? WHERE series_id = ?"
FIND_SERIES: Final = f"SELECT record FROM {SERIES_TABLE} WHERE series_id = ?"
FIND_CASE: Final = f"SELECT payload FROM {CASES_TABLE} WHERE series_id = ? AND case_index = ?"
LIST_CASES: Final = f"SELECT payload FROM {CASES_TABLE} WHERE series_id = ? ORDER BY case_index"

OPEN_ATTEMPT: Final = f"""
INSERT INTO {ATTEMPTS_TABLE}
    (attempt_id, series_id, ordinal, variant_id, case_name, repeat, run_id, state, outcome,
     cost_usd, check_cost_usd, started_at, finished_at, record)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (attempt_id) DO NOTHING
"""

CLOSE_ATTEMPT: Final = f"""
INSERT INTO {ATTEMPTS_TABLE}
    (attempt_id, series_id, ordinal, variant_id, case_name, repeat, run_id, state, outcome,
     cost_usd, check_cost_usd, started_at, finished_at, record)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (attempt_id) DO UPDATE SET
    state = excluded.state,
    outcome = excluded.outcome,
    cost_usd = excluded.cost_usd,
    check_cost_usd = excluded.check_cost_usd,
    finished_at = excluded.finished_at,
    record = excluded.record
"""

LIST_ATTEMPTS: Final = f"SELECT record FROM {ATTEMPTS_TABLE} WHERE series_id = ? ORDER BY ordinal"
SPEND: Final = f"SELECT cost_usd, check_cost_usd FROM {ATTEMPTS_TABLE} WHERE series_id = ? AND state = 'finished'"
HISTORY: Final = f"""
SELECT attempts.record FROM {ATTEMPTS_TABLE} AS attempts
JOIN {SERIES_TABLE} AS series USING (series_id)
WHERE series.experiment_id = ? AND attempts.variant_id = ? AND attempts.state = 'finished'
ORDER BY attempts.finished_at DESC
LIMIT ?
"""

type SqlParam = str | float | int | None
type SqlCondition = tuple[str, tuple[SqlParam, ...]]
type ConditionRule = Callable[[SeriesListQuery], SqlCondition | None]


class SeriesMissing(LookupError):
    def __init__(self, series_id: str) -> None:
        super().__init__(f"series {series_id} is not in the project database")
        self.series_id = series_id


class CaseMissing(LookupError):
    def __init__(self, series_id: str, case_index: int) -> None:
        super().__init__(f"series {series_id} has no case with index {case_index}")
        self.series_id = series_id
        self.case_index = case_index


class InvalidCursor(ValueError):
    def __init__(self, cursor: str) -> None:
        super().__init__(f"cursor {cursor!r} is not a series list cursor")
        self.cursor = cursor


@dataclass(frozen=True, slots=True)
class SeriesCursor:
    created_at: float
    series_id: str

    def text(self) -> str:
        return f"{self.created_at!r}{CURSOR_SEPARATOR}{self.series_id}"


def series_cursor(record: SeriesRecord) -> str:
    return SeriesCursor(record.created_at.timestamp(), record.series_id).text()


def parse_cursor(text: str) -> SeriesCursor:
    moment, separator, series_id = text.partition(CURSOR_SEPARATOR)
    if not separator or not series_id:
        raise InvalidCursor(text)
    try:
        return SeriesCursor(float(moment), series_id)
    except ValueError as error:
        raise InvalidCursor(text) from error


def stored_status(status: SeriesStatus) -> SeriesStatus:
    return SeriesStatus.RUNNING if status is SeriesStatus.WAITING_HUMAN else status


def _experiment_rule(query: SeriesListQuery) -> SqlCondition | None:
    return None if query.experiment_id is None else ("experiment_id = ?", (query.experiment_id,))


def _flow_rule(query: SeriesListQuery) -> SqlCondition | None:
    return None if query.flow_id is None else ("flow_id = ?", (query.flow_id,))


def _status_rule(query: SeriesListQuery) -> SqlCondition | None:
    return None if query.status is None else ("status = ?", (stored_status(query.status).value,))


def _cursor_rule(query: SeriesListQuery) -> SqlCondition | None:
    if query.cursor is None:
        return None
    cursor = parse_cursor(query.cursor)
    clause = "(created_at < ? OR (created_at = ? AND series_id < ?))"
    return clause, (cursor.created_at, cursor.created_at, cursor.series_id)


CONDITION_RULES: Final[tuple[ConditionRule, ...]] = (_experiment_rule, _flow_rule, _status_rule, _cursor_rule)


def search_statement(query: SeriesListQuery, limit: int) -> tuple[str, tuple[SqlParam, ...]]:
    conditions = [condition for rule in CONDITION_RULES if (condition := rule(query)) is not None]
    where = " AND ".join(clause for clause, _ in conditions) or "1 = 1"
    params = tuple(param for _, values in conditions for param in values)
    statement = f"SELECT record FROM {SERIES_TABLE} WHERE {where} ORDER BY created_at DESC, series_id DESC LIMIT ?"
    return statement, (*params, limit)


def stamp(moment: datetime | None) -> float | None:
    return None if moment is None else moment.timestamp()


def experiment_of(record: SeriesRecord) -> ExperimentId | None:
    origin = record.origin
    return origin.experiment_id if isinstance(origin, ExperimentOrigin) else None


def question_of(record: SeriesRecord) -> str:
    question = record.plan.question
    return LOOK_QUESTION if question is None else question.kind


def series_row(record: SeriesRecord) -> tuple[SqlParam, ...]:
    return (
        record.series_id,
        experiment_of(record),
        record.flow_id,
        record.dataset_id,
        record.on.value,
        question_of(record),
        stored_status(record.status).value,
        record.created_at.timestamp(),
        stamp(record.finished_at),
        record.model_dump_json(),
    )


def case_row(series_id: SeriesId, case: CaseSnapshot) -> tuple[SqlParam, ...]:
    return (series_id, case.case_index, case.name, case.split.value, case.model_dump_json())


def attempt_row(attempt: AttemptRecord) -> tuple[SqlParam, ...]:
    return (
        attempt.attempt_id,
        attempt.series_id,
        attempt.ordinal,
        attempt.variant_id,
        attempt.case_name,
        attempt.repeat,
        attempt.run_id,
        attempt.state.value,
        None if attempt.outcome is None else attempt.outcome.value,
        str(attempt.cost_usd),
        str(attempt.check_cost_usd),
        attempt.started_at.timestamp(),
        stamp(attempt.finished_at),
        attempt.model_dump_json(),
    )


def changed_fields(change: SeriesChange) -> Mapping[str, object]:
    fields: Mapping[str, object | None] = {
        "status": change.status,
        "approved_by": change.approved_by,
        "approved_at": change.approved_at,
        "finished_at": change.finished_at,
        "stop": change.stop,
        "verdict": change.verdict,
        "analysis": change.analysis,
        "finding_path": change.finding_path,
        "error": change.error,
    }
    return {name: value for name, value in fields.items() if value is not None}


def changed_record(record: SeriesRecord, change: SeriesChange) -> SeriesRecord:
    return record.model_copy(update=dict(changed_fields(change)))


def decimal_sum(rows: Sequence[tuple[str, str]]) -> Decimal:
    return sum((Decimal(cost) + Decimal(checks) for cost, checks in rows), ZERO)


@dataclass(frozen=True, slots=True)
class SqliteSeriesStore:
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
            connection.executescript(SCHEMA)

    async def create(self, series: SeriesRecord, cases: Sequence[CaseSnapshot]) -> bool:
        return await asyncio.to_thread(self._create, series, tuple(cases))

    async def series(self, series_id: SeriesId) -> SeriesRecord | None:
        return await asyncio.to_thread(self._series, series_id)

    async def update(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord:
        return await asyncio.to_thread(self._update, series_id, change)

    async def search(self, query: SeriesListQuery, limit: int) -> tuple[SeriesRecord, ...]:
        return await asyncio.to_thread(self._search, query, limit)

    async def case(self, series_id: SeriesId, case_index: int) -> CaseSnapshot:
        return await asyncio.to_thread(self._case, series_id, case_index)

    async def cases(self, series_id: SeriesId) -> tuple[CaseSnapshot, ...]:
        return await asyncio.to_thread(self._cases, series_id)

    async def open_attempt(self, attempt: AttemptRecord) -> None:
        await asyncio.to_thread(self._write_attempt, OPEN_ATTEMPT, attempt)

    async def close_attempt(self, attempt: AttemptRecord) -> None:
        await asyncio.to_thread(self._write_attempt, CLOSE_ATTEMPT, attempt)

    async def attempts(self, series_id: SeriesId) -> tuple[AttemptRecord, ...]:
        return await asyncio.to_thread(self._attempts, series_id)

    async def spend(self, series_id: SeriesId) -> Decimal:
        return await asyncio.to_thread(self._spend, series_id)

    async def history(
        self, experiment_id: ExperimentId, variant_id: VariantId, limit: int
    ) -> tuple[AttemptRecord, ...]:
        return await asyncio.to_thread(self._history, experiment_id, variant_id, limit)

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=CONNECT_TIMEOUT)) as connection, connection:
            yield connection

    def _create(self, series: SeriesRecord, cases: tuple[CaseSnapshot, ...]) -> bool:
        with self._connection() as connection:
            inserted = connection.execute(INSERT_SERIES, series_row(series)).rowcount
            if inserted == 0:
                return False
            connection.executemany(INSERT_CASE, [case_row(series.series_id, case) for case in cases])
        return True

    def _series(self, series_id: SeriesId) -> SeriesRecord | None:
        with self._connection() as connection:
            row: tuple[str] | None = connection.execute(FIND_SERIES, (series_id,)).fetchone()
        return None if row is None else SeriesRecord.model_validate_json(row[0])

    def _update(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row: tuple[str] | None = connection.execute(FIND_SERIES, (series_id,)).fetchone()
            if row is None:
                raise SeriesMissing(series_id)
            updated = changed_record(SeriesRecord.model_validate_json(row[0]), change)
            row_values = (stored_status(updated.status).value, stamp(updated.finished_at), updated.model_dump_json())
            connection.execute(UPDATE_SERIES, (*row_values, series_id))
        return updated

    def _search(self, query: SeriesListQuery, limit: int) -> tuple[SeriesRecord, ...]:
        statement, params = search_statement(query, limit)
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(statement, params).fetchall()
        return tuple(SeriesRecord.model_validate_json(row[0]) for row in rows)

    def _case(self, series_id: SeriesId, case_index: int) -> CaseSnapshot:
        with self._connection() as connection:
            row: tuple[str] | None = connection.execute(FIND_CASE, (series_id, case_index)).fetchone()
        if row is None:
            raise CaseMissing(series_id, case_index)
        return CaseSnapshot.model_validate_json(row[0])

    def _cases(self, series_id: SeriesId) -> tuple[CaseSnapshot, ...]:
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(LIST_CASES, (series_id,)).fetchall()
        return tuple(CaseSnapshot.model_validate_json(row[0]) for row in rows)

    def _write_attempt(self, statement: str, attempt: AttemptRecord) -> None:
        with self._connection() as connection:
            connection.execute(statement, attempt_row(attempt))

    def _attempts(self, series_id: SeriesId) -> tuple[AttemptRecord, ...]:
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(LIST_ATTEMPTS, (series_id,)).fetchall()
        return tuple(AttemptRecord.model_validate_json(row[0]) for row in rows)

    def _spend(self, series_id: SeriesId) -> Decimal:
        with self._connection() as connection:
            rows: list[tuple[str, str]] = connection.execute(SPEND, (series_id,)).fetchall()
        return decimal_sum(rows)

    def _history(self, experiment_id: ExperimentId, variant_id: VariantId, limit: int) -> tuple[AttemptRecord, ...]:
        with self._connection() as connection:
            rows: list[tuple[str]] = connection.execute(HISTORY, (experiment_id, variant_id, limit)).fetchall()
        return tuple(AttemptRecord.model_validate_json(row[0]) for row in rows)
