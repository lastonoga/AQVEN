import sqlite3
from collections.abc import Callable, Generator
from contextlib import closing, contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from pydantic import JsonValue, TypeAdapter

from aqven.app.host_os import ensure_private_file
from aqven.ports.settings import SettingKey, SettingScope, SettingView, setting_key

BUSY_TIMEOUT_SECONDS: Final = 5.0
SCHEMA_VERSION: Final = 2
LEGACY_TABLE: Final = "settings"
CREATE_TABLE: Final = """
CREATE TABLE IF NOT EXISTS setting_values (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""
HAS_LEGACY_TABLE: Final = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
COPY_LEGACY_VALUES: Final = """
INSERT OR IGNORE INTO setting_values (key, value_json, updated_at)
SELECT key, value_json, updated_at FROM settings WHERE kind = 'value' AND value_json IS NOT NULL
"""
DROP_LEGACY_TABLE: Final = "DROP TABLE settings"
UPSERT: Final = """
INSERT INTO setting_values (key, value_json, updated_at) VALUES (?, ?, ?)
ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
"""
SELECT_ALL: Final = "SELECT key, value_json, updated_at FROM setting_values ORDER BY key"
SELECT_ONE: Final = "SELECT key, value_json, updated_at FROM setting_values WHERE key = ?"
DELETE_ONE: Final = "DELETE FROM setting_values WHERE key = ?"

JSON_VALUE: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)

type ValueRow = tuple[object, object, object]


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class StoredValue:
    key: SettingKey
    value: JsonValue
    updated_at: datetime

    def view(self, scope: SettingScope) -> SettingView:
        return SettingView(scope=scope, key=self.key, kind="value", value=self.value, updated_at=self.updated_at)


def stored_value(row: ValueRow) -> StoredValue:
    value = JSON_VALUE.validate_json(str(row[1]))
    return StoredValue(setting_key(str(row[0])), value, datetime.fromisoformat(str(row[2])))


def _value_row(cursor: sqlite3.Cursor, row: tuple[object, ...]) -> ValueRow:
    return (row[0], row[1], row[2])


def drop_legacy_secrets(connection: sqlite3.Connection) -> bool:
    if connection.execute(HAS_LEGACY_TABLE, (LEGACY_TABLE,)).fetchone() is None:
        return False
    connection.execute("PRAGMA secure_delete = ON")
    connection.execute("BEGIN IMMEDIATE")
    connection.execute(COPY_LEGACY_VALUES)
    connection.execute(DROP_LEGACY_TABLE)
    connection.execute("COMMIT")
    connection.execute("VACUUM")
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return True


@dataclass(frozen=True, slots=True)
class SettingValuesDatabase:
    path: Path
    clock: Callable[[], datetime] = field(default=utc_now)

    @classmethod
    def open(cls, path: Path, clock: Callable[[], datetime] = utc_now) -> SettingValuesDatabase:
        ensure_private_file(path)
        database = cls(path, clock)
        database.migrate()
        return database

    def migrate(self) -> bool:
        with closing(sqlite3.connect(self.path, timeout=BUSY_TIMEOUT_SECONDS, autocommit=True)) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(CREATE_TABLE)
            dropped = drop_legacy_secrets(connection)
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        return dropped

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=BUSY_TIMEOUT_SECONDS, autocommit=False)) as connection:
            connection.row_factory = _value_row
            with connection:
                yield connection

    def all(self) -> tuple[StoredValue, ...]:
        with self.transaction() as connection:
            rows: list[ValueRow] = connection.execute(SELECT_ALL).fetchall()
        return tuple(stored_value(row) for row in rows)

    def get(self, key: SettingKey) -> StoredValue | None:
        with self.transaction() as connection:
            row: ValueRow | None = connection.execute(SELECT_ONE, (key,)).fetchone()
        return None if row is None else stored_value(row)

    def put(self, key: SettingKey, value: JsonValue) -> StoredValue:
        stored = StoredValue(key, JSON_VALUE.validate_python(value), self.clock())
        value_json = JSON_VALUE.dump_json(stored.value).decode()
        with self.transaction() as connection:
            connection.execute(UPSERT, (stored.key, value_json, stored.updated_at.isoformat()))
        return stored

    def delete(self, key: SettingKey) -> bool:
        with self.transaction() as connection:
            removed = connection.execute(DELETE_ONE, (key,)).rowcount
        return removed > 0
