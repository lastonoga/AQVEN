import asyncio

from aqven.models.rate import RateLimiter
from aqven.models.waits import WAIT_METERS, metered, record_wait


def test_a_wait_reaches_every_open_meter_of_the_stack() -> None:
    with metered() as outer:
        record_wait(0.25)
        with metered() as inner:
            record_wait(0.5)
        record_wait(0.125)

    assert (outer.milliseconds, inner.milliseconds) == (875, 500)
    assert WAIT_METERS.get() == ()


def test_a_wait_outside_any_node_is_dropped() -> None:
    record_wait(1.0)

    assert WAIT_METERS.get() == ()


def test_a_negative_wait_does_not_lower_the_meter() -> None:
    with metered() as meter:
        record_wait(-1.0)

    assert meter.milliseconds == 0


def test_the_rate_limiter_counts_its_pacing_delay_as_a_wait() -> None:
    delays: list[float] = []

    async def sleep(seconds: float) -> None:
        delays.append(seconds)

    limiter = RateLimiter(rpm=60, clock=lambda: 0.0, sleep=sleep)

    async def scenario() -> int:
        with metered() as meter:
            for _ in range(3):
                await limiter.acquire("model:test")
        return meter.milliseconds

    assert asyncio.run(scenario()) == 3000
    assert delays == [0.0, 1.0, 2.0]
