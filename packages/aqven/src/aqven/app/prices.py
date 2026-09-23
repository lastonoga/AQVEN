from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from aqven_llm import PriceLookup, TokenPrice, build_price_lookup, default_http_client


@dataclass(slots=True)
class LazyPriceLookup:
    lookup: PriceLookup | None = None

    async def prices(self, models: Iterable[str]) -> Mapping[str, TokenPrice]:
        return await self.built().prices(models)

    def built(self) -> PriceLookup:
        if self.lookup is None:
            self.lookup = build_price_lookup(default_http_client())
        return self.lookup
