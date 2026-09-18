from dataclasses import dataclass
from typing import Final

from pydantic import BaseModel

from aqven.codegen import GENERATED_MODULE
from aqven.engine.human.forms import UnknownForm
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.loading import CodeLoader
from aqven.ir import CompiledInference
from aqven.ports.execution import ExecutionScope
from aqven.spec import TypeId

INPUT_SUFFIX: Final = "In"
OUTPUT_SUFFIX: Final = "Out"


def pascal(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))


@dataclass(frozen=True, slots=True)
class LoaderCode:
    loader: CodeLoader

    def load(self, ref: str) -> object:
        return self.loader.function(ref)


@dataclass(frozen=True, slots=True)
class LoaderInferenceModels:
    loader: CodeLoader
    package: str

    def input_model(self, inference: CompiledInference) -> type[BaseModel]:
        return self._model(inference, INPUT_SUFFIX)

    def output_model(self, inference: CompiledInference) -> type[BaseModel]:
        return self._model(inference, OUTPUT_SUFFIX)

    def _model(self, inference: CompiledInference, suffix: str) -> type[BaseModel]:
        module_name = f"{self.package}.{GENERATED_MODULE}"
        name = f"{pascal(inference.inference_id)}{suffix}"
        found: object = getattr(self.loader.module(module_name, f"{module_name}:{name}"), name, None)
        if isinstance(found, type) and issubclass(found, BaseModel):
            return found
        raise LlmNodeError(
            LlmFailureCode.CODE_INVALID, f"{module_name}:{name} is not a Pydantic model: run aqven generate"
        )


@dataclass(frozen=True, slots=True)
class GeneratedForms:
    loader: CodeLoader
    package: str

    def model(self, type_id: TypeId) -> type[BaseModel]:
        annotation = self.loader.type_annotation(self.package, type_id)
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            return annotation
        raise UnknownForm(type_id)


@dataclass(frozen=True, slots=True)
class LoaderTypes:
    loader: CodeLoader

    def annotation(self, scope: ExecutionScope, type_id: TypeId) -> object:
        return self.loader.type_annotation(scope.project.package, type_id)
