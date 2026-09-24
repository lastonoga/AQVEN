import asyncio
import logging
from dataclasses import dataclass, field
from typing import Final

import pytest
from models_support import LaneClock, ScriptedModel, text_script
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelRequest, TextPart, UserPromptPart
from pydantic_ai.models import Model, ModelRequestParameters

from aqven.models import LIVE_BEHAVIOR, CallPolicy, CassettePolicy, MemoryCassetteStore, guard_model
from aqven.models.backoff import BackoffPolicy
from aqven.models.lanes import (
    AUTO_RATE_LIMIT,
    DEFAULT_PARALLEL,
    FAIL_RATE_LIMIT,
    LANES_LOGGER,
    RECOVERY_STREAK,
    FixedRateLimit,
    LanePause,
    LoggedPauses,
    ModelLane,
    lane_ceiling,
    rate_limit_strategy,
)
from aqven.models.rate import ProviderLimiters, RateLimiter
from aqven.spec import DataPolicy, ProviderLimits, ProviderName, ProviderSpec, RateLimitMode, Retention

OPENROUTER: Final = ProviderName("openrouter")
GEMMA: Final = "openrouter:google/gemma-3-27b-it"
QWEN: Final = "openrouter:qwen/qwen3-32b"
POLICY: Final = DataPolicy(allows_pii=True, allows_sensitive=False, retention=Retention.ZERO)
NO_BACKOFF: Final = BackoffPolicy(attempts=4, initial_seconds=0.0, jitter_seconds=0.0)
YIELDS: Final = 20


@dataclass(slots=True)
class SeenPauses:
    seen: list[LanePause] = field(default_factory=list[LanePause])

    def paused(self, pause: LanePause) -> None:
        self.seen.append(pause)

    @property
    def lines(self) -> list[str]:
        return [pause.text for pause in self.seen]


@dataclass(slots=True)
class GatedSleep:
    gate: asyncio.Event = field(default_factory=asyncio.Event)
    waits: list[float] = field(default_factory=list[float])

    async def __call__(self, seconds: float) -> None:
        self.waits.append(seconds)
        await self.gate.wait()


@dataclass(slots=True)
class Occupancy:
    inside: int = 0
    peak: int = 0

    def enter(self) -> None:
        self.inside += 1
        self.peak = max(self.peak, self.inside)

    def leave(self) -> None:
        self.inside -= 1


def provider(
    *,
    rpm: int | None = None,
    concurrency: int | None = None,
    mode: RateLimitMode = "auto",
    wait: float | None = None,
    retries: int | None = None,
) -> ProviderSpec:
    fixed = {} if wait is None or retries is None else {"retry_wait_seconds": wait, "retry_attempts": retries}
    return ProviderSpec.model_validate(
        {
            "id": OPENROUTER,
            "data_policy": POLICY.model_dump(),
            "limits": ProviderLimits(rpm=rpm, concurrency=concurrency).model_dump(),
            "on_rate_limit": mode,
            **fixed,
        }
    )


def lane_of(clock: LaneClock, pauses: SeenPauses, spec: ProviderSpec | None = None, model: str = GEMMA) -> ModelLane:
    limiters = ProviderLimiters(clock=clock.time, sleep=clock.sleep, listener=pauses)
    return limiters.lane(model, spec)


def rate_limited(retry_after: str | None = None) -> ModelHTTPError:
    headers = None if retry_after is None else {"Retry-After": retry_after}
    return ModelHTTPError(429, GEMMA, "temporarily rate-limited upstream", headers=headers)


def guarded(inner: Model, lane: ModelLane) -> Model:
    policy = CallPolicy(
        cassettes=CassettePolicy(store=MemoryCassetteStore(), behavior=LIVE_BEHAVIOR),
        backoff=NO_BACKOFF,
        backoff_sleep=skip_backoff,
        lane=lane,
    )
    return guard_model(inner, model_ref=GEMMA, policy=policy)


async def skip_backoff(seconds: float) -> None:
    return None


def prompt() -> list[ModelMessage]:
    return [ModelRequest(parts=[UserPromptPart("label the ticket")])]


async def ask(model: Model) -> str:
    response = await model.request(prompt(), None, ModelRequestParameters())
    return "".join(part.content for part in response.parts if isinstance(part, TextPart))


async def settle() -> None:
    for _ in range(YIELDS):
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_a_rate_limit_pauses_every_call_of_that_model_and_no_other_model() -> None:
    clock = LaneClock()
    limiters = ProviderLimiters(clock=clock.time, sleep=clock.sleep, listener=SeenPauses())
    gemma = limiters.lane(GEMMA, provider())
    qwen = limiters.lane(QWEN, provider())

    async with gemma.slot() as slot:
        gemma.rate_limited(slot, attempt=1, hinted=30.0)
    async with qwen.slot():
        pass
    other_models_waited = list(clock.waits)
    async with gemma.slot():
        pass
    async with gemma.slot():
        pass

    assert other_models_waited == []
    assert clock.waits == [30.0]


@pytest.mark.asyncio
async def test_a_rate_limited_call_holds_every_call_of_its_model_while_other_models_answer() -> None:
    sleep = GatedSleep()
    limiters = ProviderLimiters(clock=lambda: 0.0, sleep=sleep, listener=SeenPauses())
    failing = ScriptedModel([text_script("retried")], open_errors=[rate_limited("30")])
    healthy = ScriptedModel([text_script("waited")])
    other = ScriptedModel([text_script("other")])

    first = asyncio.create_task(ask(guarded(failing, limiters.lane(GEMMA, provider()))))
    await settle()
    second = asyncio.create_task(ask(guarded(healthy, limiters.lane(GEMMA, provider()))))
    await settle()
    answered = await ask(guarded(other, limiters.lane(QWEN, provider())))
    held = (first.done(), second.done(), healthy.opens)
    sleep.gate.set()

    assert answered == "other"
    assert held == (False, False, 0)
    assert await asyncio.gather(first, second) == ["retried", "waited"]
    assert sleep.waits == [30.0, 30.0]


@pytest.mark.asyncio
async def test_a_rate_limited_call_pauses_its_lane_once_and_retries_after_the_pause() -> None:
    clock = LaneClock()
    pauses = SeenPauses()
    failing = ScriptedModel([text_script("ok")], open_errors=[rate_limited("30")])

    answer = await ask(guarded(failing, lane_of(clock, pauses)))

    assert (answer, failing.opens) == ("ok", 2)
    assert clock.waits == [30.0]
    assert pauses.lines == [f"{GEMMA} rate-limited — pausing 30s, parallel 8→4"]


@pytest.mark.asyncio
async def test_each_new_rate_limit_halves_the_parallel_calls_down_to_one() -> None:
    clock = LaneClock()
    pauses = SeenPauses()
    lane = lane_of(clock, pauses)

    for _ in range(4):
        async with lane.slot() as slot:
            lane.rate_limited(slot, attempt=1, hinted=1.0)

    assert lane.parallel == 1
    assert [(pause.parallel_before, pause.parallel_after) for pause in pauses.seen] == [(8, 4), (4, 2), (2, 1), (1, 1)]


@pytest.mark.asyncio
async def test_calls_in_flight_when_the_lane_was_cut_extend_the_pause_without_cutting_again() -> None:
    clock = LaneClock()
    pauses = SeenPauses()
    lane = lane_of(clock, pauses)

    async with lane.slot() as first, lane.slot() as second:
        lane.rate_limited(first, attempt=1, hinted=30.0)
        lane.rate_limited(second, attempt=1, hinted=45.0)
    async with lane.slot():
        pass

    assert lane.parallel == 4
    assert pauses.lines == [f"{GEMMA} rate-limited — pausing 30s, parallel 8→4"]
    assert clock.waits == [45.0]


@pytest.mark.asyncio
async def test_ten_successes_in_a_row_add_one_parallel_call_up_to_the_start_value() -> None:
    clock = LaneClock()
    lane = lane_of(clock, SeenPauses(), provider(concurrency=4))
    for _ in range(2):
        async with lane.slot() as slot:
            lane.rate_limited(slot, attempt=1, hinted=1.0)
    cut = lane.parallel

    for _ in range(RECOVERY_STREAK - 1):
        lane.succeeded()
    almost = lane.parallel
    lane.succeeded()
    recovered = lane.parallel
    for _ in range(RECOVERY_STREAK * 10):
        lane.succeeded()

    assert (cut, almost, recovered, lane.parallel) == (1, 1, 2, 4)


@pytest.mark.asyncio
async def test_a_rate_limit_restarts_the_success_streak() -> None:
    clock = LaneClock()
    lane = lane_of(clock, SeenPauses())
    async with lane.slot() as slot:
        lane.rate_limited(slot, attempt=1, hinted=1.0)

    for _ in range(RECOVERY_STREAK - 1):
        lane.succeeded()
    async with lane.slot() as slot:
        lane.rate_limited(slot, attempt=1, hinted=1.0)
    for _ in range(RECOVERY_STREAK - 1):
        lane.succeeded()

    assert lane.parallel == 2


@pytest.mark.asyncio
async def test_a_cut_lane_admits_only_its_new_parallel_calls() -> None:
    clock = LaneClock()
    lane = lane_of(clock, SeenPauses(), provider(concurrency=4))
    async with lane.slot() as slot:
        lane.rate_limited(slot, attempt=1, hinted=1.0)
    gate = asyncio.Event()
    occupancy = Occupancy()

    async def call() -> None:
        async with lane.slot():
            occupancy.enter()
            await gate.wait()
            occupancy.leave()

    tasks = [asyncio.create_task(call()) for _ in range(3)]
    await settle()
    admitted = occupancy.inside
    gate.set()
    await asyncio.gather(*tasks)

    assert (lane.parallel, admitted, occupancy.peak) == (2, 2, 2)


@pytest.mark.asyncio
async def test_retry_after_sets_the_pause_and_without_it_the_pause_doubles_up_to_a_minute() -> None:
    clock = LaneClock()
    hinted = ScriptedModel([text_script("ok")], open_errors=[rate_limited("7"), rate_limited("600")])
    doubling = ScriptedModel([text_script("ok")], open_errors=[rate_limited(), rate_limited(), rate_limited()])

    await ask(guarded(hinted, lane_of(clock, SeenPauses())))
    honoured = list(clock.waits)
    clock.waits.clear()
    await ask(guarded(doubling, lane_of(clock, SeenPauses())))

    assert honoured == [7.0, 60.0]
    assert clock.waits == [2.0, 4.0, 8.0]


@pytest.mark.asyncio
async def test_auto_gives_up_after_ten_attempts() -> None:
    clock = LaneClock()
    inner = ScriptedModel([text_script("ok")], open_errors=[rate_limited() for _ in range(AUTO_RATE_LIMIT.attempts)])

    with pytest.raises(ModelHTTPError):
        await ask(guarded(inner, lane_of(clock, SeenPauses())))

    assert inner.opens == AUTO_RATE_LIMIT.attempts
    assert clock.waits == [2.0, 4.0, 8.0, 16.0, 32.0, 60.0, 60.0, 60.0, 60.0]


@pytest.mark.asyncio
async def test_fixed_waits_the_same_time_before_each_retry_and_keeps_the_parallel_calls() -> None:
    clock = LaneClock()
    pauses = SeenPauses()
    lane = lane_of(clock, pauses, provider(mode="fixed", wait=10.0, retries=2))
    inner = ScriptedModel([text_script("ok")], open_errors=[rate_limited("1") for _ in range(3)])

    with pytest.raises(ModelHTTPError):
        await ask(guarded(inner, lane))

    assert inner.opens == 3
    assert clock.waits == [10.0, 10.0]
    assert lane.parallel == DEFAULT_PARALLEL
    assert pauses.lines[0] == f"{GEMMA} rate-limited — pausing 10s, parallel 8→8"


@pytest.mark.asyncio
async def test_fail_raises_the_first_rate_limit_without_pausing_the_lane() -> None:
    clock = LaneClock()
    pauses = SeenPauses()
    lane = lane_of(clock, pauses, provider(mode="fail"))
    inner = ScriptedModel([text_script("ok")], open_errors=[rate_limited("30")])

    with pytest.raises(ModelHTTPError):
        await ask(guarded(inner, lane))
    async with lane.slot():
        pass

    assert inner.opens == 1
    assert clock.waits == []
    assert pauses.seen == []


@pytest.mark.asyncio
async def test_a_server_error_is_retried_without_pausing_the_lane() -> None:
    clock = LaneClock()
    pauses = SeenPauses()
    lane = lane_of(clock, pauses)
    inner = ScriptedModel([text_script("ok")], open_errors=[ModelHTTPError(503, GEMMA, "overloaded")])

    answer = await ask(guarded(inner, lane))

    assert (answer, inner.opens) == ("ok", 2)
    assert (clock.waits, pauses.seen, lane.parallel) == ([], [], DEFAULT_PARALLEL)


def test_the_strategy_and_the_start_parallel_come_from_the_provider() -> None:
    fixed = rate_limit_strategy(provider(mode="fixed", wait=3.0, retries=7))

    assert rate_limit_strategy(None) is AUTO_RATE_LIMIT
    assert rate_limit_strategy(provider()) is AUTO_RATE_LIMIT
    assert rate_limit_strategy(provider(mode="fail")) is FAIL_RATE_LIMIT
    assert fixed == FixedRateLimit(wait_seconds=3.0, retries=7)
    assert rate_limit_strategy(provider(mode="fixed")) == FixedRateLimit(wait_seconds=10.0, retries=5)
    assert (lane_ceiling(None), lane_ceiling(provider()), lane_ceiling(provider(concurrency=3))) == (8, 8, 3)


def test_every_call_of_one_model_shares_one_lane_inside_the_provider_pacing() -> None:
    limiters = ProviderLimiters()
    spec = provider(rpm=60, concurrency=3)

    gemma = limiters.lane(GEMMA, spec)
    qwen = limiters.lane(QWEN, spec)

    assert gemma is limiters.lane(GEMMA, spec)
    assert gemma is not qwen
    assert isinstance(gemma.pacing, RateLimiter)
    assert gemma.pacing is qwen.pacing is limiters.of(spec)
    assert (gemma.parallel, gemma.name) == (3, GEMMA)


def test_a_lane_pause_is_logged_as_one_line(caplog: pytest.LogCaptureFixture) -> None:
    pause = LanePause(lane=GEMMA, seconds=30.0, parallel_before=8, parallel_after=4)

    with caplog.at_level(logging.WARNING, logger=LANES_LOGGER):
        LoggedPauses().paused(pause)

    assert [(record.name, record.getMessage()) for record in caplog.records] == [
        (LANES_LOGGER, "openrouter:google/gemma-3-27b-it rate-limited — pausing 30s, parallel 8→4")
    ]
