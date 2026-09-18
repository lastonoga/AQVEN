from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Final

from pydantic_ai import ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel

from aqven_llm import ProviderContext

ECHO_PREFIX: Final = "echo: "
OUTPUT_HEAD: Final = '{"label": "broken lamp", '
OUTPUT_TAIL: Final = '"rating": 4}'
TEXT_MODE: Final = "text"
DELTA_COUNT: Final = 4
FAULT_STATUS: Final = 503
FAULT_BODY: Final = "the echo provider is unavailable"


def prompt_text(messages: list[ModelMessage]) -> str:
    texts = [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart) and isinstance(part.content, str)
    ]
    return texts[-1] if texts else ""


def chunks(text: str, count: int) -> list[str]:
    size = max(len(text) // count, 1)
    return [text[start : start + size] for start in range(0, len(text), size)]


async def echo_stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
    if info.output_tools:
        name = info.output_tools[0].name
        yield {0: DeltaToolCall(name=name, json_args=OUTPUT_HEAD, tool_call_id="call_1")}
        yield {0: DeltaToolCall(json_args=OUTPUT_TAIL)}
        return
    if info.model_request_parameters.output_mode != TEXT_MODE:
        for part in chunks(f"{OUTPUT_HEAD}{OUTPUT_TAIL}", DELTA_COUNT):
            yield part
        return
    for part in chunks(f"{ECHO_PREFIX}{prompt_text(messages)}", DELTA_COUNT):
        yield part


def echo_reply(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    return ModelResponse(parts=[TextPart(f"{ECHO_PREFIX}{prompt_text(messages)}")])


def build_model(model_name: str, context: ProviderContext) -> FunctionModel:
    return FunctionModel(echo_reply, stream_function=echo_stream, model_name=f"{context.provider}:{model_name}")


@dataclass(slots=True)
class FailingEcho:
    calls: int = 0

    def attempts(self) -> int:
        return self.calls

    def build(self) -> Model:
        return FunctionModel(stream_function=self._fail, model_name="echo:failing")

    async def _fail(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
        self.calls += 1
        raise ModelHTTPError(FAULT_STATUS, "echo:failing", FAULT_BODY)
        yield ""
