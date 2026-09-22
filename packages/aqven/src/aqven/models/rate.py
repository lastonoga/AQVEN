import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Final

from pydantic_ai.concurrency import AbstractConcurrencyLimiter

from aqven.models.backoff import Sleep
from aqven.spec import ProviderName, ProviderSpec

SECONDS_PER_MINUTE: Final = 60.0
MINIMUM_RPM: Final = 1

type Clock = Callable[[], float]


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
        await self.sleep(await self._reserve())

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
    limiters: dict[ProviderName, RateLimiter | None] = field(default_factory=dict[ProviderName, "RateLimiter | None"])

    def of(self, spec: ProviderSpec | None) -> RateLimiter | None:
        if spec is None:
            return None
        if spec.id not in self.limiters:
            self.limiters[spec.id] = self._build(spec)
        return self.limiters[spec.id]

    def _build(self, spec: ProviderSpec) -> RateLimiter | None:
        rpm = None if spec.limits is None else spec.limits.rpm
        if rpm is None:
            return None
        return RateLimiter(rpm=rpm, clock=self.clock, sleep=self.sleep)
