from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Final

MILLISECONDS: Final = 1000


@dataclass(slots=True)
class WaitMeter:
    seconds: float = 0.0

    def add(self, seconds: float) -> None:
        self.seconds += max(seconds, 0.0)

    @property
    def milliseconds(self) -> int:
        return int(self.seconds * MILLISECONDS)


WAIT_METERS: Final[ContextVar[tuple[WaitMeter, ...]]] = ContextVar("aqven_wait_meters", default=())


def record_wait(seconds: float) -> None:
    for meter in WAIT_METERS.get():
        meter.add(seconds)


@contextmanager
def metered() -> Generator[WaitMeter]:
    meter = WaitMeter()
    token = WAIT_METERS.set((*WAIT_METERS.get(), meter))
    try:
        yield meter
    finally:
        WAIT_METERS.reset(token)
