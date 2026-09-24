import asyncio
import logging
import traceback
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from types import ModuleType
from typing import Final, TextIO

import anyio
import dbos
import starlette
import uvicorn
from rich.console import Console, RenderableType
from rich.text import Text
from rich.traceback import Traceback

from aqven.app.console_log.events import ConsoleEvent, Tone, console_event

TIME_FORMAT: Final = "%H:%M:%S"
DETAIL_INDENT: Final = " " * 11
MAX_FRAMES: Final = 20
OWN_PREFIX: Final = "aqven"
SUPPRESSED_MODULES: Final[tuple[ModuleType, ...]] = (dbos, asyncio, anyio, starlette, uvicorn)
SOURCE_ALIASES: Final[Mapping[str, str]] = {"py": "python"}


@dataclass(frozen=True, slots=True)
class Mark:
    glyph: str
    style: str


DEBUG_MARK: Final = Mark("·", "dim")
LEVEL_MARKS: Final[tuple[tuple[int, Mark], ...]] = (
    (logging.CRITICAL, Mark("✗", "bold red")),
    (logging.ERROR, Mark("✗", "red")),
    (logging.WARNING, Mark("▲", "yellow")),
    (logging.INFO, Mark("•", "blue")),
)
MESSAGE_STYLES: Final[tuple[tuple[int, str], ...]] = (
    (logging.ERROR, "red"),
    (logging.WARNING, ""),
    (logging.INFO, ""),
)
TONE_STYLES: Final[Mapping[Tone, str]] = {
    "plain": "",
    "muted": "dim",
    "good": "green",
    "notice": "yellow",
    "bad": "red",
    "accent": "cyan",
}
TEXT_STYLES: Final[Mapping[Tone, str]] = {
    "plain": "",
    "muted": "dim",
    "good": "",
    "notice": "",
    "bad": "",
    "accent": "",
}


def level_mark(level: int) -> Mark:
    return next((mark for threshold, mark in LEVEL_MARKS if level >= threshold), DEBUG_MARK)


def message_style(level: int) -> str:
    return next((style for threshold, style in MESSAGE_STYLES if level >= threshold), "dim")


def clock(record: logging.LogRecord) -> str:
    return datetime.fromtimestamp(record.created).strftime(TIME_FORMAT)


def source_of(logger_name: str) -> str | None:
    head = logger_name.split(".", 1)[0]
    if head == OWN_PREFIX:
        return None
    return SOURCE_ALIASES.get(head, head)


def detail_line(text: str) -> Text:
    return Text(f"{DETAIL_INDENT}{text}", style="dim")


@dataclass(frozen=True, slots=True)
class LineRenderer:
    verbose: bool = False
    rich_tracebacks: bool = True

    def render(self, record: logging.LogRecord) -> tuple[RenderableType, ...]:
        event = console_event(record)
        lines = self.plain_lines(record) if event is None else self.event_lines(record, event)
        return (*lines, *self.failure(record))

    def event_lines(self, record: logging.LogRecord, event: ConsoleEvent) -> tuple[RenderableType, ...]:
        head = Text.assemble(
            (clock(record), "dim"),
            " ",
            (event.glyph, TONE_STYLES[event.tone]),
            " ",
            (event.text, TEXT_STYLES[event.tone]),
        )
        return (head, *(detail_line(detail) for detail in event.details))

    def plain_lines(self, record: logging.LogRecord) -> tuple[RenderableType, ...]:
        mark = level_mark(record.levelno)
        source = source_of(record.name)
        first, *rest = record.getMessage().splitlines() or [""]
        head = Text.assemble(
            (clock(record), "dim"),
            " ",
            (mark.glyph, mark.style),
            " ",
            (f"{source}  " if source else "", "dim"),
            (first, message_style(record.levelno)),
        )
        return (head, *(detail_line(line) for line in rest if line.strip()))

    def failure(self, record: logging.LogRecord) -> tuple[RenderableType, ...]:
        info = record.exc_info
        if info is None or info[1] is None:
            return ()
        error = info[1]
        if record.levelno < logging.ERROR and not self.verbose:
            return (detail_line(f"{type(error).__name__}: {error}"),)
        if not self.rich_tracebacks:
            return (Text("".join(traceback.format_exception(error)).rstrip(), style="dim"),)
        return (
            Traceback.from_exception(
                type(error),
                error,
                info[2],
                width=None,
                suppress=SUPPRESSED_MODULES,
                max_frames=MAX_FRAMES,
            ),
        )


class ConsoleHandler(logging.Handler):
    def __init__(self, console: Console, level: int, verbose: bool = False) -> None:
        super().__init__(level)
        self.console = console
        self.renderer = LineRenderer(verbose=verbose, rich_tracebacks=console.is_terminal)

    def emit(self, record: logging.LogRecord) -> None:
        if record.levelno < self.level:
            return
        try:
            for renderable in self.renderer.render(record):
                self.console.print(renderable)
        except Exception:
            self.handleError(record)


def terminal_console(stream: TextIO | None = None, width: int | None = None) -> Console:
    return Console(
        file=stream,
        stderr=stream is None,
        width=width,
        highlight=False,
        markup=False,
        emoji=False,
        soft_wrap=True,
    )
