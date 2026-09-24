import asyncio
import logging
import math
import time
from collections.abc import AsyncGenerator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Final, Protocol

import anyio
from pydantic_ai.concurrency import AbstractConcurrencyLimiter, get_concurrency_context

from aqven.models.waits import record_wait
from aqven.spec import ProviderSpec, RateLimitMode

type Clock = Callable[[], float]
type Sleep = Callable[[float], Awaitable[None]]

LANES_LOGGER: Final = "aqven.models.lanes"
DEFAULT_PARALLEL: Final = 8
MINIMUM_PARALLEL: Final = 1
RECOVERY_STREAK: Final = 10
FIXED_WAIT_SECONDS: Final = 10.0
FIXED_RETRIES: Final = 5
SECONDS_PRECISION: Final = 1


class RateLimitStrategy(Protocol):
    def pause_seconds(self, attempt: int, hinted: float | None) -> float | None: ...

    def exhausted(self, attempt: int, elapsed: float) -> bool: ...

    def shrink(self, parallel: int) -> int: ...

    def grow(self, parallel: int, ceiling: int) -> int: ...


type StrategyOf = Callable[[ProviderSpec], RateLimitStrategy]


@dataclass(frozen=True, slots=True)
class AutoRateLimit:
    attempts: int = 10
    initial_seconds: float = 2.0
    max_seconds: float = 60.0
    budget_seconds: float = 120.0

    def pause_seconds(self, attempt: int, hinted: float | None) -> float | None:
        planned = self.initial_seconds * 2.0 ** (attempt - 1) if hinted is None else hinted
        return min(planned, self.max_seconds)

    def exhausted(self, attempt: int, elapsed: float) -> bool:
        return attempt >= self.attempts or elapsed >= self.budget_seconds

    def shrink(self, parallel: int) -> int:
        return max(MINIMUM_PARALLEL, parallel // 2)

    def grow(self, parallel: int, ceiling: int) -> int:
        return min(ceiling, parallel + 1)


@dataclass(frozen=True, slots=True)
class FixedRateLimit:
    wait_seconds: float
    retries: int

    def pause_seconds(self, attempt: int, hinted: float | None) -> float | None:
        return self.wait_seconds

    def exhausted(self, attempt: int, elapsed: float) -> bool:
        return attempt > self.retries

    def shrink(self, parallel: int) -> int:
        return parallel

    def grow(self, parallel: int, ceiling: int) -> int:
        return parallel


@dataclass(frozen=True, slots=True)
class FailRateLimit:
    def pause_seconds(self, attempt: int, hinted: float | None) -> float | None:
        return None

    def exhausted(self, attempt: int, elapsed: float) -> bool:
        return True

    def shrink(self, parallel: int) -> int:
        return parallel

    def grow(self, parallel: int, ceiling: int) -> int:
        return parallel


AUTO_RATE_LIMIT: Final = AutoRateLimit()
FAIL_RATE_LIMIT: Final = FailRateLimit()


def auto_strategy(spec: ProviderSpec) -> RateLimitStrategy:
    return AUTO_RATE_LIMIT


def fixed_strategy(spec: ProviderSpec) -> RateLimitStrategy:
    wait = FIXED_WAIT_SECONDS if spec.retry_wait_seconds is None else spec.retry_wait_seconds
    retries = FIXED_RETRIES if spec.retry_attempts is None else spec.retry_attempts
    return FixedRateLimit(wait_seconds=wait, retries=retries)


def fail_strategy(spec: ProviderSpec) -> RateLimitStrategy:
    return FAIL_RATE_LIMIT


RATE_LIMIT_STRATEGIES: Final[Mapping[RateLimitMode, StrategyOf]] = {
    "auto": auto_strategy,
    "fixed": fixed_strategy,
    "fail": fail_strategy,
}


def rate_limit_strategy(spec: ProviderSpec | None) -> RateLimitStrategy:
    if spec is None:
        return AUTO_RATE_LIMIT
    return RATE_LIMIT_STRATEGIES[spec.on_rate_limit](spec)


def lane_ceiling(spec: ProviderSpec | None) -> int:
    limits = None if spec is None else spec.limits
    concurrency = None if limits is None else limits.concurrency
    return DEFAULT_PARALLEL if concurrency is None else concurrency


def seconds_text(seconds: float) -> str:
    return f"{round(seconds, SECONDS_PRECISION):g}s"


@dataclass(frozen=True, slots=True)
class LanePause:
    lane: str
    seconds: float
    parallel_before: int
    parallel_after: int

    @property
    def text(self) -> str:
        return (
            f"{self.lane} rate-limited — pausing {seconds_text(self.seconds)}, "
            f"parallel {self.parallel_before}→{self.parallel_after}"
        )


class PauseListener(Protocol):
    def paused(self, pause: LanePause) -> None: ...


@dataclass(frozen=True, slots=True)
class LoggedPauses:
    logger: logging.Logger = field(default_factory=lambda: logging.getLogger(LANES_LOGGER))

    def paused(self, pause: LanePause) -> None:
        self.logger.warning(
            pause.text,
            extra={
                "lane": pause.lane,
                "pause_seconds": pause.seconds,
                "parallel_before": pause.parallel_before,
                "parallel_after": pause.parallel_after,
            },
        )


@dataclass(frozen=True, slots=True)
class LaneSlot:
    generation: int


class ModelLane:
    def __init__(
        self,
        name: str,
        *,
        ceiling: int = DEFAULT_PARALLEL,
        strategy: RateLimitStrategy = AUTO_RATE_LIMIT,
        pacing: AbstractConcurrencyLimiter | None = None,
        clock: Clock = time.monotonic,
        sleep: Sleep = asyncio.sleep,
        listener: PauseListener | None = None,
    ) -> None:
        if ceiling < MINIMUM_PARALLEL:
            raise ValueError(f"lane concurrency must be at least {MINIMUM_PARALLEL}, got {ceiling}")
        self.name = name
        self.ceiling = ceiling
        self.strategy = strategy
        self.pacing = pacing
        self.clock = clock
        self.sleep = sleep
        self.listener: PauseListener = LoggedPauses() if listener is None else listener
        self.capacity = anyio.CapacityLimiter(ceiling)
        self.paused_until = -math.inf
        self.generation = 0
        self.streak = 0

    @property
    def parallel(self) -> int:
        return int(self.capacity.total_tokens)

    @asynccontextmanager
    async def slot(self) -> AsyncGenerator[LaneSlot]:
        borrower = object()
        queued = self.clock()
        await self.capacity.acquire_on_behalf_of(borrower)
        record_wait(self.clock() - queued)
        try:
            await self._sleep_out_pause()
            async with get_concurrency_context(self.pacing, f"model:{self.name}"):
                yield LaneSlot(self.generation)
        finally:
            self.capacity.release_on_behalf_of(borrower)

    def rate_limited(self, slot: LaneSlot, attempt: int, hinted: float | None) -> None:
        seconds = self.strategy.pause_seconds(attempt, hinted)
        if seconds is None:
            return
        self.paused_until = max(self.paused_until, self.clock() + seconds)
        self.streak = 0
        if slot.generation != self.generation:
            return
        self.generation += 1
        before = self.parallel
        self.capacity.total_tokens = self.strategy.shrink(before)
        self.listener.paused(LanePause(self.name, seconds, before, self.parallel))

    def succeeded(self) -> None:
        self.streak += 1
        if self.streak < RECOVERY_STREAK:
            return
        self.streak = 0
        self.capacity.total_tokens = self.strategy.grow(self.parallel, self.ceiling)

    async def _sleep_out_pause(self) -> None:
        reached = self.clock()
        while self.paused_until > reached:
            delay = self.paused_until - reached
            reached = self.paused_until
            await self.sleep(delay)
            record_wait(delay)
