import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Final

from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import ModelRequest, PartDeltaEvent, TextPart
from pydantic_ai.models import Model

from aqven.check.output_modes import model_modes
from aqven.engine.llm.probe import ModeProbe, ModeProber
from aqven.spec import StructuredMode

TEXT_PROMPT: Final = "Reply with one short sentence about the sea."
TEXT_CHECK: Final = "text_stream"
USAGE_CHECK: Final = "usage_reported"
CANCEL_CHECK: Final = "cancellation"
RETRY_CHECK: Final = "no_internal_retries"
STRUCTURED_CHECK: Final = "structured_output"
DEFAULT_MODES: Final[tuple[StructuredMode, ...]] = ("tool",)
CANCEL_TIMEOUT_SECONDS: Final = 30.0
IDLE_SECONDS: Final = 3600.0
SINGLE_ATTEMPT: Final = 1


@dataclass(frozen=True, slots=True)
class ConformanceCheck:
    name: str
    passed: bool
    detail: str


@dataclass(frozen=True, slots=True)
class ConformanceReport:
    checks: tuple[ConformanceCheck, ...]

    @property
    def ok(self) -> bool:
        return all(check.passed for check in self.checks)

    @property
    def failures(self) -> tuple[ConformanceCheck, ...]:
        return tuple(check for check in self.checks if not check.passed)

    def names(self) -> tuple[str, ...]:
        return tuple(check.name for check in self.checks)

    def raise_for_failures(self) -> None:
        if self.ok:
            return
        raise AdapterNotConformant(self.failures)


class AdapterNotConformant(AssertionError):
    def __init__(self, failures: Sequence[ConformanceCheck]) -> None:
        listed = "; ".join(f"{check.name}: {check.detail}" for check in failures)
        super().__init__(f"the adapter does not meet the aqven contract: {listed}")
        self.failures = tuple(failures)


@dataclass(frozen=True, slots=True)
class FailingTransport:
    build: Callable[[], Model]
    attempts: Callable[[], int]


@dataclass(frozen=True, slots=True)
class AdapterCase:
    build: Callable[[], Model]
    model: str = "custom:model"
    modes: tuple[StructuredMode, ...] = DEFAULT_MODES
    prompt: str = TEXT_PROMPT
    failing: FailingTransport | None = None
    deltas_expected: int = 1


@dataclass(frozen=True, slots=True)
class CaseModels:
    case: AdapterCase

    async def __call__(self, model: str) -> Model:
        return self.case.build()


@dataclass(slots=True)
class StreamOutcome:
    text: str = ""
    deltas: int = 0
    tokens: int = 0
    error: str | None = None
    parts: tuple[str, ...] = field(default_factory=tuple[str, ...])


def passed(name: str, detail: str) -> ConformanceCheck:
    return ConformanceCheck(name=name, passed=True, detail=detail)


def failed(name: str, detail: str) -> ConformanceCheck:
    return ConformanceCheck(name=name, passed=False, detail=detail)


async def stream_text(model: Model, prompt: str) -> StreamOutcome:
    outcome = StreamOutcome()
    try:
        async with model_request_stream(model, [ModelRequest.user_text_prompt(prompt)]) as stream:
            async for event in stream:
                outcome.deltas += int(isinstance(event, PartDeltaEvent))
            response = stream.get()
    except Exception as error:
        outcome.error = f"{type(error).__name__}: {error}"
        return outcome
    outcome.text = "".join(part.content for part in response.parts if isinstance(part, TextPart))
    outcome.tokens = response.usage.total_tokens
    return outcome


async def check_text_stream(case: AdapterCase) -> tuple[ConformanceCheck, StreamOutcome]:
    outcome = await stream_text(case.build(), case.prompt)
    if outcome.error is not None:
        return failed(TEXT_CHECK, f"the stream raised {outcome.error}"), outcome
    if not outcome.text:
        return failed(TEXT_CHECK, "the stream produced no text"), outcome
    if outcome.deltas < case.deltas_expected:
        detail = f"the stream produced {outcome.deltas} text deltas, expected at least {case.deltas_expected}"
        return failed(TEXT_CHECK, detail), outcome
    return passed(TEXT_CHECK, f"{outcome.deltas} deltas, {len(outcome.text)} characters"), outcome


def check_usage(outcome: StreamOutcome) -> ConformanceCheck:
    if outcome.error is not None:
        return failed(USAGE_CHECK, "no usage: the text stream failed")
    if outcome.tokens <= 0:
        return failed(USAGE_CHECK, "the response reports no tokens: fill usage in the streamed response")
    return passed(USAGE_CHECK, f"{outcome.tokens} tokens")


def structured_check(result: ModeProbe) -> ConformanceCheck:
    name = f"{STRUCTURED_CHECK}:{result.mode}"
    if result.ok:
        return passed(name, "the model returned the declared output")
    detail = f"{result.code}: {result.message}"
    return failed(name, detail if result.hint is None else f"{detail} ({result.hint})")


async def check_structured_output(case: AdapterCase) -> tuple[ConformanceCheck, ...]:
    prober = ModeProber(CaseModels(case))
    modes = model_modes(case.model)
    results = [await prober.probe_mode(case.model, modes, mode) for mode in case.modes]
    return tuple(structured_check(result) for result in results)


async def idle_stream(model: Model, prompt: str, started: asyncio.Event) -> None:
    async with model_request_stream(model, [ModelRequest.user_text_prompt(prompt)]) as stream:
        async for _event in stream:
            started.set()
            await asyncio.sleep(IDLE_SECONDS)


async def check_cancellation(case: AdapterCase) -> ConformanceCheck:
    started = asyncio.Event()
    task = asyncio.create_task(idle_stream(case.build(), case.prompt, started))
    try:
        await asyncio.wait_for(started.wait(), timeout=CANCEL_TIMEOUT_SECONDS)
    except TimeoutError:
        task.cancel()
        return failed(CANCEL_CHECK, "the stream produced no event to cancel")
    task.cancel()
    return await cancelled_cleanly(task)


async def cancelled_cleanly(task: asyncio.Task[None]) -> ConformanceCheck:
    try:
        await task
    except asyncio.CancelledError:
        return passed(CANCEL_CHECK, "cancelling the stream raised CancelledError")
    except Exception as error:
        return failed(CANCEL_CHECK, f"cancelling the stream raised {type(error).__name__}: {error}")
    return failed(CANCEL_CHECK, "the stream finished instead of raising CancelledError")


async def check_no_internal_retries(failing: FailingTransport, prompt: str) -> ConformanceCheck:
    outcome = await stream_text(failing.build(), prompt)
    attempts = failing.attempts()
    if outcome.error is None:
        return failed(RETRY_CHECK, "the failing transport produced a response instead of an error")
    if attempts != SINGLE_ATTEMPT:
        detail = f"one failed request reached the transport {attempts} times: switch the SDK retries off"
        return failed(RETRY_CHECK, detail)
    return passed(RETRY_CHECK, f"one request, the error reached the caller: {outcome.error}")


async def check_adapter(case: AdapterCase) -> ConformanceReport:
    text, outcome = await check_text_stream(case)
    checks = [text, *await check_structured_output(case), check_usage(outcome), await check_cancellation(case)]
    if case.failing is not None:
        checks.append(await check_no_internal_retries(case.failing, case.prompt))
    return ConformanceReport(tuple(checks))
