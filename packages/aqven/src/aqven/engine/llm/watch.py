import asyncio
from collections.abc import AsyncGenerator, AsyncIterable, AsyncIterator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Final, Literal

from pydantic_ai import RunContext
from pydantic_ai.messages import AgentStreamEvent, FunctionToolCallEvent, FunctionToolResultEvent

from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.failure_context import FailureContext

DEFAULT_STREAM_IDLE_SECONDS: Final = 600.0

type StreamHandler = Callable[[RunContext[RunDeps], AsyncIterable[AgentStreamEvent]], Awaitable[None]]
type Expiry = Literal["idle", "total"]


@dataclass(slots=True)
class CallWatch:
    total_seconds: float | None
    idle_seconds: float | None
    started: float = 0.0
    last_progress: float = 0.0
    open_tools: int = 0
    timeout: asyncio.Timeout | None = None

    @asynccontextmanager
    async def guard(self) -> AsyncGenerator[None]:
        now = _now()
        self.started = now
        self.last_progress = now
        async with asyncio.timeout(self._deadline()) as timeout:
            self.timeout = timeout
            yield

    def watched(self, handler: StreamHandler) -> StreamHandler:
        return WatchedHandler(self, handler)

    async def relay(self, events: AsyncIterable[AgentStreamEvent]) -> AsyncIterator[AgentStreamEvent]:
        async for event in events:
            self.observe(event)
            yield event

    def observe(self, event: AgentStreamEvent) -> None:
        if self.expired():
            return
        match event:
            case FunctionToolCallEvent():
                self.open_tools += 1
            case FunctionToolResultEvent():
                self.open_tools = max(self.open_tools - 1, 0)
            case _:
                pass
        self.touch()

    def touch(self) -> None:
        timeout = self.timeout
        if timeout is None or timeout.expired():
            return
        self.last_progress = _now()
        timeout.reschedule(self._deadline())

    def expired(self) -> bool:
        return self.timeout is not None and self.timeout.expired()

    def explain(self, error: Exception, context: FailureContext) -> Exception:
        if not isinstance(error, TimeoutError) or not self.expired():
            return error
        return EXPLANATIONS[self.expiry()](self, context)

    def expiry(self) -> Expiry:
        idle_at = self._idle_at()
        total_at = self._total_at()
        if idle_at is None:
            return "total"
        if total_at is None:
            return "idle"
        return "idle" if idle_at < total_at else "total"

    def _deadline(self) -> float | None:
        present = [moment for moment in (self._idle_at(), self._total_at()) if moment is not None]
        return min(present) if present else None

    def _idle_at(self) -> float | None:
        if self.idle_seconds is None or self.open_tools:
            return None
        return self.last_progress + self.idle_seconds

    def _total_at(self) -> float | None:
        return None if self.total_seconds is None else self.started + self.total_seconds


@dataclass(frozen=True, slots=True)
class WatchedHandler:
    watch: CallWatch
    inner: StreamHandler

    async def __call__(self, ctx: RunContext[RunDeps], events: AsyncIterable[AgentStreamEvent]) -> None:
        self.watch.touch()
        await self.inner(ctx, self.watch.relay(events))


def stalled_error(watch: CallWatch, context: FailureContext) -> LlmNodeError:
    seconds = watch.idle_seconds or 0.0
    agent = context.agent_location
    return LlmNodeError(
        LlmFailureCode.STREAM_STALLED,
        f"model {context.model} sent nothing for {seconds:g} s in step {context.step}; the call was stopped",
        hint=(
            "the model stream went silent, so the call was cut instead of keeping the run running: run the step "
            f"again; if it repeats, add fallback_models from another provider in {agent} or set limits.seconds "
            f"in {agent} to stop it sooner"
        ),
    )


def overrun_error(watch: CallWatch, context: FailureContext) -> LlmNodeError:
    seconds = watch.total_seconds or 0.0
    return LlmNodeError(
        LlmFailureCode.TIMEOUT,
        f"step {context.step} ran longer than its limit of {seconds:g} s (limits.seconds) with model {context.model}",
        hint=(
            f"raise limits.seconds (the smallest of aqven.yaml, {context.agent_location} and the run limits "
            "applies) or make the step lighter"
        ),
    )


EXPLANATIONS: Final[Mapping[Expiry, Callable[[CallWatch, FailureContext], LlmNodeError]]] = {
    "idle": stalled_error,
    "total": overrun_error,
}


def _now() -> float:
    return asyncio.get_running_loop().time()
