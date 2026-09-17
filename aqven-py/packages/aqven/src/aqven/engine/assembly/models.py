from collections.abc import AsyncGenerator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Final, Protocol

from pydantic import SecretStr
from pydantic_ai import ModelHTTPError
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.settings import ModelSettings

from aqven.engine.extensions import RunAwareScope
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.request import RunSpec
from aqven.ir import AgentModel, CompiledAgent, CompiledProject
from aqven.models import CallPolicy, DeclaredModel, cassette_policy, current_call_site, guard_model
from aqven.models.streams import StreamContext, StreamFirstModel
from aqven.ports.execution import ExecutionScope
from aqven.ports.models import PROVIDER_KEY_ENV, ModelFactory, model_provider
from aqven.ports.settings import SettingsStore, provider_key_setting, resolve_secret
from aqven.runtime.options import ModelCall, ModelRoute
from aqven.runtime.replay import ProviderFault
from aqven.spec import Modality, ProviderSpec
from aqven.spec import OpenRouterRouting as RoutingSpec
from aqven_llm import (
    HttpClientFactory,
    MediaOutput,
    ModelOverride,
    OpenRouterRouting,
    ProviderModelFactory,
    ProviderOptions,
    default_http_client,
)

REPLAY_API_KEY: Final = SecretStr("aqven-replay-key")
REPLAY_MODE: Final = "replay"
FAULT_STATUS: Final = 503
FAULT_BODY: Final = "aqven provider fault injected by the run options"
MEDIA_OUTPUTS: Final[Mapping[bool, MediaOutput | None]] = {True: MediaOutput(image=True), False: None}


class ModelFactories(Protocol):
    def factory(self, project: CompiledProject, route: ModelRoute | None, choice: AgentModel) -> ModelFactory: ...


class FaultingModel(StreamFirstModel):
    def __init__(self, wrapped: Model, model_ref: str, faults: Sequence[ProviderFault]) -> None:
        super().__init__(wrapped)
        self.model_ref = model_ref
        self.faults = tuple(faults)

    def faulted(self) -> bool:
        site = current_call_site()
        return any(fault.address == site.address and fault.attempt == site.attempt for fault in self.faults)

    @asynccontextmanager
    async def open_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: StreamContext,
    ) -> AsyncGenerator[StreamedResponse]:
        if self.faulted():
            raise ModelHTTPError(FAULT_STATUS, self.model_ref, FAULT_BODY)
        async with self.wrapped.request_stream(
            messages, model_settings, model_request_parameters, run_context
        ) as stream:
            yield stream


def provider_routing(spec: RoutingSpec | None, route: ModelRoute | None) -> OpenRouterRouting | None:
    if spec is None:
        return None
    zdr = spec.zdr if route is None or route.zdr is None else route.zdr
    return OpenRouterRouting(data_collection=spec.data_collection, zdr=zdr)


def provider_options(spec: ProviderSpec, route: ModelRoute | None) -> ProviderOptions:
    return ProviderOptions(base_url=spec.base_url, routing=provider_routing(spec.routing, route))


@dataclass(frozen=True, slots=True)
class ProjectModelFactories:
    http_client: HttpClientFactory = default_http_client

    def factory(self, project: CompiledProject, route: ModelRoute | None, choice: AgentModel) -> ModelFactory:
        providers = {spec.id.value: provider_options(spec, route) for spec in project.providers}
        actual = choice.model if route is None else route.model
        overrides = {actual: ModelOverride(media=MEDIA_OUTPUTS[Modality.IMAGE in choice.capabilities.output])}
        return ProviderModelFactory(providers=providers, overrides=overrides, http_client=self.http_client)


@dataclass(frozen=True, slots=True)
class ProviderKeys:
    settings: SettingsStore | None
    environ: Mapping[str, str]

    async def key(self, model: str, replay: bool) -> SecretStr:
        provider = model_provider(model)
        env_var = PROVIDER_KEY_ENV[provider]
        found = await self._resolved(model, env_var)
        if found is not None:
            return found
        if replay:
            return REPLAY_API_KEY
        message = (
            f"no API key for provider {provider.value} ({model}): set {env_var} in the project .env or the environment"
        )
        raise LlmNodeError(LlmFailureCode.PROVIDER_KEY_MISSING, message)

    async def _resolved(self, model: str, env_var: str) -> SecretStr | None:
        if self.settings is None:
            value = self.environ.get(env_var, "")
            return SecretStr(value) if value else None
        setting = provider_key_setting(model_provider(model))
        resolved = await resolve_secret(self.settings, setting, env_var, self.environ)
        return None if resolved is None else resolved.value


def scope_run_spec(scope: ExecutionScope) -> RunSpec | None:
    return scope.run_spec if isinstance(scope, RunAwareScope) else None


def uses_tools(agent: CompiledAgent) -> bool:
    return bool(agent.tools or agent.mcp_servers or agent.subagents)


def model_route(
    spec: RunSpec | None, agent: CompiledAgent, choice: AgentModel, media: frozenset[Modality]
) -> ModelRoute | None:
    if spec is None or spec.models is None:
        return None
    return spec.models.route(ModelCall(model=choice, uses_tools=uses_tools(agent), media=media))


def choice_faults(spec: RunSpec | None, choice: AgentModel) -> tuple[ProviderFault, ...]:
    if spec is None:
        return ()
    return tuple(fault for fault in spec.faults if fault.model == choice.model)


@dataclass(frozen=True, slots=True)
class EngineModelSource:
    factories: ModelFactories
    keys: ProviderKeys

    async def model(self, scope: ExecutionScope, agent: CompiledAgent, media: frozenset[Modality]) -> Model:
        spec = scope_run_spec(scope)
        models = [await self._choice(scope, spec, agent, choice, media) for choice in agent.models]
        if len(models) == 1:
            return models[0]
        return FallbackModel(models[0], *models[1:])

    async def _choice(
        self,
        scope: ExecutionScope,
        spec: RunSpec | None,
        agent: CompiledAgent,
        choice: AgentModel,
        media: frozenset[Modality],
    ) -> Model:
        route = model_route(spec, agent, choice, media)
        actual = choice.model if route is None else route.model
        api_key = await self.keys.key(actual, scope.mode == REPLAY_MODE)
        factory = self.factories.factory(scope.project, route, choice)
        provider_model = factory.build(actual, settings=None, api_key=api_key)
        cassettes = cassette_policy(None if spec is None else spec.cassettes, secrets=(api_key,))
        guarded = guard_model(provider_model, model_ref=choice.model, policy=CallPolicy(cassettes=cassettes))
        return DeclaredModel(FaultingModel(guarded, choice.model, choice_faults(spec, choice)), choice.model)
