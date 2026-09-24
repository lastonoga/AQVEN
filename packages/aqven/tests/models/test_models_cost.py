from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest
from pydantic import JsonValue
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.usage import RequestUsage

from aqven.models.callsite import CallSite
from aqven.models.usage import (
    CASSETTE_METADATA_KEY,
    NODE_USAGE,
    ContextUsageSink,
    PricedCost,
    UsageLog,
    live_cost,
    node_usage_log,
    replay_cost,
    response_cost,
)
from aqven.ports.prices import NO_PRICES
from aqven_llm import TokenPrice

MOMENT: Final = datetime(2026, 9, 17, tzinfo=UTC)
PRICED_MODEL: Final = "gpt-4o"
PRICED_REF: Final = "openai:gpt-4o"
IMAGE_MODEL: Final = "google/gemini-3.1-flash-lite-image"
IMAGE_REF: Final = f"openrouter:{IMAGE_MODEL}"
IMAGE_COST: Final = Decimal("0.0337")
TABLE_MODEL: Final = "acme/tiny-1"
TABLE_REF: Final = f"openrouter:{TABLE_MODEL}"
UNKNOWN_REF: Final = "scripted:scripted"
TABLE_PRICE: Final = TokenPrice(
    input_per_token=Decimal("0.000002"),
    output_per_token=Decimal("0.00001"),
    cached_input_per_token=Decimal("0.0000005"),
    per_request=None,
    source="openrouter",
)
TABLE_USAGE: Final = RequestUsage(input_tokens=1000, output_tokens=200, cache_read_tokens=400)
TABLE_COST: Final = Decimal("0.0012") + Decimal("0.0002") + Decimal("0.002")
SITE: Final = CallSite(address=None, attempt=1)


@dataclass(frozen=True, slots=True)
class TablePrices:
    table: Mapping[str, TokenPrice] = field(default_factory=lambda: {TABLE_REF: TABLE_PRICE, PRICED_REF: TABLE_PRICE})

    def cached(self, model: str) -> TokenPrice | None:
        return self.table.get(model)

    async def warm(self, models: Iterable[str]) -> None:
        return None


TABLE: Final = TablePrices()


def response(
    model_name: str,
    *,
    provider: str,
    usage: RequestUsage | None = None,
    provider_details: dict[str, JsonValue] | None = None,
    metadata: dict[str, JsonValue] | None = None,
) -> ModelResponse:
    return ModelResponse(
        parts=[TextPart("answer")],
        usage=usage or RequestUsage(),
        model_name=model_name,
        provider_name=provider,
        provider_details=provider_details,
        metadata=metadata,
        timestamp=MOMENT,
    )


def image_response(cost: JsonValue) -> ModelResponse:
    return response(IMAGE_MODEL, provider="openrouter", provider_details={"cost": cost})


def table_response(cost: JsonValue = None) -> ModelResponse:
    details: dict[str, JsonValue] | None = None if cost is None else {"cost": cost}
    return response(TABLE_MODEL, provider="openrouter", usage=TABLE_USAGE, provider_details=details)


def test_a_replayed_response_is_free_even_with_a_recorded_provider_cost_and_a_table_price() -> None:
    replayed = response(
        TABLE_MODEL,
        provider="openrouter",
        usage=TABLE_USAGE,
        provider_details={"cost": 0.0337},
        metadata={CASSETTE_METADATA_KEY: {"hit": True, "key": "sha256-0"}},
    )

    assert response_cost(replayed, TABLE_REF, TABLE) == PricedCost(usd=Decimal(0), source="provider")


def test_the_provider_cost_wins_over_the_price_table_and_genai_prices() -> None:
    reported = response(
        PRICED_MODEL,
        provider="openai",
        usage=RequestUsage(input_tokens=1000, output_tokens=1000),
        provider_details={"cost": 0.0002},
    )

    assert response_cost(reported, PRICED_REF, TABLE) == PricedCost(usd=Decimal("0.0002"), source="provider")


def test_image_output_without_token_prices_takes_the_provider_cost() -> None:
    assert response_cost(image_response(0.0337), IMAGE_REF) == PricedCost(usd=IMAGE_COST, source="provider")


def test_the_price_table_bills_input_output_and_cached_input_tokens() -> None:
    assert response_cost(table_response(), TABLE_REF, TABLE) == PricedCost(usd=TABLE_COST, source="prices")


def test_the_price_table_wins_over_genai_prices() -> None:
    priced = response(PRICED_MODEL, provider="openai", usage=TABLE_USAGE)

    assert response_cost(priced, PRICED_REF, TABLE) == PricedCost(usd=TABLE_COST, source="prices")


def test_the_price_table_is_keyed_by_the_model_reference_of_the_call() -> None:
    assert response_cost(table_response(), "openrouter:acme/other", TABLE).source == "unknown"


def test_genai_prices_fill_in_without_a_provider_cost_or_a_table_price() -> None:
    priced = response(PRICED_MODEL, provider="openai", usage=RequestUsage(input_tokens=1000, output_tokens=1000))

    assert response_cost(priced, PRICED_REF) == PricedCost(usd=Decimal("0.0125"), source="genai")


def test_an_unknown_model_without_any_price_is_unknown_not_free() -> None:
    assert response_cost(response("scripted", provider="scripted"), UNKNOWN_REF) == PricedCost(
        usd=None, source="unknown"
    )


def test_a_response_without_a_model_name_is_unknown() -> None:
    nameless = ModelResponse(parts=[TextPart("answer")], usage=TABLE_USAGE, timestamp=MOMENT)

    assert response_cost(nameless, UNKNOWN_REF).source == "unknown"


@pytest.mark.parametrize("malformed", ["free", True, "NaN", "Infinity", [0.1]])
def test_a_malformed_provider_cost_falls_through_to_the_price_table(malformed: JsonValue) -> None:
    assert response_cost(table_response(malformed), TABLE_REF, TABLE) == PricedCost(usd=TABLE_COST, source="prices")


@pytest.mark.parametrize("malformed", ["free", True])
def test_a_malformed_provider_cost_without_other_prices_is_unknown(malformed: JsonValue) -> None:
    assert response_cost(image_response(malformed), IMAGE_REF, NO_PRICES).source == "unknown"


def test_live_cost_records_the_cost_and_where_it_came_from() -> None:
    cost = live_cost(SITE, TABLE_REF, table_response(), TABLE)

    assert (cost.cost, cost.cost_source, cost.source, cost.unpriced) == (TABLE_COST, "prices", "live", False)
    assert (cost.model_ref, cost.model_name, cost.provider_name) == (TABLE_REF, TABLE_MODEL, "openrouter")


def test_an_unknown_live_cost_is_recorded_as_unpriced() -> None:
    cost = live_cost(SITE, UNKNOWN_REF, response("scripted", provider="scripted"))

    assert (cost.cost, cost.cost_source, cost.unpriced) == (None, "unknown", True)


def test_replay_cost_is_an_exact_zero() -> None:
    replayed = image_response(0.0337)

    cost = replay_cost(SITE, IMAGE_REF, replayed, replayed.usage)

    assert (cost.cost, cost.cost_source, cost.source) == (Decimal(0), "provider", "replay")


def test_node_usage_log_sums_every_settled_request_of_the_node() -> None:
    sink = ContextUsageSink()

    with node_usage_log() as log:
        sink.record(live_cost(SITE, IMAGE_REF, image_response(0.0337)))
        sink.record(live_cost(SITE, IMAGE_REF, image_response(0.0216)))

    assert log.total_cost() == IMAGE_COST + Decimal("0.0216")
    assert (log.cost_source(), log.unpriced_calls()) == ("provider", 0)
    assert NODE_USAGE.get() is None


def test_the_node_log_reports_its_weakest_source_and_counts_unpriced_calls() -> None:
    log = UsageLog()
    log.record(live_cost(SITE, IMAGE_REF, image_response(0.0337)))
    log.record(live_cost(SITE, TABLE_REF, table_response(), TABLE))
    log.record(live_cost(SITE, UNKNOWN_REF, response("scripted", provider="scripted")))
    log.record(live_cost(SITE, UNKNOWN_REF, response("scripted", provider="scripted")))

    assert log.total_cost() == IMAGE_COST + TABLE_COST
    assert (log.cost_source(), log.unpriced_calls()) == ("unknown", 2)


@pytest.mark.parametrize(
    ("responses", "expected"),
    [
        ((), "provider"),
        ((image_response(0.01),), "provider"),
        ((image_response(0.01), table_response()), "prices"),
        (
            (
                table_response(),
                response(PRICED_MODEL, provider="openai", usage=TABLE_USAGE),
            ),
            "genai",
        ),
    ],
)
def test_the_weakest_source_of_the_node_wins(responses: tuple[ModelResponse, ...], expected: str) -> None:
    log = UsageLog()
    for item in responses:
        prices = TABLE if item.model_name == TABLE_MODEL else NO_PRICES
        reference = TABLE_REF if item.model_name == TABLE_MODEL else PRICED_REF
        log.record(live_cost(SITE, reference, item, prices))

    assert log.cost_source() == expected


def test_node_usage_log_counts_a_replayed_request_as_free() -> None:
    replayed = image_response(0.0337)

    with node_usage_log() as log:
        ContextUsageSink().record(replay_cost(SITE, IMAGE_REF, replayed, replayed.usage))

    assert log.total_cost() == Decimal(0)
    assert len(log.entries) == 1


def test_context_usage_sink_outside_a_node_records_nothing() -> None:
    ContextUsageSink().record(live_cost(SITE, IMAGE_REF, image_response(0.0337)))

    assert NODE_USAGE.get() is None
