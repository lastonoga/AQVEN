import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Final, Literal

from pydantic import JsonValue

type Tone = Literal["plain", "muted", "good", "notice", "bad", "accent"]

CONSOLE_EVENT_ATTRIBUTE: Final = "aqven_console"
DEV_LOGGER_NAME: Final = "aqven.dev"


@dataclass(frozen=True, slots=True)
class ConsoleEvent:
    kind: str
    glyph: str
    tone: Tone
    text: str
    details: tuple[str, ...] = ()
    fields: Mapping[str, JsonValue] = field(default_factory=dict[str, JsonValue])
    level: int = logging.INFO


def console_event(record: logging.LogRecord) -> ConsoleEvent | None:
    value: object = getattr(record, CONSOLE_EVENT_ATTRIBUTE, None)
    return value if isinstance(value, ConsoleEvent) else None


def publish(event: ConsoleEvent, logger: logging.Logger | None = None) -> None:
    target = logger if logger is not None else logging.getLogger(DEV_LOGGER_NAME)
    target.log(event.level, event.text, extra={CONSOLE_EVENT_ATTRIBUTE: event})
