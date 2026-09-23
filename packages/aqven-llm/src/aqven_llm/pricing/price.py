import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Protocol

ZERO_USD: Final = Decimal(0)
PRICING_LOGGER: Final = logging.getLogger("aqven_llm.pricing")


@dataclass(frozen=True, slots=True)
class TokenPrice:
    """USD price of one model's tokens, as published by a price source.

    Attributes:
        input_per_token: USD per input (prompt) token that is not served from a cache.
        output_per_token: USD per output (completion) token.
        cached_input_per_token: USD per input token served from the provider cache, or `None`
            when the source publishes no cached price; cached tokens then cost as ordinary input.
        per_request: USD charged once per request on top of tokens, or `None` when the source
            publishes no such charge.
        source: Name of the price source that published the price, such as `openrouter` or `genai-prices`.
    """

    input_per_token: Decimal
    output_per_token: Decimal
    cached_input_per_token: Decimal | None
    per_request: Decimal | None
    source: str

    def cost(self, tokens_in: int, tokens_out: int, cached_in: int = 0) -> Decimal:
        """Return the USD cost of one request.

        Args:
            tokens_in: Every input token of the request, cached ones included.
            tokens_out: Output tokens of the request.
            cached_in: How many of `tokens_in` the provider served from its cache.

        Returns:
            Input, cached input and output tokens at their prices plus the per-request charge.
        """
        cached = min(max(cached_in, 0), tokens_in)
        cached_rate = self.input_per_token if self.cached_input_per_token is None else self.cached_input_per_token
        tokens = (tokens_in - cached) * self.input_per_token + cached * cached_rate + tokens_out * self.output_per_token
        return tokens + (self.per_request or ZERO_USD)


class PriceSource(Protocol):
    """A source of token prices for one provider, keyed by the provider's own model names.

    A source never raises to its caller: an unknown model, an unreachable price list or a
    payload it cannot read all answer `None`, so a price lookup can fall through to the next source.
    """

    @property
    def provider(self) -> str:
        """Provider id the source prices: the part of a model reference before the colon."""
        ...

    async def price(self, model_name: str) -> TokenPrice | None:
        """Return the price of a model, or `None` when the source does not know it.

        Args:
            model_name: Provider-native model name, without the `provider:` prefix,
                such as `meta-llama/llama-3.1-8b-instruct` for OpenRouter.
        """
        ...
