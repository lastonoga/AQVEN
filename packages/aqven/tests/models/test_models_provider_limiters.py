import asyncio
from typing import Final

import pytest

from aqven.models.rate import ProviderLimiters, RateLimiter
from aqven.spec import DataPolicy, ProviderLimits, ProviderName, ProviderSpec, Retention

OPENROUTER: Final = ProviderName("openrouter")
OPENAI: Final = ProviderName("openai")
POLICY: Final = DataPolicy(allows_pii=True, allows_sensitive=False, retention=Retention.ZERO)


def provider(name: ProviderName, rpm: int | None) -> ProviderSpec:
    limits = None if rpm is None else ProviderLimits(rpm=rpm)
    return ProviderSpec(id=name, data_policy=POLICY, limits=limits)


def test_a_provider_without_limits_has_no_limiter() -> None:
    assert ProviderLimiters().of(provider(OPENROUTER, None)) is None


def test_a_provider_missing_from_the_project_has_no_limiter() -> None:
    assert ProviderLimiters().of(None) is None


def test_every_run_of_one_provider_shares_the_same_limiter() -> None:
    limiters = ProviderLimiters()
    spec = provider(OPENROUTER, 200)

    first = limiters.of(spec)
    second = limiters.of(provider(OPENROUTER, 200))

    assert isinstance(first, RateLimiter)
    assert first is second


def test_different_providers_do_not_share_a_pool() -> None:
    limiters = ProviderLimiters()

    assert limiters.of(provider(OPENROUTER, 200)) is not limiters.of(provider(OPENAI, 60))


@pytest.mark.asyncio
async def test_the_shared_limiter_paces_callers_of_the_same_provider() -> None:
    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    limiters = ProviderLimiters(clock=lambda: 0.0, sleep=record)
    gate = limiters.of(provider(OPENROUTER, 60))
    assert gate is not None

    await asyncio.gather(*(gate.acquire("model:openrouter/test") for _ in range(3)))

    assert sorted(waits) == [0.0, 1.0, 2.0]
