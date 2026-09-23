from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final, Literal, Protocol

from genai_prices import calc_price
from pydantic_ai.messages import ModelResponse
from pydantic_ai.usage import RequestUsage

from aqven.models.callsite import CallSite

type UsageSource = Literal["live", "replay"]

PROVIDER_COST_KEY: Final = "cost"
CASSETTE_METADATA_KEY: Final = "aqven.cassette"
ZERO_COST: Final = Decimal(0)
USD_MICROS: Final = Decimal(1_000_000)


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


def replayed(response: ModelResponse) -> bool:
    return bool((response.metadata or {}).get(CASSETTE_METADATA_KEY))


def response_cost_usd(response: ModelResponse) -> Decimal:
    if replayed(response):
        return ZERO_COST
    reported = provider_cost(response)
    if reported is not None:
        return reported
    return estimated_cost(response) or ZERO_COST


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
