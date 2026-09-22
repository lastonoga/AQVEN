from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import datetime
from typing import Protocol

from pydantic_ai import RunContext
from pydantic_ai.messages import ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import RequestUsage

type StreamContext = RunContext[object] | None


class StreamRelay(Protocol):
    def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]: ...

    def response(self, response: ModelResponse) -> ModelResponse: ...


class RelayedStream(StreamedResponse):
    def __init__(self, source: StreamedResponse, relay: StreamRelay) -> None:
        super().__init__(source.model_request_parameters)
        self.source = source
        self.relay = relay

    def __aiter__(self) -> AsyncIterator[ModelResponseStreamEvent]:
        if self._event_iterator is None:
            self._event_iterator = self._relay_events()
        return self._event_iterator

    async def _relay_events(self) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in self.relay.events(self._observed_source()):
            self._sync_from_source()
            yield event
        self._sync_from_source()

    async def _observed_source(self) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in self.source:
            self._sync_from_source()
            yield event
        self._sync_from_source()

    async def _get_event_iterator(self) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in self.source:
            yield event

    def _sync_from_source(self) -> None:
        self.final_result_event = self.source.final_result_event
        self.provider_response_id = self.source.provider_response_id
        self.provider_details = self.source.provider_details
        self.finish_reason = self.source.finish_reason
        self.state = self.source.state
        self.metadata = self.source.metadata

    def get(self) -> ModelResponse:
        return self.relay.response(self.source.get())

    async def cancel(self) -> None:
        await self.source.cancel()

    async def close_stream(self) -> None:
        await self.source.close_stream()

    def get_stream_cancel_errors(self) -> tuple[type[BaseException], ...]:
        return self.source.get_stream_cancel_errors()

    def time_to_first_chunk(self, request_start: float) -> float | None:
        return self.source.time_to_first_chunk(request_start)

    @property
    def cancelled(self) -> bool:
        return self.source.cancelled

    @property
    def usage(self) -> RequestUsage:
        return self.source.usage

    @property
    def model_name(self) -> str:
        return self.source.model_name

    @property
    def provider_name(self) -> str | None:
        return self.source.provider_name

    @property
    def provider_url(self) -> str | None:
        return self.source.provider_url

    @property
    def timestamp(self) -> datetime:
        return self.source.timestamp


async def drain(stream: StreamedResponse) -> ModelResponse:
    async for _ in stream:
        continue
    return stream.get()


class StreamFirstModel(WrapperModel):
    def __init__(self, wrapped: Model) -> None:
        super().__init__(wrapped)

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        async with self.request_stream(messages, model_settings, model_request_parameters) as stream:
            return await drain(stream)

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext = None,
    ) -> AsyncGenerator[StreamedResponse]:
        async with self.open_stream(messages, model_settings, model_request_parameters, run_context) as stream:
            yield stream

    def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AbstractAsyncContextManager[StreamedResponse]:
        return self.wrapped.request_stream(messages, model_settings, model_request_parameters, run_context)
