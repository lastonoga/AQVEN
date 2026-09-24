from collections.abc import Iterable
from dataclasses import dataclass

from aqven_llm import PriceLookup, TokenPrice, build_price_lookup, default_http_client


@dataclass(slots=True)
class LazyPriceLookup:
    lookup: PriceLookup | None = None

    async def warm(self, models: Iterable[str]) -> None:
        await self.built().warm(models)

    def cached(self, model: str) -> TokenPrice | None:
        return None if self.lookup is None else self.lookup.cached(model)

    def built(self) -> PriceLookup:
        if self.lookup is None:
            self.lookup = build_price_lookup(default_http_client())
        return self.lookup
