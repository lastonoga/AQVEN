import asyncio
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Final

import httpx2
from pydantic import BaseModel, ValidationError

from aqven_llm.factory import CONNECT_TIMEOUT_SECONDS
from aqven_llm.pricing.price import PRICING_LOGGER, TokenPrice
from aqven_llm.routing import OPENROUTER_BASE_URL

type Clock = Callable[[], float]

OPENROUTER_PROVIDER: Final = "openrouter"
OPENROUTER_SOURCE: Final = "openrouter"
MODELS_PATH: Final = "/models"
DEFAULT_PRICE_TTL: Final = timedelta(hours=6)
RETRY_AFTER_FAILURE: Final = timedelta(minutes=1)
FETCH_READ_SECONDS: Final = 30.0
FETCH_TIMEOUT: Final = httpx2.Timeout(FETCH_READ_SECONDS, connect=CONNECT_TIMEOUT_SECONDS)


class OpenRouterPricing(BaseModel):
    prompt: str | None = None
    completion: str | None = None
    input_cache_read: str | None = None
    request: str | None = None


class OpenRouterModel(BaseModel):
    id: str
    pricing: OpenRouterPricing | None = None


class OpenRouterCatalog(BaseModel):
    data: list[OpenRouterModel]


def known_price(text: str | None) -> Decimal | None:
    if text is None:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    return value if value.is_finite() and value >= 0 else None


def openrouter_price(pricing: OpenRouterPricing | None) -> TokenPrice | None:
    if pricing is None:
        return None
    prompt = known_price(pricing.prompt)
    completion = known_price(pricing.completion)
    if prompt is None or completion is None:
        return None
    return TokenPrice(
        input_per_token=prompt,
        output_per_token=completion,
        cached_input_per_token=known_price(pricing.input_cache_read),
        per_request=known_price(pricing.request),
        source=OPENROUTER_SOURCE,
    )


def price_table(catalog: OpenRouterCatalog) -> dict[str, TokenPrice]:
    priced = ((model.id, openrouter_price(model.pricing)) for model in catalog.data)
    return {model_id: price for model_id, price in priced if price is not None}


@dataclass(frozen=True, slots=True)
class PriceSnapshot:
    prices: Mapping[str, TokenPrice]
    expires_at: float

    def fresh(self, now: float) -> bool:
        return now < self.expires_at


NO_SNAPSHOT: Final = PriceSnapshot(prices={}, expires_at=float("-inf"))


class OpenRouterPrices:
    """Token prices from the public OpenRouter model list, `GET {base_url}/models`.

    The list needs no API key. It is fetched once per `ttl` and shared by every lookup;
    concurrent lookups while it loads wait for the same single request. A model whose
    prompt or completion price is missing or negative (dynamic routers such as
    `openrouter/auto`) has no price. When the request or its parsing fails, every model
    answers `None` for a minute before the list is fetched again.

    Args:
        http_client: Client used for the request.
        base_url: OpenRouter API root.
        ttl: How long a fetched list stays current.
        clock: Monotonic clock in seconds; tests pass a fake one.
    """

    def __init__(
        self,
        http_client: httpx2.AsyncClient,
        base_url: str = OPENROUTER_BASE_URL,
        ttl: timedelta = DEFAULT_PRICE_TTL,
        *,
        clock: Clock = time.monotonic,
    ) -> None:
        self.http_client = http_client
        self.base_url = base_url
        self.ttl = ttl
        self.clock = clock
        self._snapshot = NO_SNAPSHOT
        self._lock = asyncio.Lock()

    @property
    def provider(self) -> str:
        """Always `openrouter`."""
        return OPENROUTER_PROVIDER

    async def price(self, model_name: str) -> TokenPrice | None:
        """Return the price of an OpenRouter model id, or `None` when it has no fixed price.

        Args:
            model_name: OpenRouter model id, such as `meta-llama/llama-3.1-8b-instruct`.
        """
        prices = await self._current()
        return prices.get(model_name)

    async def _current(self) -> Mapping[str, TokenPrice]:
        snapshot = self._snapshot
        if snapshot.fresh(self.clock()):
            return snapshot.prices
        async with self._lock:
            if self._snapshot is not snapshot:
                return self._snapshot.prices
            self._snapshot = await self._load()
            return self._snapshot.prices

    async def _load(self) -> PriceSnapshot:
        prices = await self._fetch()
        now = self.clock()
        if prices is None:
            return PriceSnapshot(prices={}, expires_at=now + RETRY_AFTER_FAILURE.total_seconds())
        return PriceSnapshot(prices=prices, expires_at=now + self.ttl.total_seconds())

    async def _fetch(self) -> Mapping[str, TokenPrice] | None:
        url = f"{self.base_url.rstrip('/')}{MODELS_PATH}"
        try:
            response = await self.http_client.get(url, timeout=FETCH_TIMEOUT)
            response.raise_for_status()
            catalog = OpenRouterCatalog.model_validate_json(response.content)
        except (httpx2.HTTPError, ValidationError) as error:
            PRICING_LOGGER.debug("OpenRouter prices are unavailable from %s: %s", url, error)
            return None
        return price_table(catalog)
