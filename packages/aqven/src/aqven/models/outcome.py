from collections.abc import AsyncGenerator, AsyncIterator, Callable, Mapping
from contextlib import asynccontextmanager
from typing import Final

from pydantic_ai.messages import FinishReason, ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings, merge_model_settings

from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel


class TruncatedOutput(Exception):
    def __init__(self, response: ModelResponse, max_tokens: int | None) -> None:
        super().__init__(f"truncated: finish_reason=length max_tokens={max_tokens}")
        self.response = response
        self.max_tokens = max_tokens


class RefusedOutput(Exception):
    def __init__(self, response: ModelResponse) -> None:
        details = response.provider_details or {}
        reason = details.get("refusal") or details.get("finish_reason") or "content_filter"
        super().__init__(f"refusal: {reason}")
        self.response = response
        self.reason = str(reason)


type GateAction = Callable[[ModelResponse, int | None], ModelResponse]


def pass_through(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    return response


def raise_truncated(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    raise TruncatedOutput(response, max_tokens)


def raise_refused(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    raise RefusedOutput(response)


OUTCOME_GATES: Final[Mapping[FinishReason | None, GateAction]] = {
    "length": raise_truncated,
    "content_filter": raise_refused,
}


def gate_response(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    return OUTCOME_GATES.get(response.finish_reason, pass_through)(response, max_tokens)


class OutcomeRelay:
    def __init__(self, source: StreamedResponse, max_tokens: int | None) -> None:
        self.source = source
        self.max_tokens = max_tokens

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            yield event
        gate_response(self.source.get(), self.max_tokens)

    def response(self, response: ModelResponse) -> ModelResponse:
        return response


class OutcomeGateModel(StreamFirstModel):
    def max_tokens(self, model_settings: ModelSettings | None) -> int | None:
        merged = merge_model_settings(self.wrapped.settings, model_settings) or ModelSettings()
        return merged.get("max_tokens")

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        async with self.wrapped.request_stream(
            messages, model_settings, model_request_parameters, run_context
        ) as stream:
            yield RelayedStream(stream, OutcomeRelay(stream, self.max_tokens(model_settings)))
