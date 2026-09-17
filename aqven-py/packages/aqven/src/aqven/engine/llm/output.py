from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import BaseModel
from pydantic_ai import BinaryImage, NativeOutput, PromptedOutput, ToolOutput

from aqven.ir import CompiledAgent
from aqven.ir.nodes import OutputMode
from aqven.runtime.events import OutputPartKind
from aqven.spec import Image

OUTPUT_TOOL_NAME: Final = "final_result"

type OutputSpec = ToolOutput[BaseModel] | NativeOutput[BaseModel] | PromptedOutput[BaseModel] | type[BinaryImage]


@dataclass(frozen=True, slots=True)
class OutputPlan:
    spec: OutputSpec
    text_kind: OutputPartKind
    output_tools: frozenset[str]
    image_field: str | None = None
    mode: OutputMode = "tool"


type OutputStrategy = Callable[[type[BaseModel], bool], OutputPlan]


def tool_plan(model: type[BaseModel], strict: bool) -> OutputPlan:
    spec = ToolOutput(model, name=OUTPUT_TOOL_NAME, strict=strict)
    return OutputPlan(spec, "text", frozenset({OUTPUT_TOOL_NAME}), mode="tool")


def native_plan(model: type[BaseModel], strict: bool) -> OutputPlan:
    spec = NativeOutput(model, name=OUTPUT_TOOL_NAME, strict=strict)
    return OutputPlan(spec, "output_json", frozenset(), mode="native")


def prompted_plan(model: type[BaseModel], strict: bool) -> OutputPlan:
    return OutputPlan(PromptedOutput(model, name=OUTPUT_TOOL_NAME), "output_json", frozenset(), mode="prompted")


OUTPUT_STRATEGIES: Final[Mapping[OutputMode, OutputStrategy]] = {
    "tool": tool_plan,
    "native": native_plan,
    "prompted": prompted_plan,
}


def sole_image_field(model: type[BaseModel]) -> str | None:
    fields = list(model.model_fields.items())
    if len(fields) != 1:
        return None
    name, info = fields[0]
    annotation = info.annotation
    return name if isinstance(annotation, type) and issubclass(annotation, Image) else None


def output_plan(mode: OutputMode, model: type[BaseModel], strict: bool = True) -> OutputPlan:
    image_field = sole_image_field(model)
    if image_field is not None:
        return OutputPlan(BinaryImage, "text", frozenset(), image_field, mode)
    return OUTPUT_STRATEGIES[mode](model, strict)


def agent_output_mode(agent: CompiledAgent) -> OutputMode:
    return agent.output.mode


def agent_strict(agent: CompiledAgent) -> bool:
    return agent.output.strict and agent.primary.capabilities.strict
