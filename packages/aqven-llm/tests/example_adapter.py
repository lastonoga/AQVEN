from collections.abc import AsyncIterator
from typing import Final

from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model, ModelRequestParameters
from pydantic_ai.models.function import AgentInfo, DeltaToolCalls, FunctionModel
from pydantic_ai.settings import ModelSettings

from aqven_llm import ProviderContext

ECHO_PREFIX: Final = "echo: "
DELTA_COUNT: Final = 3


def prompt_text(messages: list[ModelMessage]) -> str:
    texts = [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart) and isinstance(part.content, str)
    ]
    return texts[-1] if texts else ""


async def echo_stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
    text = f"{ECHO_PREFIX}{prompt_text(messages)}"
    size = max(len(text) // DELTA_COUNT, 1)
    for start in range(0, len(text), size):
        yield text[start : start + size]


def echo_reply(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    return ModelResponse(parts=[TextPart(f"{ECHO_PREFIX}{prompt_text(messages)}")])


def build_model(model_name: str, context: ProviderContext) -> FunctionModel:
    return FunctionModel(echo_reply, stream_function=echo_stream, model_name=f"{context.provider}:{model_name}")


class SilentModel(Model):
    @property
    def model_name(self) -> str:
        return "silent"

    @property
    def system(self) -> str:
        return "example"

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        return ModelResponse(parts=[TextPart("silent")])


def build_silent(model_name: str, context: ProviderContext) -> SilentModel:
    return SilentModel()


async def build_async(model_name: str, context: ProviderContext) -> Model:
    return build_model(model_name, context)


def build_any(model_name: str, context: ProviderContext) -> Model:
    return build_model(model_name, context)


def build_wrong_parameters(name: str, context: ProviderContext) -> Model:
    return build_model(name, context)


def build_wrong_return(model_name: str, context: ProviderContext) -> str:
    return model_name


NOT_A_FACTORY: Final = "aqven"
