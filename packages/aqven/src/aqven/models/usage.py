from collections.abc import Callable, Generator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final, Literal, Protocol

from genai_prices import calc_price
from pydantic_ai.messages import ModelResponse
from pydantic_ai.usage import RequestUsage

from aqven.models.callsite import CallSite
from aqven.ports.prices import NO_PRICES, CachedPrices
from aqven.runtime.costs import UNKNOWN_COST_SOURCE, weakest_cost_source
from aqven.runtime.vocabulary import CostSource

type UsageSource = Literal["live", "replay"]

PROVIDER_COST_KEY: Final = "cost"
CASSETTE_METADATA_KEY: Final = "aqven.cassette"
ZERO_COST: Final = Decimal(0)
USD_MICROS: Final = Decimal(1_000_000)


@dataclass(frozen=True, slots=True)
class PricedCost:
    usd: Decimal | None
    source: CostSource


UNKNOWN_COST: Final = PricedCost(usd=None, source=UNKNOWN_COST_SOURCE)
REPLAYED_COST: Final = PricedCost(usd=ZERO_COST, source="provider")


@dataclass(frozen=True, slots=True)
class PricedCall:
    model_ref: str
    response: ModelResponse
    prices: CachedPrices


type CostRule = Callable[[PricedCall], PricedCost | None]


@dataclass(frozen=True, slots=True)
class RequestCost:
    site: CallSite
    model_ref: str
    model_name: str | None
    provider_name: str | None
    source: UsageSource
    usage: RequestUsage
    cost: Decimal | None
    cost_source: CostSource

    @property
    def unpriced(self) -> bool:
        return self.cost_source == UNKNOWN_COST_SOURCE


class UsageSink(Protocol):
    def record(self, cost: RequestCost) -> None: ...


class UsageLog:
    def __init__(self) -> None:
        self.entries: list[RequestCost] = []

    def record(self, cost: RequestCost) -> None:
        self.entries.append(cost)

    def total_cost(self) -> Decimal:
        return sum((entry.cost or ZERO_COST for entry in self.entries), ZERO_COST)

    def cost_source(self) -> CostSource:
        return weakest_cost_source(entry.cost_source for entry in self.entries)

    def unpriced_calls(self) -> int:
        return sum(1 for entry in self.entries if entry.unpriced)


class DiscardUsage:
    def record(self, cost: RequestCost) -> None:
        return None


NODE_USAGE: Final[ContextVar[UsageLog | None]] = ContextVar("aqven_node_usage", default=None)


class ContextUsageSink:
    def record(self, cost: RequestCost) -> None:
        log = NODE_USAGE.get()
        if log is None:
            return
        log.record(cost)


@contextmanager
def node_usage_log() -> Generator[UsageLog]:
    log = UsageLog()
    token = NODE_USAGE.set(log)
    try:
        yield log
    finally:
        NODE_USAGE.reset(token)


def usd_of_micros(usd_micros: int | None) -> Decimal | None:
    if usd_micros is None:
        return None
    return Decimal(usd_micros) / USD_MICROS


def replayed(response: ModelResponse) -> bool:
    return bool((response.metadata or {}).get(CASSETTE_METADATA_KEY))


def provider_cost(response: ModelResponse) -> Decimal | None:
    reported = (response.provider_details or {}).get(PROVIDER_COST_KEY)
    if reported is None or isinstance(reported, bool):
        return None
    try:
        value = Decimal(str(reported))
    except InvalidOperation:
        return None
    return value if value.is_finite() else None


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


def table_cost(call: PricedCall) -> Decimal | None:
    price = call.prices.cached(call.model_ref)
    if price is None:
        return None
    usage = call.response.usage
    return price.cost(usage.input_tokens, usage.output_tokens, usage.cache_read_tokens)


def replayed_rule(call: PricedCall) -> PricedCost | None:
    return REPLAYED_COST if replayed(call.response) else None


def reported_rule(call: PricedCall) -> PricedCost | None:
    reported = provider_cost(call.response)
    return None if reported is None else PricedCost(usd=reported, source="provider")


def table_rule(call: PricedCall) -> PricedCost | None:
    priced = table_cost(call)
    return None if priced is None else PricedCost(usd=priced, source="prices")


def genai_rule(call: PricedCall) -> PricedCost | None:
    estimated = estimated_cost(call.response)
    return None if estimated is None else PricedCost(usd=estimated, source="genai")


COST_RULES: Final[tuple[CostRule, ...]] = (replayed_rule, reported_rule, table_rule, genai_rule)


def response_cost(response: ModelResponse, model_ref: str, prices: CachedPrices = NO_PRICES) -> PricedCost:
    call = PricedCall(model_ref=model_ref, response=response, prices=prices)
    return next((priced for rule in COST_RULES if (priced := rule(call)) is not None), UNKNOWN_COST)


def live_cost(site: CallSite, model_ref: str, response: ModelResponse, prices: CachedPrices = NO_PRICES) -> RequestCost:
    priced = response_cost(response, model_ref, prices)
    return RequestCost(
        site=site,
        model_ref=model_ref,
        model_name=response.model_name,
        provider_name=response.provider_name,
        source="live",
        usage=response.usage,
        cost=priced.usd,
        cost_source=priced.source,
    )


def replay_cost(site: CallSite, model_ref: str, response: ModelResponse, recorded: RequestUsage) -> RequestCost:
    return RequestCost(
        site=site,
        model_ref=model_ref,
        model_name=response.model_name,
        provider_name=response.provider_name,
        source="replay",
        usage=recorded,
        cost=REPLAYED_COST.usd,
        cost_source=REPLAYED_COST.source,
    )
