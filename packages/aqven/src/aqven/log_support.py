import copy
import logging
from collections.abc import Generator, Mapping, Sequence
from contextlib import contextmanager
from typing import Final, Protocol

from aqven.runtime.address import ExecutionAddress

SHORT_ID_LENGTH: Final = 8


class RecordRule(Protocol):
    def apply(self, record: logging.LogRecord) -> logging.LogRecord | None: ...


class RuleChain(logging.Filter):
    def __init__(self, rules: Sequence[RecordRule]) -> None:
        super().__init__()
        self.rules = tuple(rules)

    def filter(self, record: logging.LogRecord) -> bool | logging.LogRecord:
        current = record
        for rule in self.rules:
            outcome = rule.apply(current)
            if outcome is None:
                return False
            current = outcome
        return current


def rewritten(
    record: logging.LogRecord, level: int, message: str, extras: Mapping[str, object] | None = None
) -> logging.LogRecord:
    fresh = copy.copy(record)
    fresh.levelno = level
    fresh.levelname = logging.getLevelName(level)
    fresh.msg = message
    fresh.args = ()
    fresh.exc_info = None
    fresh.exc_text = None
    for name, value in (extras or {}).items():
        setattr(fresh, name, value)
    return fresh


def exception_of(record: logging.LogRecord) -> BaseException | None:
    info = record.exc_info
    return None if info is None else info[1]


def address_label(address: ExecutionAddress) -> str:
    parts = [
        f"{name}={value}"
        for name, value in (
            ("branch", address.branch_key),
            ("iteration", address.iteration),
            ("item", address.item_index),
        )
        if value is not None
    ]
    return f"{address.node_id}[{', '.join(parts)}]" if parts else address.node_id


def short_id(identifier: str) -> str:
    return identifier[-SHORT_ID_LENGTH:]


@contextmanager
def root_logging_untouched() -> Generator[None]:
    root = logging.getLogger()
    handlers = list(root.handlers)
    level = root.level
    try:
        yield
    finally:
        root.handlers[:] = handlers
        root.setLevel(level)
