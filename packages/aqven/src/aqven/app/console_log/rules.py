import logging
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Final

from aqven.engine.addressing import CHILD_WORKFLOW_SEPARATOR
from aqven.log_support import exception_of, rewritten, short_id

ACCESS_LOGGER: Final = "uvicorn.access"
ACCESS_ARGUMENTS: Final = 5
WORKFLOW_ATTRIBUTE: Final = "operationUUID"
SHUTDOWN_SYMPTOMS: Final = ("No DBOS was created yet", "cannot schedule new futures after shutdown")


@dataclass(frozen=True, slots=True)
class AccessLineRule:
    def apply(self, record: logging.LogRecord) -> logging.LogRecord | None:
        arguments = record.args
        if record.name != ACCESS_LOGGER or not isinstance(arguments, tuple) or len(arguments) != ACCESS_ARGUMENTS:
            return record
        _client, method, path, _version, status = arguments
        return rewritten(record, record.levelno, f"{method} {path} {status}")


@dataclass(frozen=True, slots=True)
class DemoteRule:
    prefixes: tuple[str, ...]
    level: int = logging.DEBUG

    def apply(self, record: logging.LogRecord) -> logging.LogRecord | None:
        if record.levelno >= logging.ERROR and record.exc_info is not None:
            return record
        if not any(record.name == prefix or record.name.startswith(f"{prefix}.") for prefix in self.prefixes):
            return record
        return rewritten(record, self.level, record.getMessage())


def exception_chain(error: BaseException | None) -> Iterator[BaseException]:
    seen: set[int] = set()
    current = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def interrupted_by_shutdown(error: BaseException | None) -> bool:
    return any(symptom in str(item) for item in exception_chain(error) for symptom in SHUTDOWN_SYMPTOMS)


def interrupted_run(record: logging.LogRecord) -> str:
    workflow: object = getattr(record, WORKFLOW_ATTRIBUTE, None)
    if not isinstance(workflow, str) or not workflow:
        return "a run"
    return f"run {short_id(workflow.split(CHILD_WORKFLOW_SEPARATOR, 1)[0])}"


@dataclass(slots=True)
class ShutdownInterruptionRule:
    reported: set[int] = field(default_factory=set[int])
    lock: threading.Lock = field(default_factory=threading.Lock)

    def apply(self, record: logging.LogRecord) -> logging.LogRecord | None:
        error = exception_of(record)
        if record.levelno < logging.ERROR or not interrupted_by_shutdown(error):
            return record
        if not self._first_report(id(error)):
            return None
        text = f"{interrupted_run(record)} was still running when the server stopped; it resumes on the next start"
        return rewritten(record, logging.WARNING, text)

    def _first_report(self, key: int) -> bool:
        with self.lock:
            if key in self.reported:
                return False
            self.reported.add(key)
            return True
