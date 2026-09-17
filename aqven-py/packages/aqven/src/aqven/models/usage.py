from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final, Literal, Protocol

from genai_prices import calc_price
from pydantic_ai.messages import ModelResponse
from pydantic_ai.usage import RequestUsage

from aqven.models.callsite import CallSite

type UsageSource = Literal["live", "replay"]

PROVIDER_COST_KEY: Final = "cost"
ZERO_COST: Final = Decimal(0)


@dataclass(frozen=True, slots=True)
class RequestCost:
    site: CallSite
    model_ref: str
    model_name: str | None
    provider_name: str | None
    source: UsageSource
    usage: RequestUsage
    estimated_cost: Decimal | None
    provider_cost: Decimal | None

    @property
    def cost(self) -> Decimal | None:
        return self.provider_cost if self.provider_cost is not None else self.estimated_cost


class UsageSink(Protocol):
    def record(self, cost: RequestCost) -> None: ...


class UsageLog:
    def __init__(self) -> None:
        self.entries: list[RequestCost] = []

    def record(self, cost: RequestCost) -> None:
        self.entries.append(cost)

    def total_cost(self) -> Decimal:
        return sum((entry.cost or ZERO_COST for entry in self.entries), ZERO_COST)


class DiscardUsage:
    def record(self, cost: RequestCost) -> None:
        return None


def estimated_cost(response: ModelResponse) -> Decimal | None:
    if not response.model_name:
        return None
    try:
        return calc_price(
            response.usage,
            response.model_name,
            provider_id=response.provider_name,
            genai_request_timestamp=response.timestamp,
        ).total_price
    except LookupError:
        return None


def provider_cost(response: ModelResponse) -> Decimal | None:
    reported = (response.provider_details or {}).get(PROVIDER_COST_KEY)
    if reported is None or isinstance(reported, bool):
        return None
    try:
        return Decimal(str(reported))
    except InvalidOperation:
        return None


def live_cost(site: CallSite, model_ref: str, response: ModelResponse) -> RequestCost:
    return RequestCost(
        site=site,
        model_ref=model_ref,
        model_name=response.model_name,
        provider_name=response.provider_name,
        source="live",
        usage=response.usage,
        estimated_cost=estimated_cost(response),
        provider_cost=provider_cost(response),
    )


def replay_cost(site: CallSite, model_ref: str, response: ModelResponse, recorded: RequestUsage) -> RequestCost:
    return RequestCost(
        site=site,
        model_ref=model_ref,
        model_name=response.model_name,
        provider_name=response.provider_name,
        source="replay",
        usage=recorded,
        estimated_cost=ZERO_COST,
        provider_cost=ZERO_COST,
    )
