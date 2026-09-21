from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from pydantic import JsonValue
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.usage import RequestUsage

from aqven.engine.llm.agents import response_cost
from aqven.models.usage import CASSETTE_METADATA_KEY, response_cost_usd

MOMENT: Final = datetime(2026, 9, 17, tzinfo=UTC)
PRICED_MODEL: Final = "gpt-4o"
IMAGE_MODEL: Final = "google/gemini-3.1-flash-lite-image"
IMAGE_COST: Final = Decimal("0.0337")


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


def test_provider_cost_wins_over_genai_prices() -> None:
    reported = response(
        PRICED_MODEL,
        provider="openai",
        usage=RequestUsage(input_tokens=1000, output_tokens=1000),
        provider_details={"cost": 0.0002},
    )

    assert response_cost_usd(reported) == Decimal("0.0002")


def test_image_output_without_token_prices_takes_the_provider_cost() -> None:
    assert response_cost_usd(image_response(0.0337)) == IMAGE_COST


def test_genai_prices_fill_in_when_the_provider_reports_nothing() -> None:
    priced = response(PRICED_MODEL, provider="openai", usage=RequestUsage(input_tokens=1000, output_tokens=1000))

    assert response_cost_usd(priced) == Decimal("0.0125")


def test_an_unknown_model_without_a_provider_cost_is_free() -> None:
    assert response_cost_usd(response("scripted", provider="scripted")) == Decimal(0)


def test_a_replayed_response_is_free_even_with_a_recorded_provider_cost() -> None:
    replayed = response(
        IMAGE_MODEL,
        provider="openrouter",
        provider_details={"cost": 0.0337},
        metadata={CASSETTE_METADATA_KEY: {"hit": True, "key": "sha256-0"}},
    )

    assert response_cost_usd(replayed) == Decimal(0)


def test_a_malformed_provider_cost_falls_back_to_genai_prices() -> None:
    assert response_cost_usd(image_response("free")) == Decimal(0)
    assert response_cost_usd(image_response(True)) == Decimal(0)


def test_node_cost_sums_the_responses_of_a_conversation() -> None:
    messages: list[ModelMessage] = [
        ModelRequest(parts=[UserPromptPart("draw a cat")]),
        image_response(0.0337),
        image_response(0.0216),
    ]

    assert response_cost(messages) == IMAGE_COST + Decimal("0.0216")
