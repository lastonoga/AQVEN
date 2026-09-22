from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Mapping
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Final

import httpx2
from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings
from tenacity import (
    AsyncRetrying,
    RetryCallState,
    retry_if_exception,
    stop_after_attempt,
    stop_after_delay,
    wait_exponential_jitter,
)

from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel

RETRY_AFTER_HEADER: Final = "retry-after"
TOO_MANY_REQUESTS: Final = 429
REQUEST_TIMEOUT: Final = 408
SERVER_ERROR_FLOOR: Final = 500
STATUS_ATTRIBUTE: Final = "status_code"
BODY_ATTRIBUTE: Final = "body"

type Sleep = Callable[[float], Awaitable[None]]
type RetryRule = Callable[[BaseException], bool]
type FirstEvent = ModelResponseStreamEvent | None


def transient_status(status: int | None) -> bool:
    if status is None:
        return False
    return status in {TOO_MANY_REQUESTS, REQUEST_TIMEOUT} or status >= SERVER_ERROR_FLOOR


def retry_http(error: BaseException) -> bool:
    return isinstance(error, ModelHTTPError) and transient_status(error.status_code)


def retry_api(error: BaseException) -> bool:
    return isinstance(error, ModelAPIError)


def retry_transport(error: BaseException) -> bool:
    return isinstance(error, httpx2.TransportError)


RETRY_RULES: Final[Mapping[type[BaseException], RetryRule]] = {
    ModelHTTPError: retry_http,
    ModelAPIError: retry_api,
    httpx2.TransportError: retry_transport,
}


class ProviderErrorBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: int | None = None
    error: ProviderErrorBody | None = None

    def status(self) -> int | None:
        if self.code is not None:
            return self.code
        return None if self.error is None else self.error.status()


def body_status(body: object) -> int | None:
    try:
        return ProviderErrorBody.model_validate(body).status()
    except ValidationError:
        return None


def error_status(error: BaseException) -> int | None:
    status = getattr(error, STATUS_ATTRIBUTE, None)
    if isinstance(status, int) and not isinstance(status, bool):
        return status
    return body_status(getattr(error, BODY_ATTRIBUTE, None))


def is_transient(error: BaseException) -> bool:
    rule = next((RETRY_RULES[kind] for kind in type(error).__mro__ if kind in RETRY_RULES), None)
    if rule is not None:
        return rule(error)
    return transient_status(error_status(error))


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
    initial_seconds: float = 0.5
    max_seconds: float = 8.0
    jitter_seconds: float = 0.5
    budget_seconds: float = 20.0


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


class HeadRelay:
    def __init__(self, head: FirstEvent) -> None:
        self.head = head

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        if self.head is not None:
            yield self.head
        async for event in source:
            yield event

    def response(self, response: ModelResponse) -> ModelResponse:
        return response


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
        stop = stop_after_attempt(self.policy.attempts) | stop_after_delay(self.policy.budget_seconds)
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
            stream, head = await self.enter_with_retries(
                stack, messages, model_settings, model_request_parameters, run_context
            )
            yield RelayedStream(stream, HeadRelay(head))

    async def enter_with_retries(
        self,
        stack: AsyncExitStack,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> tuple[StreamedResponse, FirstEvent]:
        async for attempt in self.retrying():
            with attempt:
                return await self.opened(stack, messages, model_settings, model_request_parameters, run_context)
        raise RuntimeError("retrying stopped without an outcome")

    async def opened(
        self,
        stack: AsyncExitStack,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> tuple[StreamedResponse, FirstEvent]:
        opening = AsyncExitStack()
        stream = await opening.enter_async_context(
            self.wrapped.request_stream(messages, model_settings, model_request_parameters, run_context)
        )
        head = await first_event(opening, stream)
        await stack.enter_async_context(opening.pop_all())
        return stream, head


async def first_event(opening: AsyncExitStack, stream: StreamedResponse) -> FirstEvent:
    try:
        return await anext(aiter(stream), None)
    except BaseException:
        await opening.aclose()
        raise
