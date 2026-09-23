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


def model_parts(model: str) -> tuple[str, str] | None:
    provider, separator, name = model.partition(PROVIDER_SEPARATOR)
    if not separator or not name:
        return None
    return provider, name


@dataclass(frozen=True, slots=True)
class PriceLookup:
    """Prices of `provider:name` model references through a chain of price sources.

    A model is asked of its provider's registered source first, then of the fallback built for
    that provider (`GenaiPrices` by default); the first price wins and a model neither knows is
    unknown. A failing source never raises: the chain moves on to the next one.

    The lookup also keeps an in-memory table of provider prices for code that cannot await:
    `warm` fills it from the registered provider sources, `cached` reads it synchronously.

    Args:
        sources: Registered price sources by provider id.
        fallback: Builds the last source of the chain for a provider id.
    """

    sources: Mapping[str, PriceSource] = field(default_factory=dict[str, PriceSource])
    fallback: FallbackPrices = GenaiPrices
    warmed: dict[str, TokenPrice] = field(default_factory=dict[str, TokenPrice], init=False, repr=False, compare=False)

    async def price(self, model: str) -> TokenPrice | None:
        """Return the price of one model, or `None` when no source knows it.

        Args:
            model: Model reference `provider:name`, such as `openrouter:meta-llama/llama-3.1-8b-instruct`.
        """
        parts = model_parts(model)
        if parts is None:
            return None
        provider, name = parts
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

    async def warm(self, models: Iterable[str]) -> None:
        """Ask the registered provider sources for several models and keep their prices for `cached`.

        Only a provider's own registered source is asked, concurrently and once per model: the
        fallback is left out of the table. A model its source does not price, a model of a provider
        without a registered source and a source that fails leave the table as it was, so a price
        warmed earlier stays until its source publishes a new one. Never raises.

        Args:
            models: Model references `provider:name`, such as the models of a compiled plan.
        """
        unique = tuple(dict.fromkeys(models))
        found = await asyncio.gather(*(self.provider_price(model) for model in unique))
        self.warmed.update({model: price for model, price in zip(unique, found, strict=True) if price is not None})

    def cached(self, model: str) -> TokenPrice | None:
        """Return the provider price `warm` kept for a model, without awaiting anything.

        Args:
            model: Model reference `provider:name`.

        Returns:
            The price the provider's registered source gave at the last `warm` that priced the
            model, or `None` when no `warm` priced it.
        """
        return self.warmed.get(model)

    async def provider_price(self, model: str) -> TokenPrice | None:
        """Return the price of one model from its provider's registered source alone.

        Args:
            model: Model reference `provider:name`.

        Returns:
            The registered source's price, or `None` when the reference is malformed, the provider
            has no registered source or the source does not price the model.
        """
        parts = model_parts(model)
        if parts is None:
            return None
        provider, name = parts
        source = self.sources.get(provider)
        if source is None:
            return None
        return await asked_price(source, name)

    def chain(self, provider: str) -> tuple[PriceSource, ...]:
        """Return the sources asked for a provider's models, in order.

        Args:
            provider: Provider id, the part of a model reference before the colon.
        """
        registered = self.sources.get(provider)
        fallback = self.fallback(provider)
        return (fallback,) if registered is None else (registered, fallback)
