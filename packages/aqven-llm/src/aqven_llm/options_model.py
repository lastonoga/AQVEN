from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from pydantic_ai import RunContext
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai.settings import ModelSettings, merge_model_settings
from pydantic_ai.usage import RequestUsage

from aqven_llm.request_options import OptionsDelivery, native_settings

type StreamContext = RunContext[object] | None


class NativeOptionsModel(WrapperModel):
    def __init__(self, wrapped: Model, delivery: OptionsDelivery) -> None:
        super().__init__(wrapped)
        self.delivery = delivery

    def native(self, model_settings: ModelSettings | None) -> ModelSettings | None:
        merged = merge_model_settings(self.wrapped.settings, model_settings)
        return native_settings(self.delivery, merged, self.wrapped.profile)

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        return await self.wrapped.request(messages, self.native(model_settings), model_request_parameters)

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext = None,
    ) -> AsyncGenerator[StreamedResponse]:
        async with self.wrapped.request_stream(
            messages, self.native(model_settings), model_request_parameters, run_context
        ) as stream:
            yield stream

    async def count_tokens(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> RequestUsage:
        return await self.wrapped.count_tokens(messages, self.native(model_settings), model_request_parameters)

    def prepare_request(
        self,
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> tuple[ModelSettings | None, ModelRequestParameters]:
        return self.wrapped.prepare_request(self.native(model_settings), model_request_parameters)


def with_native_options(model: Model, delivery: OptionsDelivery) -> Model:
    if not delivery.rewrites:
        return model
    return NativeOptionsModel(model, delivery)
