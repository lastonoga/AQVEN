import io
import logging
from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Final

from pydantic import JsonValue
from rich.console import Console

from aqven.app.console_log.events import CONSOLE_EVENT_ATTRIBUTE, ConsoleEvent
from aqven.app.console_log.render import ConsoleHandler
from aqven.runtime.address import RunId
from aqven.runtime.events import RUN_EVENT_ADAPTER, RunEvent

LOCAL_TIME: Final = datetime(2026, 9, 24, 15, 36, 33)
CLOCK: Final = "15:36:33"
EVENT_AT: Final = datetime(2026, 9, 24, 12, 36, 33, tzinfo=UTC)
RUN_ID: Final = RunId("01a0d355-1856-77b8-9d54-a280bf3c852f")
STUDIO: Final = "http://127.0.0.1:5180"
WIDTH: Final = 160


def plain_console(stream: io.StringIO) -> Console:
    return Console(
        file=stream,
        width=WIDTH,
        color_system=None,
        force_terminal=False,
        highlight=False,
        markup=False,
        emoji=False,
        soft_wrap=True,
    )


def rendered(record: logging.LogRecord, verbose: bool = False) -> str:
    stream = io.StringIO()
    handler = ConsoleHandler(plain_console(stream), logging.DEBUG, verbose=verbose)
    handler.handle(record)
    return stream.getvalue()


def at_fixed_time(record: logging.LogRecord) -> logging.LogRecord:
    record.created = LOCAL_TIME.timestamp()
    return record


def event_record(event: ConsoleEvent) -> logging.LogRecord:
    record = logging.LogRecord("aqven.dev", event.level, __file__, 1, event.text, (), None)
    setattr(record, CONSOLE_EVENT_ATTRIBUTE, event)
    return at_fixed_time(record)


def rendered_event(event: ConsoleEvent | None) -> str:
    assert event is not None
    return rendered(event_record(event))


def run_event(kind: str, seq: int, *, after_seconds: float = 0.0, **fields: JsonValue) -> RunEvent:
    payload: dict[str, JsonValue] = {
        "type": kind,
        "seq": seq,
        "at": (EVENT_AT + timedelta(seconds=after_seconds)).isoformat(),
        "run_id": RUN_ID,
        **fields,
    }
    return RUN_EVENT_ADAPTER.validate_python(payload)


def address(node: str, **context: JsonValue) -> dict[str, JsonValue]:
    return {"node_id": node, "branch_key": None, "iteration": None, "item_index": None, **context}


@contextmanager
def preserved_loggers(*names: str) -> Generator[None]:
    loggers = [logging.getLogger(name) for name in ("", *names)]
    saved = [
        (logger, logger.level, logger.propagate, list(logger.handlers), list(logger.filters)) for logger in loggers
    ]
    try:
        yield
    finally:
        for logger, level, propagate, handlers, filters in saved:
            logger.setLevel(level)
            logger.propagate = propagate
            logger.handlers[:] = handlers
            logger.filters[:] = filters
