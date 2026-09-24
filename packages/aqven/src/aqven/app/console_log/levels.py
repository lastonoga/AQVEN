import argparse
import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Final

from aqven.app.environment import InvalidRuntimeSetting

AQVEN_LOG_LEVEL: Final = "AQVEN_LOG_LEVEL"
OWN_LOGGER: Final = "aqven"
DBOS_LOGGER: Final = "dbos"


class ConsoleLevel(StrEnum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


LEVEL_EXPECTED: Final = f"one of {', '.join(level.value for level in ConsoleLevel)}"
QUIET_LIBRARIES: Final[Mapping[str, int]] = {
    "httpx": logging.WARNING,
    "httpx2": logging.WARNING,
    "httpcore": logging.WARNING,
    "watchfiles": logging.WARNING,
    "asyncio": logging.WARNING,
    "aiosqlite": logging.WARNING,
    "multipart": logging.WARNING,
    "python_multipart": logging.WARNING,
    "sse_starlette": logging.WARNING,
    "markdown_it": logging.WARNING,
}


@dataclass(frozen=True, slots=True)
class LevelProfile:
    console: int
    file: int
    root: int
    own: int
    dbos: int
    uvicorn: str
    access_log: bool
    libraries: Mapping[str, int] = field(default_factory=lambda: QUIET_LIBRARIES)

    @property
    def verbose(self) -> bool:
        return self.console <= logging.DEBUG


PROFILES: Final[Mapping[ConsoleLevel, LevelProfile]] = {
    ConsoleLevel.DEBUG: LevelProfile(
        console=logging.DEBUG,
        file=logging.DEBUG,
        root=logging.INFO,
        own=logging.DEBUG,
        dbos=logging.INFO,
        uvicorn="info",
        access_log=True,
    ),
    ConsoleLevel.INFO: LevelProfile(
        console=logging.INFO,
        file=logging.INFO,
        root=logging.WARNING,
        own=logging.INFO,
        dbos=logging.WARNING,
        uvicorn="warning",
        access_log=False,
    ),
    ConsoleLevel.WARNING: LevelProfile(
        console=logging.WARNING,
        file=logging.INFO,
        root=logging.WARNING,
        own=logging.INFO,
        dbos=logging.WARNING,
        uvicorn="warning",
        access_log=False,
    ),
    ConsoleLevel.ERROR: LevelProfile(
        console=logging.ERROR,
        file=logging.INFO,
        root=logging.WARNING,
        own=logging.INFO,
        dbos=logging.WARNING,
        uvicorn="error",
        access_log=False,
    ),
}
FLAG_LEVELS: Final[Mapping[tuple[bool, bool], ConsoleLevel]] = {
    (True, False): ConsoleLevel.DEBUG,
    (False, True): ConsoleLevel.WARNING,
}


def parse_console_level(variable: str, text: str) -> ConsoleLevel:
    word = text.strip().lower()
    if word not in ConsoleLevel:
        raise InvalidRuntimeSetting(variable, text, LEVEL_EXPECTED)
    return ConsoleLevel(word)


def console_level(*, verbose: bool, quiet: bool, environ: Mapping[str, str]) -> ConsoleLevel:
    flagged = FLAG_LEVELS.get((verbose, quiet))
    if flagged is not None:
        return flagged
    text = environ.get(AQVEN_LOG_LEVEL)
    if text is None:
        return ConsoleLevel.INFO
    return parse_console_level(AQVEN_LOG_LEVEL, text)


def add_verbosity_arguments(parser: argparse.ArgumentParser) -> None:
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help=f"also print debug lines: DBOS, uvicorn, HTTP access, cancelled branches; see {AQVEN_LOG_LEVEL}",
    )
    group.add_argument("-q", "--quiet", action="store_true", help="print only warnings and errors")


def arguments_level(arguments: argparse.Namespace, environ: Mapping[str, str]) -> ConsoleLevel:
    return console_level(
        verbose=bool(getattr(arguments, "verbose", False)),
        quiet=bool(getattr(arguments, "quiet", False)),
        environ=environ,
    )
