from dataclasses import dataclass
from typing import Final

from aqven.series.services import SeriesServices


class SeriesNotReady(RuntimeError):
    def __init__(self) -> None:
        super().__init__("series services are not installed: the project server installs them before the engine starts")


@dataclass(slots=True)
class SeriesSlot:
    current: SeriesServices | None = None

    def install(self, services: SeriesServices) -> None:
        self.current = services

    def clear(self) -> None:
        self.current = None

    def require(self) -> SeriesServices:
        if self.current is None:
            raise SeriesNotReady()
        return self.current


SERIES_SLOT: Final = SeriesSlot()


def active_series() -> SeriesServices:
    return SERIES_SLOT.require()
