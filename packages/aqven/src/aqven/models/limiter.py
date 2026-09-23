from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from decimal import Decimal

from pydantic_ai.concurrency import AbstractConcurrencyLimiter, get_concurrency_context
from pydantic_ai.messages import ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import RequestUsage, RunUsage, UsageLimits

from aqven.models.callsite import current_call_site
from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel
from aqven.models.usage import DiscardUsage, RequestCost, UsageSink, live_cost
from aqven.ports.prices import NO_PRICES, CachedPrices


@dataclass(slots=True)
class UsageBudget:
    limits: UsageLimits
    ledger: RunUsage = field(default_factory=RunUsage)

    def before_request(self) -> None:
        self.limits.check_before_request(self.ledger)

    def after_response(self, usage: RequestUsage, cost: Decimal | None) -> None:
        self.ledger.requests += 1
        self.ledger.incr(usage)
        self.ledger.cost = add_cost(self.ledger.cost, cost)
        self.limits.check_tokens(self.ledger)
        self.limits.check_cost(self.ledger, warn_if_cost_unavailable=False)


def add_cost(total: Decimal | None, cost: Decimal | None) -> Decimal | None:
    if cost is None:
        return total
    return (total or Decimal(0)) + cost


class UsageRelay:
    def __init__(self, model: LimiterModel, source: StreamedResponse) -> None:
        self.model = model
        self.source = source

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            yield event
        self.model.settle(self.source.get())

    def response(self, response: ModelResponse) -> ModelResponse:
        return response


class LimiterModel(StreamFirstModel):
    def __init__(
        self,
        wrapped: Model,
        *,
        model_ref: str,
        concurrency: AbstractConcurrencyLimiter | None = None,
        budget: UsageBudget | None = None,
        usage_sink: UsageSink | None = None,
        prices: CachedPrices = NO_PRICES,
    ) -> None:
        super().__init__(wrapped)
        self.model_ref = model_ref
        self.concurrency = concurrency
        self.budget = budget
        self.usage_sink: UsageSink = DiscardUsage() if usage_sink is None else usage_sink
        self.prices = prices

    def settle(self, response: ModelResponse) -> RequestCost:
        cost = live_cost(current_call_site(), self.model_ref, response, self.prices)
        self.usage_sink.record(cost)
        if self.budget is not None:
            self.budget.after_response(cost.usage, cost.cost)
        return cost

    def check_budget(self) -> None:
        if self.budget is not None:
            self.budget.before_request()

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        self.check_budget()
        async with (
            get_concurrency_context(self.concurrency, f"model:{self.model_ref}"),
            self.wrapped.request_stream(messages, model_settings, model_request_parameters, run_context) as stream,
        ):
            yield RelayedStream(stream, UsageRelay(self, stream))
