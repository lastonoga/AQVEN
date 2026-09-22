import argparse
import sys
from collections.abc import Callable, Mapping
from enum import StrEnum
from typing import Final, Protocol

from aqven.diagnostics import format_json, format_text
from aqven.loader import PROJECT_FILE

PROGRAM: Final = "aqven"
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1
EXIT_USAGE: Final = 2
NOT_IMPLEMENTED: Final = "not implemented"
PATH_HELP: Final = f"project root with {PROJECT_FILE} or a path inside it"


class OutputFormat(StrEnum):
    TEXT = "text"
    JSON = "json"


FORMATTERS: Final[Mapping[OutputFormat, Callable[..., str]]] = {
    OutputFormat.TEXT: format_text,
    OutputFormat.JSON: format_json,
}


class Command(Protocol):
    @property
    def help(self) -> str: ...

    def configure(self, parser: argparse.ArgumentParser) -> None: ...

    def execute(self, arguments: argparse.Namespace) -> int: ...


def not_implemented(command: str) -> int:
    print(f"{PROGRAM} {command}: {NOT_IMPLEMENTED}", file=sys.stderr)
    return EXIT_USAGE


def add_format_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--format", choices=[item.value for item in OutputFormat], default=OutputFormat.TEXT.value)
