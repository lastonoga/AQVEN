import os
import sys
from typing import Final

RESET: Final = "\x1b[0m"
CODES: Final = {
    "bold": "1",
    "dim": "2",
    "red": "31",
    "green": "32",
    "yellow": "33",
    "cyan": "36",
}


def colors_enabled() -> bool:
    return not os.environ.get("NO_COLOR") and sys.stderr.isatty()


def _wrap(code: str, text: str) -> str:
    return f"\x1b[{code}m{text}{RESET}" if colors_enabled() else text


def bold(text: str) -> str:
    return _wrap(CODES["bold"], text)


def dim(text: str) -> str:
    return _wrap(CODES["dim"], text)


def red(text: str) -> str:
    return _wrap(CODES["red"], text)


def green(text: str) -> str:
    return _wrap(CODES["green"], text)


def yellow(text: str) -> str:
    return _wrap(CODES["yellow"], text)


def cyan(text: str) -> str:
    return _wrap(CODES["cyan"], text)
