import asyncio
import time
from dataclasses import dataclass, field
from typing import Final

from pydantic_ai.concurrency import AbstractConcurrencyLimiter

from aqven.models.lanes import Clock, LoggedPauses, ModelLane, PauseListener, Sleep, lane_ceiling, rate_limit_strategy
from aqven.models.waits import record_wait
from aqven.spec import ProviderName, ProviderSpec

SECONDS_PER_MINUTE: Final = 60.0
MINIMUM_RPM: Final = 1


class RateLimiter(AbstractConcurrencyLimiter):
    def __init__(self, *, rpm: int, clock: Clock = time.monotonic, sleep: Sleep = asyncio.sleep) -> None:
        if rpm < MINIMUM_RPM:
            raise ValueError(f"rpm must be at least {MINIMUM_RPM}, got {rpm}")
        self.interval = SECONDS_PER_MINUTE / rpm
        self.clock = clock
        self.sleep = sleep
        self._lock = asyncio.Lock()
        self._next_free: float | None = None

    async def acquire(self, source: str) -> None:
        delay = await self._reserve()
        await self.sleep(delay)
        record_wait(delay)

    def release(self) -> None:
        return None

    async def _reserve(self) -> float:
        async with self._lock:
            now = self.clock()
            taken = now if self._next_free is None else max(now, self._next_free)
            self._next_free = taken + self.interval
            return taken - now


@dataclass(slots=True)
class ProviderLimiters:
    clock: Clock = time.monotonic
    sleep: Sleep = asyncio.sleep
    listener: PauseListener = field(default_factory=LoggedPauses)
    limiters: dict[ProviderName, RateLimiter | None] = field(default_factory=dict[ProviderName, "RateLimiter | None"])
    lanes: dict[str, ModelLane] = field(default_factory=dict[str, ModelLane])

    def of(self, spec: ProviderSpec | None) -> RateLimiter | None:
        if spec is None:
            return None
        if spec.id not in self.limiters:
            self.limiters[spec.id] = self._build(spec)
        return self.limiters[spec.id]

    def lane(self, model: str, spec: ProviderSpec | None) -> ModelLane:
        if model not in self.lanes:
            self.lanes[model] = self._lane(model, spec)
        return self.lanes[model]

    def _build(self, spec: ProviderSpec) -> RateLimiter | None:
        rpm = None if spec.limits is None else spec.limits.rpm
        if rpm is None:
            return None
        return RateLimiter(rpm=rpm, clock=self.clock, sleep=self.sleep)

    def _lane(self, model: str, spec: ProviderSpec | None) -> ModelLane:
        return ModelLane(
            model,
            ceiling=lane_ceiling(spec),
            strategy=rate_limit_strategy(spec),
            pacing=self.of(spec),
            clock=self.clock,
            sleep=self.sleep,
            listener=self.listener,
        )
