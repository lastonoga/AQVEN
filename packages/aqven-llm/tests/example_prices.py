from dataclasses import dataclass
from decimal import Decimal
from typing import Final

import httpx2

from aqven_llm import PriceSource, TokenPrice

ACME: Final = "acme"
ACME_MODEL_NAME: Final = "tiny-1"
ACME_PRICE: Final = TokenPrice(
    input_per_token=Decimal("0.000001"),
    output_per_token=Decimal("0.000002"),
    cached_input_per_token=None,
    per_request=None,
    source=ACME,
)


@dataclass(frozen=True, slots=True)
class AcmePrices:
    provider: str = ACME

    async def price(self, model_name: str) -> TokenPrice | None:
        return ACME_PRICE if model_name == ACME_MODEL_NAME else None


def build_acme_prices(http_client: httpx2.AsyncClient) -> PriceSource:
    return AcmePrices()


def build_broken_prices(http_client: httpx2.AsyncClient) -> PriceSource:
    raise RuntimeError("acme price list is offline")


NOT_A_FACTORY: Final = ACME
