from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import cache
from importlib.metadata import EntryPoint, entry_points
from typing import Final, cast

import httpx2

from aqven_llm.factory import default_http_client
from aqven_llm.pricing.lookup import PriceLookup
from aqven_llm.pricing.openrouter import OPENROUTER_PROVIDER, OpenRouterPrices
from aqven_llm.pricing.price import PRICING_LOGGER, PriceSource, TokenPrice

type PriceSourceFactory = Callable[[httpx2.AsyncClient], PriceSource]

PRICE_SOURCE_GROUP: Final = "aqven.price_sources"
PRICE_SOURCE_FACTORIES: Final[Mapping[str, PriceSourceFactory]] = {OPENROUTER_PROVIDER: OpenRouterPrices}


@dataclass(frozen=True, slots=True)
class UnavailablePrices:
    provider: str
    detail: str

    def __call__(self, http_client: httpx2.AsyncClient) -> PriceSource:
        return self

    async def price(self, model_name: str) -> TokenPrice | None:
        PRICING_LOGGER.debug("no %s price for %s: %s", self.provider, model_name, self.detail)
        return None


def unavailable(provider: str, detail: str) -> UnavailablePrices:
    PRICING_LOGGER.warning("price source %s is unavailable: %s", provider, detail)
    return UnavailablePrices(provider, detail)


def entry_point_price_source(point: EntryPoint) -> PriceSourceFactory:
    """Load one `aqven.price_sources` entry point as a price source factory.

    The entry point name is the provider id and its value is a callable that takes an
    `httpx2.AsyncClient` and returns a `PriceSource`. An entry point that does not import or is
    not callable is logged and becomes a source that knows no prices.

    Args:
        point: The entry point to load.
    """
    try:
        loaded: object = point.load()
    except Exception as error:
        detail = f"entry point {PRICE_SOURCE_GROUP}:{point.name} does not import: {type(error).__name__}: {error}"
        return unavailable(point.name, detail)
    if callable(loaded):
        return cast(PriceSourceFactory, loaded)
    detail = f"entry point {PRICE_SOURCE_GROUP}:{point.name} is {type(loaded).__name__}, not a price source factory"
    return unavailable(point.name, detail)


@cache
def installed_price_sources() -> Mapping[str, PriceSourceFactory]:
    """Return the price source factories installed packages register under `aqven.price_sources`."""
    return {point.name: entry_point_price_source(point) for point in entry_points(group=PRICE_SOURCE_GROUP)}


def built_source(provider: str, factory: PriceSourceFactory, http_client: httpx2.AsyncClient) -> PriceSource:
    try:
        return factory(http_client)
    except Exception as error:
        return unavailable(provider, f"factory failed: {type(error).__name__}: {error}")


def build_price_lookup(
    http_client: httpx2.AsyncClient | None = None, *, factories: Mapping[str, PriceSourceFactory] | None = None
) -> PriceLookup:
    """Build the price lookup chain: provider source, then `genai-prices`, then unknown.

    Args:
        http_client: Client the price sources share; `default_http_client()` when omitted.
        factories: Price source factories by provider id; by default the built-in
            `PRICE_SOURCE_FACTORIES` overlaid with `installed_price_sources()`, so an installed
            package can replace a built-in source for its provider.
    """
    client = default_http_client() if http_client is None else http_client
    chosen = {**PRICE_SOURCE_FACTORIES, **installed_price_sources()} if factories is None else factories
    return PriceLookup({provider: built_source(provider, factory, client) for provider, factory in chosen.items()})
