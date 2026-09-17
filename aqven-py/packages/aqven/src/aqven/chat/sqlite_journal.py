import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from pydantic import AwareDatetime

from aqven.chat.builders import ChatEventBuilder, ChatStamp
from aqven.chat.errors import ChatFailure
from aqven.chat.journal import Clock, StoredChatSession
from aqven.ports.chat import (
    CHAT_EVENT_ADAPTER,
    AgentBackendKind,
    ChatEvent,
    ChatPermissionMode,
    ChatSession,
    ChatSessionId,
    ChatTurnId,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId, ResourceModel

PROJECT_APP_DATABASE: Final[Path] = Path(".aqven") / "aqven.sqlite"
BUSY_TIMEOUT_MS: Final[int] = 5000

SCHEMA: Final[tuple[str, ...]] = (
    """
    CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
        backend TEXT NOT NULL,
        project_root TEXT NOT NULL,
        model TEXT,
        permission_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seq INTEGER NOT NULL DEFAULT 0,
        mcp_url TEXT NOT NULL,
        backend_session_id TEXT,
        closed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_events (
        session_id TEXT NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        turn_id TEXT,
        client_op_id TEXT,
        at TEXT NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS chat_events_operation
    ON chat_events (session_id, client_op_id) WHERE client_op_id IS NOT NULL
    """,
)

SESSION_COLUMNS: Final[tuple[str, ...]] = (
    "session_id",
    "backend",
    "project_root",
    "model",
    "permission_mode",
    "created_at",
    "last_seq",
    "mcp_url",
    "backend_session_id",
    "closed_at",
)
SELECT_SESSIONS: Final[str] = f"SELECT {', '.join(SESSION_COLUMNS)} FROM chat_sessions"


class _SessionRow(ResourceModel):
    session_id: ChatSessionId
    backend: AgentBackendKind
    project_root: str
    model: str | None
    permission_mode: ChatPermissionMode
    created_at: AwareDatetime
    last_seq: int
    mcp_url: str
    backend_session_id: str | None
    closed_at: AwareDatetime | None

    def stored(self) -> StoredChatSession:
        session = ChatSession(
            session_id=self.session_id,
            backend=self.backend,
            project_root=self.project_root,
            model=self.model,
            permission_mode=self.permission_mode,
            created_at=self.created_at,
            last_seq=self.last_seq,
        )
        return StoredChatSession(
            session=session,
            mcp_url=self.mcp_url,
            backend_session_id=self.backend_session_id,
            closed_at=self.closed_at,
        )


def utc_now() -> datetime:
    return datetime.now(UTC)


def project_app_database(project_root: Path) -> Path:
    return project_root / PROJECT_APP_DATABASE


def _operation_of(event: ChatEvent) -> ClientOpId | None:
    return event.client_op_id if isinstance(event, ChatTurnStarted) else None


def _session_row(values: tuple[object, ...]) -> StoredChatSession:
    return _SessionRow.model_validate(dict(zip(SESSION_COLUMNS, values, strict=True))).stored()


def _iso(moment: datetime | None) -> str | None:
    return None if moment is None else moment.isoformat()


class SqliteChatJournal:
    def __init__(self, path: Path, clock: Clock = utc_now) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._clock = clock
        self._lock = threading.Lock()
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._connection.execute("PRAGMA foreign_keys = ON")
        with self._lock, self._connection:
            for statement in SCHEMA:
                self._connection.execute(statement)

    @classmethod
    def for_project(cls, project_root: Path, clock: Clock = utc_now) -> SqliteChatJournal:
        return cls(project_app_database(project_root), clock)

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def create_session(self, session: ChatSession, mcp_url: str) -> StoredChatSession:
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO chat_sessions (session_id, backend, project_root, model, permission_mode, created_at,"
                " last_seq, mcp_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    session.session_id,
                    session.backend,
                    session.project_root,
                    session.model,
                    session.permission_mode,
                    session.created_at.isoformat(),
                    session.last_seq,
                    mcp_url,
                ),
            )
        return StoredChatSession(session=session, mcp_url=mcp_url, backend_session_id=None, closed_at=None)

    def get_session(self, session_id: ChatSessionId) -> StoredChatSession | None:
        with self._lock:
            row: tuple[object, ...] | None = self._connection.execute(
                f"{SELECT_SESSIONS} WHERE session_id = ?", (session_id,)
            ).fetchone()
        return None if row is None else _session_row(row)

    def list_sessions(self) -> tuple[ChatSession, ...]:
        with self._lock:
            rows: list[tuple[object, ...]] = self._connection.execute(
                f"{SELECT_SESSIONS} ORDER BY created_at DESC, session_id DESC"
            ).fetchall()
        return tuple(_session_row(row).session for row in rows)

    def remember_backend_session(self, session_id: ChatSessionId, backend_session_id: str) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE chat_sessions SET backend_session_id = ? WHERE session_id = ?",
                (backend_session_id, session_id),
            )

    def set_closed(self, session_id: ChatSessionId, closed_at: datetime | None) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE chat_sessions SET closed_at = ? WHERE session_id = ?", (_iso(closed_at), session_id)
            )

    def append(self, session_id: ChatSessionId, turn_id: ChatTurnId | None, build: ChatEventBuilder) -> ChatEvent:
        with self._lock, self._connection:
            row: tuple[int] | None = self._connection.execute(
                "UPDATE chat_sessions SET last_seq = last_seq + 1 WHERE session_id = ? RETURNING last_seq",
                (session_id,),
            ).fetchone()
            if row is None:
                raise ChatFailure("NOT_FOUND", f"chat session {session_id} does not exist")
            event = build(ChatStamp(seq=row[0], at=self._clock(), session_id=session_id, turn_id=turn_id))
            self._connection.execute(
                "INSERT INTO chat_events (session_id, seq, type, turn_id, client_op_id, at, body)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    session_id,
                    event.seq,
                    event.type,
                    event.turn_id,
                    _operation_of(event),
                    event.at.isoformat(),
                    CHAT_EVENT_ADAPTER.dump_json(event).decode(),
                ),
            )
        return event

    def read(self, session_id: ChatSessionId, after_seq: int, limit: int) -> tuple[ChatEvent, ...]:
        with self._lock:
            rows: list[tuple[str]] = self._connection.execute(
                "SELECT body FROM chat_events WHERE session_id = ? AND seq > ? ORDER BY seq LIMIT ?",
                (session_id, after_seq, limit),
            ).fetchall()
        return tuple(CHAT_EVENT_ADAPTER.validate_json(body) for (body,) in rows)

    def turn_of_operation(self, session_id: ChatSessionId, client_op_id: ClientOpId) -> ChatTurnId | None:
        with self._lock:
            row: tuple[str | None] | None = self._connection.execute(
                "SELECT turn_id FROM chat_events WHERE session_id = ? AND client_op_id = ?",
                (session_id, client_op_id),
            ).fetchone()
        if row is None or row[0] is None:
            return None
        return ChatTurnId(row[0])
