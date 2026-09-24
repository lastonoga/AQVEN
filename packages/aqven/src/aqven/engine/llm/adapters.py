import pkgutil
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from pydantic import BaseModel, SecretStr
from pydantic_ai.messages import AudioUrl, DocumentUrl, ImageUrl, UserContent, VideoUrl
from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel

from aqven.codegen import GENERATED_MODULE
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.ports import SegmentWork, ToolCallWork
from aqven.engine.llm.segments import PendingToolCall, SegmentResult, SegmentState, ToolCallResult
from aqven.ir import AgentModel, CompiledAgent, CompiledInference
from aqven.ports.execution import ExecutionScope
from aqven.ports.models import ModelFactory, provider_env_var
from aqven.ports.settings import SettingsStore, provider_key_setting, resolve_secret
from aqven.spec import SECRET_REF_PATTERN, MediaValue, Modality, SecretRef

INPUT_SUFFIX: Final = "In"
OUTPUT_SUFFIX: Final = "Out"
ENV_SECRET: Final = re.compile(SECRET_REF_PATTERN)
ENV_SECRET_PREFIX: Final = "ref:env/"
MEDIA_TYPE_SEPARATOR: Final = "/"

type MediaUrlBuilder = Callable[[str, str], UserContent]


def pascal(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))


@dataclass(slots=True)
class ImportCodeLoader:
    cache: dict[str, object] = field(default_factory=dict[str, object])

    def load(self, ref: str) -> object:
        if ref not in self.cache:
            self.cache[ref] = pkgutil.resolve_name(ref)
        return self.cache[ref]


@dataclass(frozen=True, slots=True)
class GeneratedInferenceModels:
    package: str

    def input_model(self, inference: CompiledInference) -> type[BaseModel]:
        return self._model(inference, INPUT_SUFFIX)

    def output_model(self, inference: CompiledInference) -> type[BaseModel]:
        return self._model(inference, OUTPUT_SUFFIX)

    def _model(self, inference: CompiledInference, suffix: str) -> type[BaseModel]:
        ref = f"{self.package}.{GENERATED_MODULE}:{pascal(inference.inference_id)}{suffix}"
        found = pkgutil.resolve_name(ref)
        if isinstance(found, type) and issubclass(found, BaseModel):
            return found
        raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"{ref} is not a Pydantic model: run aqven generate")


@dataclass(frozen=True, slots=True)
class MappedInferenceModels:
    inputs: Mapping[str, type[BaseModel]]
    outputs: Mapping[str, type[BaseModel]]

    def input_model(self, inference: CompiledInference) -> type[BaseModel]:
        return _mapped(self.inputs, inference, "input")

    def output_model(self, inference: CompiledInference) -> type[BaseModel]:
        return _mapped(self.outputs, inference, "output")


def _mapped(models: Mapping[str, type[BaseModel]], inference: CompiledInference, side: str) -> type[BaseModel]:
    found = models.get(inference.inference_id)
    if found is None:
        raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"inference {inference.inference_id} has no {side} model")
    return found


def chain_choices(agent: CompiledAgent, start: int) -> tuple[AgentModel, ...]:
    choices = agent.models[start:]
    if not choices:
        message = f"agent {agent.agent_id} has no model at position {start} of its model chain"
        raise LlmNodeError(LlmFailureCode.PROVIDER_ERROR, message)
    return choices


def model_chain(models: Sequence[Model]) -> Model:
    if len(models) == 1:
        return models[0]
    return FallbackModel(models[0], *models[1:])


@dataclass(frozen=True, slots=True)
class FactoryModelSource:
    factory: ModelFactory
    settings: SettingsStore
    environ: Mapping[str, str]

    async def model(
        self, scope: ExecutionScope, agent: CompiledAgent, media: frozenset[Modality], start: int = 0
    ) -> Model:
        return model_chain([await self._build(choice) for choice in chain_choices(agent, start)])

    async def _build(self, choice: AgentModel) -> Model:
        env_var = provider_env_var(choice.provider)
        resolved = await resolve_secret(self.settings, provider_key_setting(choice.provider), env_var, self.environ)
        if resolved is None:
            named = env_var or f"the variable of the api_key ref of provider {choice.provider}"
            message = f"no API key for provider {choice.provider}: set {named} in the project .env or the environment"
            raise LlmNodeError(LlmFailureCode.PROVIDER_KEY_MISSING, message)
        return self.factory.build(choice.model, settings=None, api_key=resolved.value)


@dataclass(frozen=True, slots=True)
class EnvironmentSecrets:
    environ: Mapping[str, str]

    async def secret(self, ref: SecretRef) -> SecretStr:
        if ENV_SECRET.fullmatch(ref) is None:
            raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"secret {ref} is not a ref:env/<NAME> reference")
        value = self.environ.get(ref.removeprefix(ENV_SECRET_PREFIX), "")
        if not value:
            raise LlmNodeError(LlmFailureCode.PROVIDER_KEY_MISSING, f"secret {ref} is not set in the environment")
        return SecretStr(value)


def _image(url: str, media_type: str) -> UserContent:
    return ImageUrl(url=url, media_type=media_type)


def _audio(url: str, media_type: str) -> UserContent:
    return AudioUrl(url=url, media_type=media_type)


def _video(url: str, media_type: str) -> UserContent:
    return VideoUrl(url=url, media_type=media_type)


def _document(url: str, media_type: str) -> UserContent:
    return DocumentUrl(url=url, media_type=media_type)


MEDIA_URLS: Final[Mapping[str, MediaUrlBuilder]] = {
    "image": _image,
    "audio": _audio,
    "video": _video,
    "application": _document,
    "text": _document,
}


@dataclass(frozen=True, slots=True)
class UrlMediaLoader:
    async def content(self, scope: ExecutionScope, media: MediaValue) -> UserContent:
        builder = MEDIA_URLS.get(media.media_type.split(MEDIA_TYPE_SEPARATOR)[0])
        if media.url is None or builder is None:
            message = f"media {media.blob_id} is unavailable to the model: no url or unknown type {media.media_type}"
            raise LlmNodeError(LlmFailureCode.MEDIA_UNAVAILABLE, message)
        return builder(media.url, media.media_type)


@dataclass(frozen=True, slots=True)
class InlineSteps:
    async def segment(self, scope: ExecutionScope, state: SegmentState, work: SegmentWork) -> SegmentResult:
        return await work()

    async def tool_call(self, scope: ExecutionScope, call: PendingToolCall, work: ToolCallWork) -> ToolCallResult:
        return await work()
