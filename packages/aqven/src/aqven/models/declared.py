from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from typing import Final

from pydantic_ai.messages import ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings

from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel

MODEL_REF_METADATA: Final = "aqven.model_ref"


def declared_model_ref(response: ModelResponse) -> str | None:
    value = (response.metadata or {}).get(MODEL_REF_METADATA)
    return value if isinstance(value, str) else None


class DeclaredModelRelay:
    def __init__(self, model_ref: str) -> None:
        self.model_ref = model_ref

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            yield event

    def response(self, response: ModelResponse) -> ModelResponse:
        return replace(response, metadata={**(response.metadata or {}), MODEL_REF_METADATA: self.model_ref})


class DeclaredModel(StreamFirstModel):
    def __init__(self, wrapped: Model, model_ref: str) -> None:
        super().__init__(wrapped)
        self.model_ref = model_ref

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
            yield RelayedStream(stream, DeclaredModelRelay(self.model_ref))
