import logging
import sqlite3
import threading
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from pydantic import TypeAdapter, ValidationError

from aqven.chat.sqlite_journal import BUSY_TIMEOUT_MS, project_app_database
from aqven.chat.transcript import (
    ChatTranscriptPage,
    ChatTranscriptTurn,
    FoldedTurn,
    TurnSpan,
    TurnStart,
    boundary_carry,
    transcript_turn,
    turn_spans,
    turn_window,
)
from aqven.chat.transcript_fold import FOLD_VERSION, fold_turn, opened_messages
from aqven.ports.chat import CHAT_EVENT_ADAPTER, ChatEvent, ChatSessionId, ChatTurnId

SNAPSHOT_TABLE: Final[str] = "chat_turn_snapshots"
VERSIONS_TABLE: Final[str] = "aqven_schema_versions"
SCHEMA_COMPONENT: Final[str] = "chat_snapshots"
SCHEMA_VERSION: Final[int] = 1

SCHEMA: Final[tuple[str, ...]] = (
    f"CREATE TABLE IF NOT EXISTS {VERSIONS_TABLE} (component TEXT PRIMARY KEY, version INTEGER NOT NULL)",
    f"INSERT OR IGNORE INTO {VERSIONS_TABLE} (component, version) VALUES ('{SCHEMA_COMPONENT}', {SCHEMA_VERSION})",
    f"""
    CREATE TABLE IF NOT EXISTS {SNAPSHOT_TABLE} (
        session_id TEXT NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
        first_seq INTEGER NOT NULL,
        last_seq INTEGER NOT NULL,
        turn_id TEXT,
        fold_version INTEGER NOT NULL,
        raw_count INTEGER NOT NULL,
        messages TEXT NOT NULL,
        events TEXT NOT NULL,
        PRIMARY KEY (session_id, first_seq)
    )
    """,
    "CREATE INDEX IF NOT EXISTS chat_events_by_type ON chat_events (session_id, type, seq)",
    f"DELETE FROM {SNAPSHOT_TABLE} WHERE fold_version <> {FOLD_VERSION}",
)

BOUNDS_QUERY: Final[str] = "SELECT MIN(seq), MAX(seq) FROM chat_events WHERE session_id = ?"
STARTS_QUERY: Final[str] = (
    "SELECT seq, turn_id FROM chat_events WHERE session_id = ? AND type = 'chat_turn_started' AND seq <= ? ORDER BY seq"
)
STORED_QUERY: Final[str] = (
    f"SELECT first_seq, last_seq, messages FROM {SNAPSHOT_TABLE} WHERE session_id = ? AND fold_version = ?"
)
STORED_EVENTS_QUERY: Final[str] = (
    f"SELECT first_seq, last_seq, events FROM {SNAPSHOT_TABLE}"
    " WHERE session_id = ? AND fold_version = ? AND first_seq BETWEEN ? AND ?"
)
RAW_QUERY: Final[str] = "SELECT seq, body FROM chat_events WHERE session_id = ? AND seq BETWEEN ? AND ? ORDER BY seq"
SAVE_QUERY: Final[str] = (
    f"INSERT OR REPLACE INTO {SNAPSHOT_TABLE}"
    " (session_id, first_seq, last_seq, turn_id, fold_version, raw_count, messages, events)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)
STATE_TYPES: Final[tuple[str, ...]] = ("chat_status", "chat_turn_finished")
RESET_TYPES: Final[tuple[str, ...]] = ("chat_error", "chat_turn_started")
QUEUE_TYPES: Final[tuple[str, ...]] = ("chat_message_queued", "chat_message_delivered", "chat_turn_started")

EVENTS_JSON: Final[TypeAdapter[tuple[ChatEvent, ...]]] = TypeAdapter(tuple[ChatEvent, ...])
MESSAGES_JSON: Final[TypeAdapter[frozenset[str]]] = TypeAdapter(frozenset[str])
TRANSCRIPT_LOGGER: Final = logging.getLogger("aqven.chat.transcript")

type RawRow = tuple[int, str]
type StoredRow = tuple[int, int, str]


@dataclass(frozen=True, slots=True)
class StoredTurn:
    last_seq: int
    messages: frozenset[str]


def _latest_query(types: Sequence[str]) -> str:
    marks = ", ".join("?" * len(types))
    return (
        f"SELECT seq, body FROM chat_events WHERE session_id = ? AND type IN ({marks}) AND seq < ?"
        " ORDER BY seq DESC LIMIT 1"
    )


def _typed_query(types: Sequence[str]) -> str:
    marks = ", ".join("?" * len(types))
    return f"SELECT seq, body FROM chat_events WHERE session_id = ? AND type IN ({marks}) AND seq < ? ORDER BY seq"


def _parsed(session_id: ChatSessionId, seq: int, body: str) -> ChatEvent | None:
    try:
        return CHAT_EVENT_ADAPTER.validate_json(body)
    except ValidationError as error:
        TRANSCRIPT_LOGGER.warning(
            "chat event %s of session %s is skipped by the transcript: %s", seq, session_id, error
        )
        return None


def _events(session_id: ChatSessionId, rows: Iterable[RawRow]) -> tuple[ChatEvent, ...]:
    return tuple(event for seq, body in rows if (event := _parsed(session_id, seq, body)) is not None)


def _stored_events(session_id: ChatSessionId, row: StoredRow) -> tuple[ChatEvent, ...] | None:
    try:
        return EVENTS_JSON.validate_json(row[2])
    except ValidationError as error:
        TRANSCRIPT_LOGGER.warning("snapshot %s of session %s is folded again: %s", row[0], session_id, error)
        return None


def _is_current(span: TurnSpan, stored: Mapping[int, StoredTurn]) -> bool:
    known = stored.get(span.first_seq)
    return known is not None and known.last_seq == span.last_seq


class SqliteChatTranscripts:
    def __init__(self, path: Path) -> None:
        self._lock = threading.Lock()
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._connection.execute("PRAGMA foreign_keys = ON")
        with self._lock, self._connection:
            for statement in SCHEMA:
                self._connection.execute(statement)

    @classmethod
    def for_project(cls, project_root: Path) -> SqliteChatTranscripts:
        return cls(project_app_database(project_root))

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def page(self, session_id: ChatSessionId, before_seq: int | None, limit: int) -> ChatTranscriptPage:
        with self._lock:
            return self._page(session_id, before_seq, limit)

    def _page(self, session_id: ChatSessionId, before_seq: int | None, limit: int) -> ChatTranscriptPage:
        spans = self._spans(session_id)
        visible = tuple(span for span in spans if before_seq is None or span.first_seq < before_seq)
        stored = self._stored(session_id)
        folded = {span.first_seq: self._fold(session_id, span) for span in visible if not _is_current(span, stored)}
        self._save(session_id, folded.values())
        messages = tuple(
            folded[span.first_seq].messages if span.first_seq in folded else stored[span.first_seq].messages
            for span in visible
        )
        window = turn_window(messages, limit)
        chosen = visible[window.start : window.stop]
        turns = self._turns(session_id, chosen, folded)
        return ChatTranscriptPage(
            session_id=session_id,
            turns=turns,
            carry=self._carry(session_id, chosen[0].first_seq) if chosen else (),
            last_seq=chosen[-1].last_seq if chosen else 0,
            before_seq=chosen[0].first_seq if window.start > 0 else None,
        )

    def _spans(self, session_id: ChatSessionId) -> tuple[TurnSpan, ...]:
        bounds: tuple[int | None, int | None] = self._connection.execute(BOUNDS_QUERY, (session_id,)).fetchone()
        first_seq, last_seq = bounds
        if first_seq is None or last_seq is None:
            return ()
        rows: list[tuple[int, str | None]] = self._connection.execute(STARTS_QUERY, (session_id, last_seq)).fetchall()
        starts = tuple(TurnStart(seq, None if turn_id is None else ChatTurnId(turn_id)) for seq, turn_id in rows)
        return turn_spans(first_seq, last_seq, starts)

    def _stored(self, session_id: ChatSessionId) -> dict[int, StoredTurn]:
        rows: list[tuple[int, int, str]] = self._connection.execute(STORED_QUERY, (session_id, FOLD_VERSION)).fetchall()
        return {
            first_seq: StoredTurn(last_seq, MESSAGES_JSON.validate_json(messages))
            for first_seq, last_seq, messages in rows
        }

    def _raw(self, session_id: ChatSessionId, span: TurnSpan) -> tuple[ChatEvent, ...]:
        rows: list[RawRow] = self._connection.execute(RAW_QUERY, (session_id, span.first_seq, span.last_seq)).fetchall()
        return _events(session_id, rows)

    def _fold(self, session_id: ChatSessionId, span: TurnSpan) -> FoldedTurn:
        raw = self._raw(session_id, span)
        return FoldedTurn(span=span, events=fold_turn(raw), messages=opened_messages(raw), raw_count=len(raw))

    def _save(self, session_id: ChatSessionId, turns: Iterable[FoldedTurn]) -> None:
        rows = tuple(
            (
                session_id,
                turn.span.first_seq,
                turn.span.last_seq,
                turn.span.turn_id,
                FOLD_VERSION,
                turn.raw_count,
                MESSAGES_JSON.dump_json(turn.messages).decode(),
                EVENTS_JSON.dump_json(turn.events).decode(),
            )
            for turn in turns
        )
        if not rows:
            return
        with self._connection:
            self._connection.executemany(SAVE_QUERY, rows)

    def _turns(
        self, session_id: ChatSessionId, chosen: Sequence[TurnSpan], folded: Mapping[int, FoldedTurn]
    ) -> tuple[ChatTranscriptTurn, ...]:
        if not chosen:
            return ()
        rows: list[StoredRow] = self._connection.execute(
            STORED_EVENTS_QUERY, (session_id, FOLD_VERSION, chosen[0].first_seq, chosen[-1].first_seq)
        ).fetchall()
        loaded = {row[0]: events for row in rows if (events := _stored_events(session_id, row)) is not None}
        return tuple(self._turn(session_id, span, folded, loaded) for span in chosen)

    def _turn(
        self,
        session_id: ChatSessionId,
        span: TurnSpan,
        folded: Mapping[int, FoldedTurn],
        loaded: Mapping[int, tuple[ChatEvent, ...]],
    ) -> ChatTranscriptTurn:
        fresh = folded.get(span.first_seq)
        if fresh is not None:
            return transcript_turn(span, fresh.events)
        events = loaded.get(span.first_seq)
        if events is not None:
            return transcript_turn(span, events)
        refolded = self._fold(session_id, span)
        self._save(session_id, (refolded,))
        return transcript_turn(span, refolded.events)

    def _latest(self, session_id: ChatSessionId, types: Sequence[str], boundary: int) -> ChatEvent | None:
        row: RawRow | None = self._connection.execute(_latest_query(types), (session_id, *types, boundary)).fetchone()
        return None if row is None else _parsed(session_id, *row)

    def _carry(self, session_id: ChatSessionId, boundary: int) -> tuple[ChatEvent, ...]:
        rows: list[RawRow] = self._connection.execute(
            _typed_query(QUEUE_TYPES), (session_id, *QUEUE_TYPES, boundary)
        ).fetchall()
        return boundary_carry(
            self._latest(session_id, STATE_TYPES, boundary),
            self._latest(session_id, RESET_TYPES, boundary),
            _events(session_id, rows),
        )
