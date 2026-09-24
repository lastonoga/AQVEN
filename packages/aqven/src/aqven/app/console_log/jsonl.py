import json
import logging
from collections.abc import Mapping
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Final

from pydantic import JsonValue

from aqven.app.console_log.events import CONSOLE_EVENT_ATTRIBUTE, console_event
from aqven.app.locations import LOGS_FOLDER

DEV_LOG_FILE: Final = "dev.jsonl"
MAX_BYTES: Final = 5 * 1024 * 1024
BACKUP_COUNT: Final = 3
PLAIN_EVENT: Final = "log"
TIMESTAMP_PRECISION: Final = "milliseconds"
STANDARD_ATTRIBUTES: Final = frozenset(
    {
        *vars(logging.LogRecord("", logging.INFO, "", 0, "", (), None)),
        "message",
        "asctime",
        CONSOLE_EVENT_ATTRIBUTE,
    }
)
FIELD_ALIASES: Final[Mapping[str, str]] = {
    "aqven.node.id": "node",
    "aqven.error.code": "code",
    "aqven.error.message": "error",
    "aqven.error.hint": "hint",
    "aqven.agent.id": "agent",
    "gen_ai.request.model": "model",
    "aqven.output.mode": "output_mode",
    "aqven.attempt": "attempt",
    "aqven.error.raw_excerpt": "raw_excerpt",
    "aqven.error.violations": "violations",
}


def json_safe(value: object) -> JsonValue:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    return str(value)


def record_extras(record: logging.LogRecord) -> dict[str, JsonValue]:
    attributes: dict[str, object] = vars(record)
    return {
        FIELD_ALIASES.get(name, name): json_safe(value)
        for name, value in attributes.items()
        if name not in STANDARD_ATTRIBUTES
    }


class JsonLinesFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        event = console_event(record)
        document: dict[str, JsonValue] = {
            "ts": datetime.fromtimestamp(record.created).astimezone().isoformat(timespec=TIMESTAMP_PRECISION),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": PLAIN_EVENT if event is None else event.kind,
            "message": record.getMessage(),
            **record_extras(record),
            **({} if event is None else dict(event.fields)),
        }
        info = record.exc_info
        if info is not None and info[1] is not None:
            document["exc"] = self.formatException(info)
        return json.dumps(document, ensure_ascii=False, default=str)


def dev_log_path(state_folder: Path) -> Path:
    return state_folder / LOGS_FOLDER / DEV_LOG_FILE


class DevLogHandler(RotatingFileHandler):
    def __init__(self, path: Path, level: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        super().__init__(path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8", delay=True)
        self.setLevel(level)
        self.setFormatter(JsonLinesFormatter())
