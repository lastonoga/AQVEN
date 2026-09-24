import asyncio
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

from aqven.app.locations import ProjectState
from aqven.engine.status_probe import DbosStatusProbe

PROBE_TIMEOUT_SECONDS: Final = 2.0
SQLITE_BUSY_SECONDS: Final = 1.0
SQLITE_PROBE_QUERY: Final = "SELECT count(*) FROM sqlite_master"


class StatusProbe(Protocol):
    async def ping(self) -> None: ...


def sqlite_uri(path: Path) -> str:
    return f"{path.resolve().as_uri()}?mode=rw"


def ping_sqlite(path: Path) -> None:
    with closing(sqlite3.connect(sqlite_uri(path), uri=True, timeout=SQLITE_BUSY_SECONDS)) as connection:
        connection.execute(SQLITE_PROBE_QUERY).fetchone()


@dataclass(frozen=True, slots=True)
class SqliteStatusProbe:
    path: Path

    async def ping(self) -> None:
        await asyncio.to_thread(ping_sqlite, self.path)


@dataclass(frozen=True, slots=True)
class StatusProbes:
    database: StatusProbe
    engine: StatusProbe
    timeout_seconds: float = PROBE_TIMEOUT_SECONDS


def project_probes(root: Path) -> StatusProbes:
    return StatusProbes(database=SqliteStatusProbe(ProjectState(root).database), engine=DbosStatusProbe())
