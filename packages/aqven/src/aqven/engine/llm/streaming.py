import asyncio
import json
import time
from collections.abc import AsyncIterable, Callable
from dataclasses import dataclass, field
from typing import Final

from pydantic_ai import RunContext
from pydantic_ai.messages import (
    AgentStreamEvent,
    FunctionToolCallEvent,
    ModelResponsePart,
    ModelResponsePartDelta,
    OutputToolResultEvent,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    RetryPromptPart,
    TextPart,
    TextPartDelta,
    ThinkingPart,
    ThinkingPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
)
from pydantic_core import to_jsonable_python

from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.failures import retry_kind, retry_part_kind
from aqven.ports.execution import OutputPart, OutputSink
from aqven.runtime.events import OUTPUT_DELTA_BATCH_MS, OutputPartKind
from aqven.runtime.vocabulary import AttemptCauseKind

MILLISECONDS: Final = 1000
VALIDATION_RETRY: Final[AttemptCauseKind] = "schema_invalid"

type BufferKey = tuple[int, OutputPart]


class DeltaBatcher:
    def __init__(
        self,
        inner: OutputSink,
        window_ms: int = OUTPUT_DELTA_BATCH_MS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._inner = inner
        self._window = window_ms / MILLISECONDS
        self._clock = clock
        self._key: BufferKey | None = None
        self._chunks: list[str] = []
        self._opened_at = 0.0
        self._lock = asyncio.Lock()
        self._timer: asyncio.Task[None] | None = None

    async def append(self, attempt: int, part: OutputPart, delta: str) -> None:
        if not delta:
            return
        async with self._lock:
            if self._key != (attempt, part):
                await self._drain()
                self._key = (attempt, part)
                self._opened_at = self._clock()
            self._chunks.append(delta)
            if self._clock() - self._opened_at >= self._window:
                await self._drain()
                return
            self._arm()

    async def discard(self, attempt: int, cause: AttemptCauseKind) -> None:
        async with self._lock:
            await self._drain()
            await self._inner.discard(attempt, cause)

    async def flush(self) -> None:
        async with self._lock:
            await self._drain()
            await self._inner.flush()
            self._disarm()

    async def _drain(self) -> None:
        key = self._key
        if key is None or not self._chunks:
            return
        text = "".join(self._chunks)
        self._chunks.clear()
        self._key = None
        await self._inner.append(key[0], key[1], text)

    def _arm(self) -> None:
        if self._timer is not None and not self._timer.done():
            return
        self._timer = asyncio.get_running_loop().create_task(self._drain_later())

    def _disarm(self) -> None:
        if self._timer is None:
            return
        self._timer.cancel()
        self._timer = None

    async def _drain_later(self) -> None:
        await asyncio.sleep(self._window)
        async with self._lock:
            await self._drain()


@dataclass(slots=True)
class StreamObserver:
    sink: OutputSink
    text_kind: OutputPartKind
    output_tools: frozenset[str]
    parts: dict[tuple[int, int], OutputPart] = field(default_factory=dict[tuple[int, int], OutputPart])
    tool_attempts: set[int] = field(default_factory=set[int])
    streamed: set[int] = field(default_factory=set[int])
    discarded: set[int] = field(default_factory=set[int])
    causes: dict[int, AttemptCauseKind] = field(default_factory=dict[int, AttemptCauseKind])
    latest: int = 0

    async def __call__(self, ctx: RunContext[RunDeps], events: AsyncIterable[AgentStreamEvent]) -> None:
        attempt = ctx.deps.attempt(ctx.run_step)
        previous_cause = retry_kind(ctx.messages, self.output_tools)
        if previous_cause is not None:
            self.causes[attempt - 1] = previous_cause
        async for event in events:
            await self.observe(attempt, event)
        await self.sink.flush()

    async def observe(self, attempt: int, event: AgentStreamEvent) -> None:
        match event:
            case PartStartEvent():
                await self._start(attempt, event)
            case PartDeltaEvent():
                await self._delta(attempt, event)
            case PartEndEvent():
                await self.sink.flush()
            case FunctionToolCallEvent():
                self.tool_attempts.add(attempt)
            case OutputToolResultEvent():
                await self._output_result(attempt, event)
            case _:
                return

    async def abandon(self, cause: AttemptCauseKind) -> None:
        if self.latest not in self.streamed or self.latest in self.discarded:
            return
        self.discarded.add(self.latest)
        await self.sink.discard(self.latest, cause)

    async def _start(self, attempt: int, event: PartStartEvent) -> None:
        await self._advance(attempt)
        part = self._part(event.index, event.part)
        if part is None:
            return
        self.parts[(attempt, event.index)] = part
        self.streamed.add(attempt)
        await self.sink.append(attempt, part, _initial_text(event.part))

    async def _delta(self, attempt: int, event: PartDeltaEvent) -> None:
        part = self.parts.get((attempt, event.index))
        text = _delta_text(event.delta)
        if part is None or not text:
            return
        await self.sink.append(attempt, part, text)

    async def _output_result(self, attempt: int, event: OutputToolResultEvent) -> None:
        if not isinstance(event.part, RetryPromptPart):
            return
        await self._discard(attempt, retry_part_kind(event.part))

    async def _advance(self, attempt: int) -> None:
        previous = self.latest
        if attempt <= previous:
            return
        self.latest = attempt
        if previous in self.streamed and previous not in self.tool_attempts:
            await self._discard(previous, self.causes.get(previous, VALIDATION_RETRY))

    async def _discard(self, attempt: int, cause: AttemptCauseKind) -> None:
        if attempt in self.discarded:
            return
        self.discarded.add(attempt)
        await self.sink.discard(attempt, cause)

    def _part(self, index: int, part: ModelResponsePart) -> OutputPart | None:
        match part:
            case TextPart():
                return OutputPart(kind=self.text_kind, index=index)
            case ThinkingPart():
                return OutputPart(kind="reasoning", index=index)
            case ToolCallPart() if part.tool_name in self.output_tools:
                return OutputPart(
                    kind="output_json", index=index, tool_call_id=part.tool_call_id, tool_name=part.tool_name
                )
            case ToolCallPart():
                return OutputPart(
                    kind="tool_call_args", index=index, tool_call_id=part.tool_call_id, tool_name=part.tool_name
                )
            case _:
                return None


async def drain_events(ctx: RunContext[RunDeps], events: AsyncIterable[AgentStreamEvent]) -> None:
    async for _ in events:
        continue


def _initial_text(part: ModelResponsePart) -> str:
    match part:
        case TextPart() | ThinkingPart():
            return part.content
        case ToolCallPart():
            return _args_text(part.args)
        case _:
            return ""


def _delta_text(delta: ModelResponsePartDelta) -> str:
    match delta:
        case TextPartDelta():
            return delta.content_delta
        case ThinkingPartDelta():
            return delta.content_delta or ""
        case ToolCallPartDelta():
            return _args_text(delta.args_delta)
        case _:
            return ""


def _args_text(args: object) -> str:
    if args is None:
        return ""
    return args if isinstance(args, str) else json.dumps(to_jsonable_python(args), ensure_ascii=False)
