from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final, Protocol

from aqven_llm import TokenPrice


class CachedPrices(Protocol):
    def cached(self, model: str) -> TokenPrice | None: ...


class PriceCache(CachedPrices, Protocol):
    async def warm(self, models: Iterable[str]) -> None: ...


@dataclass(frozen=True, slots=True)
class NoPrices:
    def cached(self, model: str) -> TokenPrice | None:
        return None

    async def warm(self, models: Iterable[str]) -> None:
        return None


NO_PRICES: Final = NoPrices()
