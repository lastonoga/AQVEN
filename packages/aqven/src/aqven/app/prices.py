from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol

from aqven.ports.prices import PriceCache
from aqven.series.ports import ModelPrices
from aqven_llm import PriceLookup, TokenPrice, build_price_lookup, default_http_client


class SharedPrices(ModelPrices, PriceCache, Protocol): ...


@dataclass(slots=True)
class LazyPriceLookup:
    lookup: PriceLookup | None = None

    async def prices(self, models: Iterable[str]) -> Mapping[str, TokenPrice]:
        return await self.built().prices(models)

    async def warm(self, models: Iterable[str]) -> None:
        await self.built().warm(models)

    def cached(self, model: str) -> TokenPrice | None:
        return None if self.lookup is None else self.lookup.cached(model)

    def built(self) -> PriceLookup:
        if self.lookup is None:
            self.lookup = build_price_lookup(default_http_client())
        return self.lookup
