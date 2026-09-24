import asyncio
import logging
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Final

from aqven.engine.request import RunSpec
from aqven.ir import CompiledProject
from aqven.ports.prices import PriceCache
from aqven.runtime.options import ModelProfile
from aqven.runtime.vocabulary import RunMode
from aqven_llm import TokenPrice

WARM_GRACE_SECONDS: Final = 3.0
UNBILLED_MODES: Final[frozenset[RunMode]] = frozenset({"replay"})
PRICES_LOGGER: Final = logging.getLogger("aqven.engine.prices")


def plan_models(plan: CompiledProject) -> tuple[str, ...]:
    return tuple(dict.fromkeys(choice.model for agent in plan.agents.values() for choice in agent.models))


def routed_models(profile: ModelProfile | None) -> tuple[str, ...]:
    if profile is None:
        return ()
    return tuple(dict.fromkeys(item.route.model for item in profile.routes))


def launch_models(plan: CompiledProject, spec: RunSpec) -> tuple[str, ...]:
    if spec.mode in UNBILLED_MODES:
        return ()
    return tuple(dict.fromkeys((*plan_models(plan), *routed_models(spec.models))))


@dataclass(slots=True)
class GracefulPrices:
    inner: PriceCache
    grace_seconds: float = WARM_GRACE_SECONDS
    pending: set[asyncio.Task[None]] = field(default_factory=set[asyncio.Task[None]], repr=False)

    def cached(self, model: str) -> TokenPrice | None:
        return self.inner.cached(model)

    async def warm(self, models: Iterable[str]) -> None:
        wanted = tuple(dict.fromkeys(models))
        if not wanted:
            return
        task = asyncio.create_task(self._warmed(wanted))
        self.pending.add(task)
        task.add_done_callback(self.pending.discard)
        await asyncio.wait((task,), timeout=self.grace_seconds)

    async def _warmed(self, models: tuple[str, ...]) -> None:
        try:
            await self.inner.warm(models)
        except Exception as error:
            PRICES_LOGGER.warning("model prices were not warmed, calls fall back to genai-prices: %s", error)
