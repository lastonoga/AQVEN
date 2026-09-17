from collections.abc import AsyncGenerator, Awaitable, Callable, Mapping
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Final

from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings
from tenacity import AsyncRetrying, RetryCallState, retry_if_exception, stop_after_attempt, wait_exponential_jitter

from aqven.models.streams import StreamContext, StreamFirstModel

RETRY_AFTER_HEADER: Final = "retry-after"
TOO_MANY_REQUESTS: Final = 429
SERVER_ERROR_FLOOR: Final = 500

type Sleep = Callable[[float], Awaitable[None]]
type RetryRule = Callable[[BaseException], bool]


def retry_http(error: BaseException) -> bool:
    if not isinstance(error, ModelHTTPError):
        return False
    return error.status_code == TOO_MANY_REQUESTS or error.status_code >= SERVER_ERROR_FLOOR


def retry_api(error: BaseException) -> bool:
    return isinstance(error, ModelAPIError)


RETRY_RULES: Final[Mapping[type[BaseException], RetryRule]] = {
    ModelHTTPError: retry_http,
    ModelAPIError: retry_api,
}


def is_transient(error: BaseException) -> bool:
    rule = next((RETRY_RULES[kind] for kind in type(error).__mro__ if kind in RETRY_RULES), None)
    return rule is not None and rule(error)


def retry_after_seconds(error: BaseException | None, now: datetime) -> float | None:
    if not isinstance(error, ModelHTTPError) or error.headers is None:
        return None
    raw = error.headers.get(RETRY_AFTER_HEADER)
    if raw is None:
        return None
    return parse_retry_after(raw.strip(), now)


def parse_retry_after(raw: str, now: datetime) -> float | None:
    try:
        return max(float(raw), 0.0)
    except ValueError:
        return retry_after_date(raw, now)


def retry_after_date(raw: str, now: datetime) -> float | None:
    try:
        moment = parsedate_to_datetime(raw)
    except TypeError, ValueError:
        return None
    return max((moment - now).total_seconds(), 0.0)


@dataclass(frozen=True, slots=True)
class BackoffPolicy:
    attempts: int = 4
    initial_seconds: float = 1.0
    max_seconds: float = 30.0
    jitter_seconds: float = 1.0


class RetryAfterWait:
    def __init__(self, policy: BackoffPolicy, clock: Callable[[], datetime]) -> None:
        self.fallback = wait_exponential_jitter(
            initial=policy.initial_seconds, max=policy.max_seconds, jitter=policy.jitter_seconds
        )
        self.max_seconds = policy.max_seconds
        self.clock = clock

    def __call__(self, retry_state: RetryCallState) -> float:
        outcome = retry_state.outcome
        error = None if outcome is None else outcome.exception()
        hinted = retry_after_seconds(error, self.clock())
        if hinted is None:
            return self.fallback(retry_state)
        return min(hinted, self.max_seconds)


def utc_now() -> datetime:
    return datetime.now(UTC)


class BackoffModel(StreamFirstModel):
    def __init__(
        self,
        wrapped: Model,
        *,
        policy: BackoffPolicy | None = None,
        sleep: Sleep | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        super().__init__(wrapped)
        self.policy = BackoffPolicy() if policy is None else policy
        self.sleep = sleep
        self.clock = clock

    def retrying(self) -> AsyncRetrying:
        wait = RetryAfterWait(self.policy, self.clock)
        stop = stop_after_attempt(self.policy.attempts)
        retry = retry_if_exception(is_transient)
        if self.sleep is None:
            return AsyncRetrying(stop=stop, wait=wait, retry=retry, reraise=True)
        return AsyncRetrying(sleep=self.sleep, stop=stop, wait=wait, retry=retry, reraise=True)

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        async with AsyncExitStack() as stack:
            stream = await self.enter_with_retries(
                stack, messages, model_settings, model_request_parameters, run_context
            )
            yield stream

    async def enter_with_retries(
        self,
        stack: AsyncExitStack,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> StreamedResponse:
        async for attempt in self.retrying():
            with attempt:
                return await stack.enter_async_context(
                    self.wrapped.request_stream(messages, model_settings, model_request_parameters, run_context)
                )
        raise RuntimeError("retrying stopped without an outcome")
