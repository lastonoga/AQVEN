import inspect
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from functools import cache
from importlib.metadata import EntryPoint, entry_points
from typing import Final, Literal, Protocol, cast, get_type_hints

import httpx2
from openai import AsyncOpenAI
from pydantic import JsonValue, SecretStr
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

from aqven_llm.errors import ProviderMisconfigured, ProviderNoStreaming

type ProviderParams = Mapping[str, JsonValue]
type ProviderSource = Literal["project", "package", "builtin"]

ENTRY_POINT_GROUP: Final = "aqven.providers"
OPENAI_COMPATIBLE_KIND: Final = "openai_compatible"
NO_SDK_RETRIES: Final = 0
MODEL_NAME_PARAMETER: Final = "model_name"
CONTEXT_PARAMETER: Final = "context"
RETURN_HINT: Final = "return"
STREAM_METHOD: Final = "request_stream"
NO_PARAMS: Final[ProviderParams] = {}


@dataclass(frozen=True, slots=True)
class ProviderContext:
    provider: str
    http_client: httpx2.AsyncClient
    api_key: SecretStr | None = None
    base_url: str | None = None
    params: ProviderParams = field(default_factory=lambda: NO_PARAMS)
    settings: ModelSettings | None = None

    @property
    def key(self) -> str | None:
        return None if self.api_key is None else self.api_key.get_secret_value()


class ProviderFactory(Protocol):
    def __call__(self, model_name: str, context: ProviderContext) -> Model: ...


@dataclass(frozen=True, slots=True)
class ProviderCapabilities:
    tools: bool = True
    json_schema_output: bool = False


@dataclass(frozen=True, slots=True)
class CustomProvider:
    id: str
    factory: ProviderFactory
    capabilities: ProviderCapabilities | None = None
    source: ProviderSource = "project"


@dataclass(frozen=True, slots=True)
class OpenAICompatibleFactory:
    def __call__(self, model_name: str, context: ProviderContext) -> Model:
        if context.base_url is None:
            raise ProviderMisconfigured(context.provider, f"kind {OPENAI_COMPATIBLE_KIND} needs base_url")
        draft = OpenAIProvider(base_url=context.base_url, api_key=context.key, http_client=context.http_client)
        client: AsyncOpenAI = draft.client.with_options(max_retries=NO_SDK_RETRIES)
        return OpenAIChatModel(model_name, provider=OpenAIProvider(openai_client=client), settings=context.settings)


OPENAI_COMPATIBLE: Final[ProviderFactory] = OpenAICompatibleFactory()


@dataclass(frozen=True, slots=True)
class InvalidFactory:
    provider: str
    detail: str

    def __call__(self, model_name: str, context: ProviderContext) -> Model:
        raise ProviderMisconfigured(self.provider, self.detail)


def qualified_name(value: type[object]) -> str:
    return f"{value.__module__}.{value.__qualname__}"


def class_streams(model_class: type[Model]) -> bool:
    return getattr(model_class, STREAM_METHOD) is not Model.request_stream


def ensure_streaming(provider: str, model: Model) -> Model:
    if class_streams(type(model)):
        return model
    raise ProviderNoStreaming(provider, qualified_name(type(model)))


def entry_point_provider(point: EntryPoint) -> CustomProvider:
    try:
        loaded: object = point.load()
    except Exception as error:
        detail = f"entry point {ENTRY_POINT_GROUP}:{point.name} does not import: {type(error).__name__}: {error}"
        return CustomProvider(point.name, InvalidFactory(point.name, detail), source="package")
    if isinstance(loaded, CustomProvider):
        return replace(loaded, id=point.name, source="package")
    if callable(loaded):
        factory = cast(ProviderFactory, loaded)
        return CustomProvider(point.name, factory, source="package")
    detail = f"entry point {ENTRY_POINT_GROUP}:{point.name} is {type(loaded).__name__}, not a provider factory"
    return CustomProvider(point.name, InvalidFactory(point.name, detail), source="package")


@cache
def installed_providers() -> Mapping[str, CustomProvider]:
    return {point.name: entry_point_provider(point) for point in entry_points(group=ENTRY_POINT_GROUP)}


@dataclass(frozen=True, slots=True)
class ProviderRegistry:
    project: Mapping[str, CustomProvider] = field(default_factory=dict[str, CustomProvider])
    installed: Mapping[str, CustomProvider] = field(default_factory=installed_providers)

    def custom(self, provider: str) -> CustomProvider | None:
        return self.project.get(provider) or self.installed.get(provider)

    def names(self) -> tuple[str, ...]:
        return tuple(sorted({*self.project, *self.installed}))


@dataclass(frozen=True, slots=True)
class FactoryProblem:
    message: str
    hint: str


@dataclass(frozen=True, slots=True)
class FactorySignature:
    problems: tuple[FactoryProblem, ...] = ()
    streams: bool | None = None

    @property
    def valid(self) -> bool:
        return not self.problems


SIGNATURE_HINT: Final = (
    "write def build(model_name: str, context: ProviderContext) -> Model: "
    "import ProviderContext from aqven_llm and Model from pydantic_ai.models"
)
RETURN_HINT_TEXT: Final = "annotate the return type with Model or with your own Model subclass"


def factory_signature(value: object) -> FactorySignature:
    if not callable(value):
        return FactorySignature((FactoryProblem(f"{type(value).__name__} is not callable", SIGNATURE_HINT),))
    if inspect.iscoroutinefunction(value):
        problem = FactoryProblem("the factory is async; building a model is synchronous", SIGNATURE_HINT)
        return FactorySignature((problem,))
    hints = _hints(value)
    problems = _signature_problems(value, hints)
    return FactorySignature(problems, _annotated_streams(hints))


def _signature_problems(value: Callable[..., object], hints: Mapping[str, object] | None) -> tuple[FactoryProblem, ...]:
    names = _parameter_names(value)
    if names is None:
        return (FactoryProblem("the factory signature cannot be read", SIGNATURE_HINT),)
    if names != [MODEL_NAME_PARAMETER, CONTEXT_PARAMETER]:
        listed = ", ".join(names) or "—"
        expected = f"({MODEL_NAME_PARAMETER}: str, {CONTEXT_PARAMETER}: ProviderContext)"
        return (FactoryProblem(f"parameters {listed} do not match {expected}", SIGNATURE_HINT),)
    if hints is None:
        return (FactoryProblem("the factory annotations cannot be evaluated", SIGNATURE_HINT),)
    return (
        *_parameter_problem(hints, MODEL_NAME_PARAMETER, str),
        *_parameter_problem(hints, CONTEXT_PARAMETER, ProviderContext),
        *_return_problem(hints),
    )


def _parameter_problem(hints: Mapping[str, object], name: str, expected: type[object]) -> tuple[FactoryProblem, ...]:
    found = hints.get(name)
    if found is expected:
        return ()
    message = f"parameter {name} is annotated {written_name(found)}, expected {expected.__name__}"
    return (FactoryProblem(message, SIGNATURE_HINT),)


def _return_problem(hints: Mapping[str, object]) -> tuple[FactoryProblem, ...]:
    if _is_model_class(hints.get(RETURN_HINT)):
        return ()
    written = written_name(hints.get(RETURN_HINT))
    return (FactoryProblem(f"the return type is {written}, expected a pydantic_ai Model", RETURN_HINT_TEXT),)


def _annotated_streams(hints: Mapping[str, object] | None) -> bool | None:
    found = None if hints is None else hints.get(RETURN_HINT)
    if not _is_model_class(found) or found is Model:
        return None
    return getattr(found, STREAM_METHOD) is not Model.request_stream


def _is_model_class(found: object) -> bool:
    return isinstance(found, type) and issubclass(found, Model)


def written_name(found: object) -> str:
    if found is None:
        return "no annotation"
    name: object = getattr(found, "__name__", None)
    return name if isinstance(name, str) else str(found)


def _parameter_names(value: Callable[..., object]) -> list[str] | None:
    try:
        return [parameter.name for parameter in inspect.signature(value).parameters.values()]
    except TypeError, ValueError:
        return None


def _hints(value: object) -> Mapping[str, object] | None:
    target = value if inspect.isfunction(value) else type(value).__call__
    try:
        return get_type_hints(target, include_extras=True)
    except Exception:
        return None
