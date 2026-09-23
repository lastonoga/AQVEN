import asyncio
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.compiler import compile_project
from aqven.engine.prices import GracefulPrices, launch_models, plan_models, routed_models
from aqven.engine.request import RunSpec
from aqven.runtime import CapabilityRoute, ModelProfile, ModelRoute
from aqven.spec import FlowId
from aqven_llm import TokenPrice

ALIAS_SHOP: Final = Path(__file__).parents[1] / "fixtures" / "alias_shop"
DECLARED: Final = "openai:gpt-5.4-mini"
ROUTED: Final = "openrouter:openai/gpt-oss-20b"
PRICE: Final = TokenPrice(Decimal("0.000001"), Decimal("0.000002"), None, None, "openrouter")
SHORT_GRACE: Final = 0.05


@dataclass(slots=True)
class SlowPrices:
    release: asyncio.Event = field(default_factory=asyncio.Event)
    warmed: dict[str, TokenPrice] = field(default_factory=dict[str, TokenPrice])

    def cached(self, model: str) -> TokenPrice | None:
        return self.warmed.get(model)

    async def warm(self, models: Iterable[str]) -> None:
        wanted = tuple(models)
        await self.release.wait()
        self.warmed.update(dict.fromkeys(wanted, PRICE))


@dataclass(slots=True)
class FailingPrices:
    calls: int = 0

    def cached(self, model: str) -> TokenPrice | None:
        return None

    async def warm(self, models: Iterable[str]) -> None:
        self.calls += 1
        raise RuntimeError("price list is offline")


def profile() -> ModelProfile:
    route = CapabilityRoute(models=frozenset({DECLARED}), route=ModelRoute(model=ROUTED))
    return ModelProfile(name="cheap", routes=(route, route))


def test_plan_models_lists_every_agent_model_once() -> None:
    plan = compile_project(check_project(ALIAS_SHOP))

    assert plan_models(plan) == (DECLARED,)


def test_launch_models_add_the_routes_and_skip_a_replay() -> None:
    plan = compile_project(check_project(ALIAS_SHOP))
    live = RunSpec(flow_id=FlowId("intake"), models=profile())

    assert routed_models(profile()) == (ROUTED,)
    assert routed_models(None) == ()
    assert launch_models(plan, live) == (DECLARED, ROUTED)
    assert launch_models(plan, live.model_copy(update={"mode": "replay"})) == ()


def test_a_slow_warm_returns_after_the_grace_and_fills_the_table_later() -> None:
    async def scenario() -> tuple[TokenPrice | None, TokenPrice | None]:
        slow = SlowPrices()
        prices = GracefulPrices(slow, grace_seconds=SHORT_GRACE)
        await prices.warm([DECLARED])
        during = prices.cached(DECLARED)
        slow.release.set()
        await asyncio.gather(*prices.pending)
        return during, prices.cached(DECLARED)

    during, after = asyncio.run(scenario())

    assert (during, after) == (None, PRICE)


def test_a_failing_warm_is_swallowed_and_logged(caplog: pytest.LogCaptureFixture) -> None:
    failing = FailingPrices()
    prices = GracefulPrices(failing, grace_seconds=SHORT_GRACE)

    asyncio.run(prices.warm([DECLARED]))

    assert failing.calls == 1
    assert prices.cached(DECLARED) is None
    assert "model prices were not warmed" in caplog.text


def test_warming_nothing_starts_no_task() -> None:
    failing = FailingPrices()

    asyncio.run(GracefulPrices(failing).warm([]))

    assert failing.calls == 0
