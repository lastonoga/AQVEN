import asyncio
import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from importlib.metadata import EntryPoint
from pathlib import Path
from typing import Final

import httpx2
import pytest
from example_prices import ACME, ACME_MODEL_NAME, ACME_PRICE, AcmePrices
from pydantic import JsonValue

import aqven_llm.pricing.registry
from aqven_llm import (
    PRICE_SOURCE_FACTORIES,
    PRICE_SOURCE_GROUP,
    GenaiPrices,
    OpenRouterPrices,
    PriceLookup,
    PriceSource,
    TokenPrice,
    build_price_lookup,
    entry_point_price_source,
    installed_price_sources,
)

FIXTURE: Final = Path(__file__).parent / "fixtures" / "openrouter" / "models.json"
MODELS_URL_PATH: Final = "/api/v1/models"
LLAMA: Final = "meta-llama/llama-3.1-8b-instruct"
SONNET: Final = "anthropic/claude-sonnet-4.5"
FREE_QWEN: Final = "qwen/qwen3.8-27b:free"
AUTO_ROUTER: Final = "openrouter/auto"
TTL: Final = timedelta(hours=6)
CONCURRENT_LOOKUPS: Final = 12
ACME_MODEL: Final = f"{ACME}:{ACME_MODEL_NAME}"
ACME_ENTRY: Final = EntryPoint(name=ACME, value="example_prices:build_acme_prices", group=PRICE_SOURCE_GROUP)
BROKEN_ENTRY: Final = EntryPoint(name=ACME, value="example_prices:NOT_A_FACTORY", group=PRICE_SOURCE_GROUP)
MISSING_ENTRY: Final = EntryPoint(name=ACME, value="example_prices_gone:build", group=PRICE_SOURCE_GROUP)
FAILING_FACTORY_ENTRY: Final = EntryPoint(
    name=ACME, value="example_prices:build_broken_prices", group=PRICE_SOURCE_GROUP
)


def fixture_payload() -> bytes:
    return FIXTURE.read_bytes()


def payload_of(pricing: dict[str, JsonValue]) -> bytes:
    return json.dumps({"data": [{"id": "acme/test", "pricing": pricing}], "total_count": 1}).encode()


@dataclass(slots=True)
class FakeClock:
    now: float = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, span: timedelta) -> None:
        self.now += span.total_seconds()


@dataclass(slots=True)
class ModelsWire:
    body: bytes = field(default_factory=fixture_payload)
    status: int = 200
    offline: bool = False
    paths: list[str] = field(default_factory=list[str])

    async def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.paths.append(request.url.path)
        await asyncio.sleep(0)
        if self.offline:
            raise httpx2.ConnectError("network is unreachable", request=request)
        return httpx2.Response(self.status, content=self.body, headers={"content-type": "application/json"})

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self))

    @property
    def calls(self) -> int:
        return len(self.paths)


@dataclass(frozen=True, slots=True)
class ExplodingPrices:
    provider: str = ACME

    async def price(self, model_name: str) -> TokenPrice | None:
        raise RuntimeError("price source bug")


@dataclass(frozen=True, slots=True)
class NoPrices:
    provider: str

    async def price(self, model_name: str) -> TokenPrice | None:
        return None


def openrouter(wire: ModelsWire, clock: FakeClock | None = None) -> OpenRouterPrices:
    return OpenRouterPrices(wire.client(), ttl=TTL, clock=clock or FakeClock())


def no_fallback(provider: str) -> PriceSource:
    return NoPrices(provider)


def price_of(source: PriceSource, model_name: str) -> TokenPrice | None:
    return asyncio.run(source.price(model_name))


@pytest.fixture
def entry_points_of(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[EntryPoint]]:
    installed: list[EntryPoint] = []

    def fake_entry_points(*, group: str) -> tuple[EntryPoint, ...]:
        return tuple(point for point in installed if point.group == group)

    monkeypatch.setattr(aqven_llm.pricing.registry, "entry_points", fake_entry_points)
    installed_price_sources.cache_clear()
    yield installed
    installed_price_sources.cache_clear()


def test_openrouter_reads_prices_from_the_public_model_list() -> None:
    wire = ModelsWire()

    price = price_of(openrouter(wire), LLAMA)

    assert price == TokenPrice(
        input_per_token=Decimal("0.00000005"),
        output_per_token=Decimal("0.00000008"),
        cached_input_per_token=Decimal("0.000000025"),
        per_request=None,
        source="openrouter",
    )
    assert wire.paths == [MODELS_URL_PATH]


def test_openrouter_takes_base_rates_and_ignores_long_context_overrides() -> None:
    price = price_of(openrouter(ModelsWire()), SONNET)

    assert price is not None
    assert (price.input_per_token, price.output_per_token) == (Decimal("0.000003"), Decimal("0.000015"))
    assert price.cached_input_per_token == Decimal("0.0000003")


def test_a_free_model_has_a_known_zero_price() -> None:
    price = price_of(openrouter(ModelsWire()), FREE_QWEN)

    assert price is not None
    assert price.cost(tokens_in=1000, tokens_out=1000) == Decimal(0)


def test_a_negative_price_means_a_dynamic_router_without_a_price() -> None:
    assert price_of(openrouter(ModelsWire()), AUTO_ROUTER) is None


def test_a_model_missing_from_the_list_has_no_price() -> None:
    assert price_of(openrouter(ModelsWire()), "acme/unlisted") is None


@pytest.mark.parametrize(
    "pricing",
    [
        {"prompt": "0.000001"},
        {"completion": "0.000001"},
        {"prompt": "not-a-number", "completion": "0.000001"},
        {"prompt": "NaN", "completion": "0.000001"},
        {"prompt": "0.000001", "completion": "-1"},
        {"prompt": None, "completion": "0.000001"},
    ],
)
def test_a_missing_or_unreadable_token_price_is_unknown(pricing: dict[str, JsonValue]) -> None:
    assert price_of(openrouter(ModelsWire(body=payload_of(pricing))), "acme/test") is None


def test_a_model_without_pricing_is_unknown() -> None:
    body = json.dumps({"data": [{"id": "acme/test", "pricing": None}]}).encode()

    assert price_of(openrouter(ModelsWire(body=body)), "acme/test") is None


def test_optional_prices_that_are_negative_are_dropped_and_a_request_price_is_kept() -> None:
    pricing: dict[str, JsonValue] = {
        "prompt": "0.000001",
        "completion": "0.000002",
        "input_cache_read": "-1",
        "request": "0.005",
    }

    price = price_of(openrouter(ModelsWire(body=payload_of(pricing))), "acme/test")

    assert price is not None
    assert price.cached_input_per_token is None
    assert price.per_request == Decimal("0.005")


def test_the_list_is_fetched_once_per_ttl() -> None:
    wire = ModelsWire()
    clock = FakeClock()
    source = openrouter(wire, clock)

    async def lookups() -> None:
        await source.price(LLAMA)
        clock.advance(TTL - timedelta(seconds=1))
        await source.price(SONNET)
        clock.advance(timedelta(seconds=1))
        await source.price(LLAMA)

    asyncio.run(lookups())

    assert wire.calls == 2


def test_concurrent_lookups_share_a_single_request() -> None:
    wire = ModelsWire()
    source = openrouter(wire)

    async def lookups() -> list[TokenPrice | None]:
        return await asyncio.gather(*(source.price(LLAMA) for _ in range(CONCURRENT_LOOKUPS)))

    prices = asyncio.run(lookups())

    assert wire.calls == 1
    assert all(price is not None for price in prices)


def test_a_network_error_answers_unknown_and_retries_after_a_minute() -> None:
    wire = ModelsWire(offline=True)
    clock = FakeClock()
    source = openrouter(wire, clock)

    async def lookups() -> tuple[TokenPrice | None, TokenPrice | None, TokenPrice | None]:
        first = await source.price(LLAMA)
        cached_failure = await source.price(LLAMA)
        wire.offline = False
        clock.advance(timedelta(minutes=1))
        return first, cached_failure, await source.price(LLAMA)

    first, cached_failure, recovered = asyncio.run(lookups())

    assert (first, cached_failure) == (None, None)
    assert recovered is not None
    assert wire.calls == 2


@pytest.mark.parametrize(
    "wire", [ModelsWire(status=503), ModelsWire(body=b"<html>busy</html>"), ModelsWire(body=b"{}")]
)
def test_an_error_status_or_unreadable_body_answers_unknown(wire: ModelsWire) -> None:
    assert price_of(openrouter(wire), LLAMA) is None


def test_a_network_error_falls_back_to_genai_prices() -> None:
    lookup = build_price_lookup(ModelsWire(offline=True).client(), factories=PRICE_SOURCE_FACTORIES)

    price = asyncio.run(lookup.price(f"openrouter:{LLAMA}"))

    assert price is not None
    assert price.source == "genai-prices"
    assert price.input_per_token > 0


def test_the_provider_source_wins_over_genai_prices() -> None:
    lookup = build_price_lookup(ModelsWire().client(), factories=PRICE_SOURCE_FACTORIES)

    price = asyncio.run(lookup.price(f"openrouter:{LLAMA}"))

    assert price is not None
    assert price.source == "openrouter"


def test_genai_prices_gives_base_per_token_rates() -> None:
    sonnet = price_of(GenaiPrices("anthropic"), "claude-sonnet-4-5")
    mini = price_of(GenaiPrices("openai-chat"), "gpt-4o-mini")

    assert sonnet is not None
    assert (sonnet.input_per_token, sonnet.output_per_token) == (Decimal("0.000003"), Decimal("0.000015"))
    assert sonnet.cached_input_per_token == Decimal("0.0000003")
    assert mini is not None
    assert (mini.input_per_token, mini.output_per_token) == (Decimal("0.00000015"), Decimal("0.0000006"))
    assert mini.per_request is None


def test_genai_prices_reports_a_per_request_charge() -> None:
    price = price_of(GenaiPrices("perplexity"), "sonar")

    assert price is not None
    assert price.per_request == Decimal("0.012")


def test_genai_prices_answers_unknown_for_an_unknown_model_or_provider() -> None:
    assert price_of(GenaiPrices("openai"), "acme-unknown-model") is None
    assert price_of(GenaiPrices("acme"), "tiny-1") is None


def test_an_entry_point_registers_a_price_source_for_its_provider(entry_points_of: list[EntryPoint]) -> None:
    entry_points_of.append(ACME_ENTRY)
    lookup = build_price_lookup(ModelsWire().client())

    assert asyncio.run(lookup.price(ACME_MODEL)) == ACME_PRICE
    assert set(lookup.sources) == {"openrouter", ACME}


def test_an_installed_source_replaces_the_builtin_one(entry_points_of: list[EntryPoint]) -> None:
    entry_points_of.append(EntryPoint(name="openrouter", value=ACME_ENTRY.value, group=PRICE_SOURCE_GROUP))
    wire = ModelsWire()
    lookup = build_price_lookup(wire.client())

    assert isinstance(lookup.sources["openrouter"], AcmePrices)
    assert wire.calls == 0


@pytest.mark.parametrize("point", [BROKEN_ENTRY, MISSING_ENTRY, FAILING_FACTORY_ENTRY])
def test_a_broken_entry_point_prices_nothing_and_never_raises(
    entry_points_of: list[EntryPoint], point: EntryPoint
) -> None:
    entry_points_of.append(point)
    lookup = build_price_lookup(ModelsWire().client())

    assert asyncio.run(lookup.price(ACME_MODEL)) is None


def test_entry_point_price_source_loads_the_factory() -> None:
    factory = entry_point_price_source(ACME_ENTRY)

    source = factory(ModelsWire().client())

    assert source.provider == ACME
    assert price_of(source, ACME_MODEL_NAME) == ACME_PRICE


def test_prices_omits_unknown_models_and_asks_each_model_once() -> None:
    lookup = PriceLookup({ACME: AcmePrices()}, fallback=no_fallback)
    models = [ACME_MODEL, "acme:missing", "not-a-reference", "openrouter:", ACME_MODEL]

    prices = asyncio.run(lookup.prices(models))

    assert prices == {ACME_MODEL: ACME_PRICE}


def test_prices_share_one_openrouter_request_for_every_model() -> None:
    wire = ModelsWire()
    lookup = build_price_lookup(wire.client(), factories=PRICE_SOURCE_FACTORIES)
    models = [f"openrouter:{LLAMA}", f"openrouter:{SONNET}", f"openrouter:{FREE_QWEN}", f"openrouter:{AUTO_ROUTER}"]

    prices = asyncio.run(lookup.prices(models))

    assert set(prices) == {f"openrouter:{LLAMA}", f"openrouter:{SONNET}", f"openrouter:{FREE_QWEN}"}
    assert wire.calls == 1


def test_a_failing_source_falls_through_to_the_fallback() -> None:
    lookup = PriceLookup({ACME: ExplodingPrices()}, fallback=lambda provider: AcmePrices(provider))

    assert asyncio.run(lookup.price(ACME_MODEL)) == ACME_PRICE


def test_cost_bills_cached_input_output_and_the_request() -> None:
    price = TokenPrice(
        input_per_token=Decimal("0.000002"),
        output_per_token=Decimal("0.00001"),
        cached_input_per_token=Decimal("0.0000005"),
        per_request=Decimal("0.001"),
        source="test",
    )

    cost = price.cost(tokens_in=1000, tokens_out=200, cached_in=400)

    assert cost == Decimal("0.0012") + Decimal("0.0002") + Decimal("0.002") + Decimal("0.001")


def test_cost_bills_cached_tokens_as_input_without_a_cached_price() -> None:
    price = TokenPrice(Decimal("0.000002"), Decimal("0.00001"), None, None, "test")

    assert price.cost(tokens_in=1000, tokens_out=0, cached_in=400) == Decimal("0.002")
    assert price.cost(tokens_in=10, tokens_out=0, cached_in=50) == Decimal("0.00002")


def test_cached_is_empty_until_warm_fills_it_from_the_provider_source() -> None:
    wire = ModelsWire()
    lookup = build_price_lookup(wire.client(), factories=PRICE_SOURCE_FACTORIES)
    llama = f"openrouter:{LLAMA}"

    before = lookup.cached(llama)
    asyncio.run(lookup.warm([llama, f"openrouter:{SONNET}", llama]))

    assert before is None
    cached = lookup.cached(llama)
    assert cached is not None
    assert cached.source == "openrouter"
    assert lookup.cached(f"openrouter:{SONNET}") is not None
    assert wire.calls == 1


def test_warm_leaves_the_genai_fallback_out_of_the_table() -> None:
    lookup = build_price_lookup(ModelsWire(offline=True).client(), factories=PRICE_SOURCE_FACTORIES)

    asyncio.run(lookup.warm([f"openrouter:{LLAMA}", "openai:gpt-4o-mini"]))

    assert lookup.cached(f"openrouter:{LLAMA}") is None
    assert lookup.cached("openai:gpt-4o-mini") is None
    assert asyncio.run(lookup.price("openai:gpt-4o-mini")) is not None


def test_warm_keeps_an_earlier_price_when_the_source_later_fails() -> None:
    wire = ModelsWire()
    clock = FakeClock()
    lookup = PriceLookup({"openrouter": openrouter(wire, clock)}, fallback=no_fallback)
    llama = f"openrouter:{LLAMA}"

    async def warm_twice() -> None:
        await lookup.warm([llama])
        wire.offline = True
        clock.advance(TTL)
        await lookup.warm([llama])

    asyncio.run(warm_twice())

    assert wire.calls == 2
    assert lookup.cached(llama) is not None


def test_warm_skips_unknown_models_malformed_references_and_failing_sources() -> None:
    lookup = PriceLookup({ACME: ExplodingPrices(), "openrouter": AcmePrices("openrouter")}, fallback=no_fallback)

    asyncio.run(lookup.warm([ACME_MODEL, "not-a-reference", "openrouter:", "openrouter:missing", "openrouter:tiny-1"]))

    assert lookup.warmed == {"openrouter:tiny-1": ACME_PRICE}
    assert lookup.cached(ACME_MODEL) is None


def test_provider_price_asks_only_the_registered_source() -> None:
    lookup = PriceLookup({ACME: AcmePrices()}, fallback=lambda provider: AcmePrices(provider))

    assert asyncio.run(lookup.provider_price(ACME_MODEL)) == ACME_PRICE
    assert asyncio.run(lookup.provider_price("other:tiny-1")) is None
    assert asyncio.run(lookup.price("other:tiny-1")) == ACME_PRICE
