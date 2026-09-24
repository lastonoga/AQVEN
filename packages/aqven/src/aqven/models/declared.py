from collections.abc import AsyncGenerator, AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import replace
from typing import Final

from pydantic_ai.messages import ModelMessage, ModelResponse, ModelResponseStreamEvent
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings

from aqven.models.streams import RelayedStream, StreamContext, StreamFirstModel

MODEL_REF_METADATA: Final = "aqven.model_ref"
MODEL_POSITION_METADATA: Final = "aqven.model_position"


def declared_model_ref(response: ModelResponse) -> str | None:
    value = (response.metadata or {}).get(MODEL_REF_METADATA)
    return value if isinstance(value, str) else None


def declared_position(response: ModelResponse) -> int | None:
    value = (response.metadata or {}).get(MODEL_POSITION_METADATA)
    return value if isinstance(value, int) else None


class DeclaredModelRelay:
    def __init__(self, model_ref: str, position: int | None = None) -> None:
        self.model_ref = model_ref
        self.position = position

    async def events(self, source: AsyncIterator[ModelResponseStreamEvent]) -> AsyncIterator[ModelResponseStreamEvent]:
        async for event in source:
            yield event

    def stamps(self) -> Mapping[str, str | int]:
        positioned = {} if self.position is None else {MODEL_POSITION_METADATA: self.position}
        return {MODEL_REF_METADATA: self.model_ref, **positioned}

    def response(self, response: ModelResponse) -> ModelResponse:
        return replace(response, metadata={**(response.metadata or {}), **self.stamps()})


class DeclaredModel(StreamFirstModel):
    def __init__(self, wrapped: Model, model_ref: str, position: int | None = None) -> None:
        super().__init__(wrapped)
        self.model_ref = model_ref
        self.position = position

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
            yield RelayedStream(stream, DeclaredModelRelay(self.model_ref, self.position))
