import asyncio
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field

from aqven_llm.catalog import PROVIDER_SEPARATOR
from aqven_llm.pricing.genai import GenaiPrices
from aqven_llm.pricing.price import PRICING_LOGGER, PriceSource, TokenPrice

type FallbackPrices = Callable[[str], PriceSource]


async def asked_price(source: PriceSource, model_name: str) -> TokenPrice | None:
    try:
        return await source.price(model_name)
    except Exception as error:
        PRICING_LOGGER.debug("price source %s failed for %s: %s", source.provider, model_name, error)
        return None


@dataclass(frozen=True, slots=True)
class PriceLookup:
    """Prices of `provider:name` model references through a chain of price sources.

    A model is asked of its provider's registered source first, then of the fallback built for
    that provider (`GenaiPrices` by default); the first price wins and a model neither knows is
    unknown. A failing source never raises: the chain moves on to the next one.

    Args:
        sources: Registered price sources by provider id.
        fallback: Builds the last source of the chain for a provider id.
    """

    sources: Mapping[str, PriceSource] = field(default_factory=dict[str, PriceSource])
    fallback: FallbackPrices = GenaiPrices

    async def price(self, model: str) -> TokenPrice | None:
        """Return the price of one model, or `None` when no source knows it.

        Args:
            model: Model reference `provider:name`, such as `openrouter:meta-llama/llama-3.1-8b-instruct`.
        """
        provider, separator, name = model.partition(PROVIDER_SEPARATOR)
        if not separator or not name:
            return None
        for source in self.chain(provider):
            found = await asked_price(source, name)
            if found is not None:
                return found
        return None

    async def prices(self, models: Iterable[str]) -> Mapping[str, TokenPrice]:
        """Return the prices of several models at once, asking every source concurrently.

        Args:
            models: Model references `provider:name`; repeats are asked once.

        Returns:
            Prices by model reference; models without a known price are left out.
        """
        unique = tuple(dict.fromkeys(models))
        found = await asyncio.gather(*(self.price(model) for model in unique))
        return {model: price for model, price in zip(unique, found, strict=True) if price is not None}

    def chain(self, provider: str) -> tuple[PriceSource, ...]:
        """Return the sources asked for a provider's models, in order.

        Args:
            provider: Provider id, the part of a model reference before the colon.
        """
        registered = self.sources.get(provider)
        fallback = self.fallback(provider)
        return (fallback,) if registered is None else (registered, fallback)
