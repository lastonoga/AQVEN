import asyncio
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from functools import cache
from itertools import takewhile
from typing import Final, Self

import dbos._dbos as dbos_runtime
from dbos import WorkflowStatus
from dbos import error as dbos_errors
from dbos._schemas.system_database import SystemSchema
from dbos._serialization import deserialize_value, safe_deserialize
from dbos._sys_db import SystemDatabase, db_retry, is_stream_closed_sentinel

from aqven.runtime.address import RunId

DBOS_INSTANCE_SLOT: Final = "_dbos_global_instance"
SYSTEM_DATABASE_SLOT: Final = "_sys_db_field"
STREAM_COLUMNS: Final = frozenset({"workflow_uuid", "key", "value", "offset", "serialization"})
STATUS_COLUMNS: Final = frozenset({"workflow_uuid", "status", "error", "serialization", "created_at", "updated_at"})
STREAM_PRIMARY_KEY: Final = ("workflow_uuid", "key", "offset")
MISSING_DESTINATION: Final = "target"


@dataclass(frozen=True, slots=True)
class WorkflowState:
    run_id: RunId
    status: str | None
    error: object
    created_at: int | None
    updated_at: int | None

    @classmethod
    def of(cls, status: WorkflowStatus) -> Self:
        return cls(
            run_id=RunId(status.workflow_id),
            status=status.status,
            error=status.error,
            created_at=status.created_at,
            updated_at=status.updated_at,
        )


@dataclass(frozen=True, slots=True)
class StoredStream:
    payloads: tuple[object, ...]
    state: WorkflowState | None


@dataclass(frozen=True, slots=True)
class StreamRow:
    offset: int | None
    value: str | None
    serialization: str | None


def text_of(value: object) -> str | None:
    return value if isinstance(value, str) else None


def number_of(value: object) -> int | None:
    return value if isinstance(value, int) else None


def contiguous(rows: Iterable[StreamRow]) -> Iterator[StreamRow]:
    for expected, row in enumerate(rows):
        if row.offset != expected:
            return
        yield row


def open_values(values: Iterable[object]) -> Iterator[object]:
    return takewhile(lambda value: not is_stream_closed_sentinel(value), values)


@cache
def system_tables_match() -> bool:
    stream_columns = frozenset(column.name for column in SystemSchema.streams.columns)
    status_columns = frozenset(column.name for column in SystemSchema.workflow_status.columns)
    stream_key = tuple(column.name for column in SystemSchema.streams.primary_key.columns)
    return stream_columns >= STREAM_COLUMNS and status_columns >= STATUS_COLUMNS and stream_key == STREAM_PRIMARY_KEY


def launched_system_database() -> SystemDatabase | None:
    instance: object = getattr(dbos_runtime, DBOS_INSTANCE_SLOT, None)
    database: object = getattr(instance, SYSTEM_DATABASE_SLOT, None)
    return database if isinstance(database, SystemDatabase) else None


@dataclass(frozen=True, slots=True)
class SystemStreamTable:
    database: SystemDatabase

    async def read(self, run_id: RunId, key: str) -> StoredStream:
        return await asyncio.to_thread(db_retry(sys_db=self.database)(self.read_now), run_id, key)

    def read_now(self, run_id: RunId, key: str) -> StoredStream:
        statuses = SystemSchema.workflow_status
        streams = SystemSchema.streams
        joined = statuses.outerjoin(
            streams, (streams.c.workflow_uuid == statuses.c.workflow_uuid) & (streams.c.key == key)
        )
        statement = (
            statuses.select()
            .with_only_columns(
                statuses.c.status,
                statuses.c.error,
                statuses.c.serialization,
                statuses.c.created_at,
                statuses.c.updated_at,
                streams.c.offset,
                streams.c.value,
                streams.c.serialization,
            )
            .select_from(joined)
            .where(statuses.c.workflow_uuid == run_id)
            .order_by(streams.c.offset)
        )
        with self.database.engine.begin() as connection:
            rows = connection.execute(statement).all()
        if not rows:
            raise dbos_errors.DBOSNonExistentWorkflowError(MISSING_DESTINATION, run_id)
        first = rows[0]
        state = WorkflowState(
            run_id=run_id,
            status=text_of(first[0]),
            error=self.error_of(run_id, text_of(first[1]), text_of(first[2])),
            created_at=number_of(first[3]),
            updated_at=number_of(first[4]),
        )
        stream_rows = [StreamRow(number_of(row[5]), text_of(row[6]), text_of(row[7])) for row in rows]
        return StoredStream(payloads=self.payloads(stream_rows), state=state)

    def payloads(self, rows: Sequence[StreamRow]) -> tuple[object, ...]:
        serializer = self.database.serializer
        values = (deserialize_value(row.value, row.serialization, serializer) for row in contiguous(rows))
        return tuple(open_values(values))

    def error_of(self, run_id: RunId, error: str | None, serialization: str | None) -> object:
        _, _, exception = safe_deserialize(
            self.database.serializer,
            serialization,
            run_id,
            serialized_input=None,
            serialized_output=None,
            serialized_exception=error,
        )
        return exception


def system_stream_table() -> SystemStreamTable | None:
    database = launched_system_database()
    if database is None or not system_tables_match():
        return None
    return SystemStreamTable(database)
