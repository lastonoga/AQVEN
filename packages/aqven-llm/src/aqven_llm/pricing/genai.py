from dataclasses import dataclass
from decimal import Decimal
from typing import Final

from genai_prices import Usage, calc_price
from genai_prices.types import PriceCalculation

from aqven_llm.pricing.price import PRICING_LOGGER, ZERO_USD, TokenPrice

GENAI_PRICES_SOURCE: Final = "genai-prices"
ONE_TOKEN: Final = 1


def request_price(calculation: PriceCalculation) -> Decimal | None:
    charge = calculation.total_price - calculation.input_price - calculation.output_price
    return charge if charge > ZERO_USD else None


@dataclass(frozen=True, slots=True)
class GenaiPrices:
    """Token prices of one provider from the price snapshot bundled with `genai-prices`.

    Each price is `calc_price` of a request with one input and one output token, so it is the
    base per-token rate: long-context tiers that start at hundreds of thousands of input tokens
    do not apply. Provider aliases such as `openai-chat` or `bedrock` resolve the way
    `genai-prices` matches them.

    Args:
        provider: Provider id as written before the colon of a model reference.
    """

    provider: str

    async def price(self, model_name: str) -> TokenPrice | None:
        """Return the snapshot price of a model, or `None` when the snapshot does not know it.

        Args:
            model_name: Provider-native model name, such as `gpt-4o-mini`.
        """
        plain_usage = Usage(input_tokens=ONE_TOKEN, output_tokens=ONE_TOKEN)
        cached_usage = Usage(input_tokens=ONE_TOKEN, cache_read_tokens=ONE_TOKEN)
        try:
            plain = calc_price(plain_usage, model_name, provider_id=self.provider)
            cached = calc_price(cached_usage, model_name, provider_id=self.provider)
        except (LookupError, ValueError) as error:
            PRICING_LOGGER.debug("genai-prices has no price for %s:%s: %s", self.provider, model_name, error)
            return None
        return TokenPrice(
            input_per_token=plain.input_price,
            output_per_token=plain.output_price,
            cached_input_per_token=cached.input_price,
            per_request=request_price(plain),
            source=GENAI_PRICES_SOURCE,
        )
