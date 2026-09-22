import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

AQVEN_STUDIO: Final = "AQVEN_STUDIO"
AQVEN_HOST: Final = "AQVEN_HOST"
AQVEN_PORT: Final = "AQVEN_PORT"
AQVEN_OPEN_BROWSER: Final = "AQVEN_OPEN_BROWSER"

DEFAULT_PORT: Final = 5180
LOOPBACK_HOST: Final = "127.0.0.1"
MIN_PORT: Final = 1
MAX_PORT: Final = 65535
TRUE_WORDS: Final = frozenset({"1", "true", "yes", "on"})
FALSE_WORDS: Final = frozenset({"0", "false", "no", "off"})
FLAG_EXPECTED: Final = "one of 1, true, yes, on, 0, false, no, off"
PORT_EXPECTED: Final = f"a whole number from {MIN_PORT} to {MAX_PORT}"
HOST_EXPECTED: Final = "a host name or an IP address, for example 127.0.0.1"


class InvalidRuntimeSetting(ValueError):
    def __init__(self, variable: str, value: str, expected: str) -> None:
        super().__init__(f"{variable}={value!r} is not a valid value: expected {expected}")
        self.variable = variable
        self.value = value
        self.expected = expected


def parse_flag(variable: str, text: str) -> bool:
    word = text.strip().lower()
    if word in TRUE_WORDS:
        return True
    if word in FALSE_WORDS:
        return False
    raise InvalidRuntimeSetting(variable, text, FLAG_EXPECTED)


def parse_port(variable: str, text: str) -> int:
    word = text.strip()
    if not word.isdigit() or not MIN_PORT <= int(word) <= MAX_PORT:
        raise InvalidRuntimeSetting(variable, text, PORT_EXPECTED)
    return int(word)


def parse_host(variable: str, text: str) -> str:
    word = text.strip()
    if not word:
        raise InvalidRuntimeSetting(variable, text, HOST_EXPECTED)
    return word


@dataclass(frozen=True, slots=True)
class RuntimeSettings:
    studio: bool = True
    host: str = LOOPBACK_HOST
    port: int = DEFAULT_PORT
    open_browser: bool = False


def _read[T](environ: Mapping[str, str], variable: str, parse: Callable[[str, str], T], fallback: T) -> T:
    text = environ.get(variable)
    if text is None:
        return fallback
    return parse(variable, text)


def runtime_settings(
    environ: Mapping[str, str] | None = None,
    defaults: RuntimeSettings | None = None,
) -> RuntimeSettings:
    values = os.environ if environ is None else environ
    base = defaults or RuntimeSettings()
    return RuntimeSettings(
        studio=_read(values, AQVEN_STUDIO, parse_flag, base.studio),
        host=_read(values, AQVEN_HOST, parse_host, base.host),
        port=_read(values, AQVEN_PORT, parse_port, base.port),
        open_browser=_read(values, AQVEN_OPEN_BROWSER, parse_flag, base.open_browser),
    )
