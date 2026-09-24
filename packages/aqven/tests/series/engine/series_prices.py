from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Final

from aqven_llm import TokenPrice

MILLION: Final = Decimal(1_000_000)
FIXTURE_SOURCE: Final = "fixture"


def per_million(input_usd: str, output_usd: str) -> TokenPrice:
    return TokenPrice(
        input_per_token=Decimal(input_usd) / MILLION,
        output_per_token=Decimal(output_usd) / MILLION,
        cached_input_per_token=None,
        per_request=None,
        source=FIXTURE_SOURCE,
    )


FIXTURE_PRICES: Final[Mapping[str, TokenPrice]] = {
    "openai:gpt-4o-mini": per_million("0.15", "0.6"),
    "openai:gpt-4.1-mini": per_million("0.4", "1.6"),
    "openai:gpt-4.1-nano": per_million("0.1", "0.4"),
}


@dataclass(slots=True)
class FixedPrices:
    table: Mapping[str, TokenPrice] = field(default_factory=dict[str, TokenPrice])
    asked: list[tuple[str, ...]] = field(default_factory=list[tuple[str, ...]])

    async def prices(self, models: Iterable[str]) -> Mapping[str, TokenPrice]:
        wanted = tuple(models)
        self.asked.append(wanted)
        return {model: self.table[model] for model in wanted if model in self.table}
