import asyncio
from dataclasses import dataclass, field
from typing import Final

import pytest

from aqven.models.rate import RateLimiter

SOURCE: Final = "model:openrouter/test"
MINUTE: Final = 60.0


@dataclass(slots=True)
class FrozenClock:
    now: float = 0.0
    waits: list[float] = field(default_factory=list[float])

    def time(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)

    def advance(self, seconds: float) -> None:
        self.now += seconds


def limiter(clock: FrozenClock, rpm: int) -> RateLimiter:
    return RateLimiter(rpm=rpm, clock=clock.time, sleep=clock.sleep)


@pytest.mark.asyncio
async def test_the_first_request_of_an_idle_limiter_does_not_wait() -> None:
    clock = FrozenClock()

    await limiter(clock, rpm=60).acquire(SOURCE)

    assert clock.waits == [0.0]


@pytest.mark.asyncio
async def test_requests_beyond_the_rate_are_spaced_evenly_instead_of_bursting() -> None:
    clock = FrozenClock()
    gate = limiter(clock, rpm=60)

    for _ in range(4):
        await gate.acquire(SOURCE)

    assert clock.waits == [0.0, 1.0, 2.0, 3.0]


@pytest.mark.asyncio
async def test_concurrent_callers_take_their_turn_without_sharing_a_slot() -> None:
    clock = FrozenClock()
    gate = limiter(clock, rpm=120)

    await asyncio.gather(*(gate.acquire(SOURCE) for _ in range(3)))

    assert sorted(clock.waits) == [0.0, 0.5, 1.0]


@pytest.mark.asyncio
async def test_time_spent_idle_is_credited_so_a_later_request_does_not_wait() -> None:
    clock = FrozenClock()
    gate = limiter(clock, rpm=60)
    await gate.acquire(SOURCE)

    clock.advance(MINUTE)
    await gate.acquire(SOURCE)

    assert clock.waits == [0.0, 0.0]


@pytest.mark.asyncio
async def test_idling_does_not_accumulate_a_burst_allowance() -> None:
    clock = FrozenClock()
    gate = limiter(clock, rpm=60)

    clock.advance(MINUTE * 10)
    await gate.acquire(SOURCE)
    await gate.acquire(SOURCE)

    assert clock.waits == [0.0, 1.0]


@pytest.mark.asyncio
async def test_releasing_a_rate_slot_returns_nothing_to_the_bucket() -> None:
    clock = FrozenClock()
    gate = limiter(clock, rpm=60)

    await gate.acquire(SOURCE)
    gate.release()
    await gate.acquire(SOURCE)

    assert clock.waits == [0.0, 1.0]


def test_a_rate_below_one_request_per_minute_is_rejected() -> None:
    clock = FrozenClock()

    with pytest.raises(ValueError):
        limiter(clock, rpm=0)
