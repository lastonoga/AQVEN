import json
from collections.abc import AsyncGenerator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Final, cast

from pydantic import JsonValue, SecretStr
from pydantic_ai import BinaryImage, RunContext
from pydantic_ai.messages import FilePart, ModelMessage, ModelResponse, ModelResponsePart, TextPart, ToolCallPart
from pydantic_ai.models import CompletedStreamedResponse, Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.test import TestModel
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.settings import ModelSettings
from pydantic_ai.tools import ToolDefinition

from aqven.check.simulation.values import PNG_PIXEL, Schema, ValueFactory
from aqven.ir import AgentModel, CompiledProject
from aqven.ports.models import ModelFactory
from aqven.runtime.options import ModelRoute
from aqven.spec import Modality

SIMULATION_MODEL: Final = "aqven-simulation"
TOOL_CALL_PREFIX: Final = "aqven_simulation_"
SIMULATED_TEXT: Final = "simulated model answer"
IMAGE_MEDIA_TYPE: Final = "image/png"
SIMULATION_PROFILE: Final = ModelProfile(
    supports_tools=True,
    supports_json_schema_output=True,
    supports_json_object_output=True,
    supports_image_output=True,
    supports_audio_input=True,
)


class SimulatedModel(TestModel):
    def __init__(self, *, model_name: str, values: ValueFactory, image_output: bool = False) -> None:
        super().__init__(call_tools=[], model_name=model_name, profile=SIMULATION_PROFILE)
        self.values = values
        self.image_output = image_output

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        _, parameters = self.prepare_request(model_settings, model_request_parameters)
        self.last_model_request_parameters = parameters
        return self.simulated(parameters)

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: RunContext[object] | None = None,
    ) -> AsyncGenerator[StreamedResponse]:
        _, parameters = self.prepare_request(model_settings, model_request_parameters)
        self.last_model_request_parameters = parameters
        response = self.simulated(parameters)
        yield CompletedStreamedResponse(response, model_request_parameters=parameters, replay_events=True)

    def simulated(self, parameters: ModelRequestParameters) -> ModelResponse:
        return ModelResponse(parts=[self.part(parameters)], model_name=self.model_name)

    def part(self, parameters: ModelRequestParameters) -> ModelResponsePart:
        tools = parameters.output_tools
        if tools:
            return self.tool_call(tools[0])
        if self.image_output or parameters.allow_image_output:
            return FilePart(content=BinaryImage(data=PNG_PIXEL, media_type=IMAGE_MEDIA_TYPE))
        declared = parameters.output_object
        if declared is None:
            return TextPart(content=SIMULATED_TEXT)
        return TextPart(content=json.dumps(self.values.value(json_schema(declared.json_schema), ""), sort_keys=True))

    def tool_call(self, tool: ToolDefinition) -> ToolCallPart:
        arguments = self.values.record(json_schema(tool.parameters_json_schema), tool.name)
        return ToolCallPart(tool.name, arguments, tool_call_id=f"{TOOL_CALL_PREFIX}{tool.name}")

    def gen_tool_args(self, tool_def: ToolDefinition) -> Mapping[str, JsonValue]:
        return self.values.record(json_schema(tool_def.parameters_json_schema), tool_def.name)


def json_schema(schema: object) -> Schema:
    return cast("Schema", schema)


@dataclass(frozen=True, slots=True)
class SimulatedModelFactory:
    values: ValueFactory
    image_output: bool

    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None) -> Model:
        return SimulatedModel(model_name=model, values=self.values, image_output=self.image_output)


@dataclass(frozen=True, slots=True)
class SimulatedModelFactories:
    values: ValueFactory = field(default_factory=ValueFactory)

    def factory(self, project: CompiledProject, route: ModelRoute | None, choice: AgentModel) -> ModelFactory:
        return SimulatedModelFactory(self.values, Modality.IMAGE in choice.capabilities.output)
