from collections.abc import AsyncGenerator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Final, Protocol

from pydantic import SecretStr
from pydantic_ai import ModelHTTPError
from pydantic_ai.concurrency import AbstractConcurrencyLimiter
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.settings import ModelSettings

from aqven.engine.extensions import RunAwareScope
from aqven.engine.llm.adapters import chain_choices, model_chain
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.request import RunSpec
from aqven.engine.runtime import RunBudgets
from aqven.ir import AgentModel, CompiledAgent, CompiledProject
from aqven.models import (
    CallPolicy,
    ContextUsageSink,
    DeclaredModel,
    UsageBudget,
    cassette_policy,
    current_call_site,
    guard_model,
)
from aqven.models.providers import CUSTOM_KINDS, custom_options, key_variable
from aqven.models.rate import ProviderLimiters
from aqven.models.streams import StreamContext, StreamFirstModel
from aqven.ports.execution import ExecutionScope
from aqven.ports.models import ModelFactory, model_provider, provider_env_var
from aqven.ports.prices import NO_PRICES, CachedPrices
from aqven.ports.settings import SettingsStore, provider_key_setting, resolve_secret
from aqven.runtime.options import CallMedia, ModelCall, ModelRoute
from aqven.runtime.replay import ProviderFault
from aqven.spec import Modality, ProviderName, ProviderSpec
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
PROJECT_DOTENV: Final = "the project .env"
EMPTY_KEY_NOTE: Final = (
    "{env_var} is set to an empty string in the environment, which counts as unset, and {dotenv} has no value for it"
)


def explain_empty_key(message: str, env_var: str | None, environ: Mapping[str, str], dotenv: str) -> str:
    if env_var is None or environ.get(env_var) != "":
        return message
    return f"{message}; {EMPTY_KEY_NOTE.format(env_var=env_var, dotenv=dotenv)}"


class ModelFactories(Protocol):
    def factory(self, project: CompiledProject, route: ModelRoute | None, call: ModelCall) -> ModelFactory: ...


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
    options = custom_options(spec)
    return ProviderOptions(
        base_url=options.base_url,
        routing=provider_routing(spec.routing, route),
        factory=options.factory,
        params=options.params,
        capabilities=options.capabilities,
        api_key_env=options.api_key_env,
    )


def provider_spec(project: CompiledProject, provider: str) -> ProviderSpec | None:
    return next((item for item in project.providers if str(item.id) == provider), None)


def key_requirement(project: CompiledProject, provider: str) -> KeyRequirement:
    spec = provider_spec(project, provider)
    if spec is None or spec.kind not in CUSTOM_KINDS:
        return KeyRequirement(provider_env_var(ProviderName(provider)), required=True)
    return KeyRequirement(key_variable(spec.api_key), required=spec.api_key is not None)


@dataclass(frozen=True, slots=True)
class ProjectModelFactories:
    http_client: HttpClientFactory = default_http_client

    def factory(self, project: CompiledProject, route: ModelRoute | None, call: ModelCall) -> ModelFactory:
        providers = {str(spec.id): provider_options(spec, route) for spec in project.providers}
        actual = call.model.model if route is None else route.model
        overrides = {actual: ModelOverride(media=MEDIA_OUTPUTS[Modality.IMAGE in call.media.output])}
        return ProviderModelFactory(providers=providers, overrides=overrides, http_client=self.http_client)


@dataclass(frozen=True, slots=True)
class KeyRequirement:
    env_var: str | None
    required: bool = True


@dataclass(frozen=True, slots=True)
class ProviderKeys:
    settings: SettingsStore | None
    environ: Mapping[str, str]

    async def key(self, model: str, replay: bool, requirement: KeyRequirement | None = None) -> SecretStr | None:
        provider = model_provider(model)
        needed = KeyRequirement(provider_env_var(provider)) if requirement is None else requirement
        found = await self._resolved(model, needed.env_var)
        if found is not None:
            return found
        if not needed.required:
            return None
        if replay:
            return REPLAY_API_KEY
        named = needed.env_var or f"the variable of the api_key ref of provider {provider} in aqven.yaml"
        message = f"no API key for provider {provider} ({model}): set {named} in the project .env or the environment"
        explained = explain_empty_key(message, needed.env_var, self.environ, PROJECT_DOTENV)
        raise LlmNodeError(LlmFailureCode.PROVIDER_KEY_MISSING, explained)

    async def _resolved(self, model: str, env_var: str | None) -> SecretStr | None:
        if self.settings is None:
            value = "" if env_var is None else self.environ.get(env_var, "")
            return SecretStr(value) if value else None
        setting = provider_key_setting(model_provider(model))
        resolved = await resolve_secret(self.settings, setting, env_var, self.environ)
        return None if resolved is None else resolved.value


def scope_run_spec(scope: ExecutionScope) -> RunSpec | None:
    return scope.run_spec if isinstance(scope, RunAwareScope) else None


def uses_tools(agent: CompiledAgent) -> bool:
    return bool(agent.tools or agent.mcp_servers or agent.subagents)


def model_route(spec: RunSpec | None, call: ModelCall) -> ModelRoute | None:
    if spec is None or spec.models is None:
        return None
    return spec.models.route(call)


def choice_faults(spec: RunSpec | None, choice: AgentModel) -> tuple[ProviderFault, ...]:
    if spec is None:
        return ()
    return tuple(fault for fault in spec.faults if fault.model == choice.model)


def run_budget(budgets: RunBudgets | None, scope: ExecutionScope, spec: RunSpec | None) -> UsageBudget | None:
    if budgets is None or spec is None:
        return None
    return budgets.budget(scope.run_id, spec.limits)


@dataclass(frozen=True, slots=True)
class EngineModelSource:
    factories: ModelFactories
    keys: ProviderKeys
    limiters: ProviderLimiters | None = None
    budgets: RunBudgets | None = None
    prices: CachedPrices = NO_PRICES

    async def model(self, scope: ExecutionScope, agent: CompiledAgent, media: CallMedia, start: int = 0) -> Model:
        spec = scope_run_spec(scope)
        choices = enumerate(chain_choices(agent, start), start)
        return model_chain([await self._choice(scope, spec, agent, choice, media, index) for index, choice in choices])

    async def _choice(
        self,
        scope: ExecutionScope,
        spec: RunSpec | None,
        agent: CompiledAgent,
        choice: AgentModel,
        media: CallMedia,
        position: int,
    ) -> Model:
        call = ModelCall(model=choice, uses_tools=uses_tools(agent), media=media)
        route = model_route(spec, call)
        actual = choice.model if route is None else route.model
        requirement = key_requirement(scope.project, model_provider(actual))
        api_key = await self.keys.key(actual, scope.mode == REPLAY_MODE, requirement)
        factory = self.factories.factory(scope.project, route, call)
        provider_model = factory.build(actual, settings=None, api_key=api_key)
        secrets = () if api_key is None else (api_key,)
        cassettes = cassette_policy(None if spec is None else spec.cassettes, secrets=secrets)
        policy = CallPolicy(
            cassettes=cassettes,
            concurrency=self._limiter(scope.project, actual),
            budget=run_budget(self.budgets, scope, spec),
            usage_sink=ContextUsageSink(),
            prices=self.prices,
        )
        guarded = guard_model(provider_model, model_ref=actual, policy=policy)
        return DeclaredModel(FaultingModel(guarded, choice.model, choice_faults(spec, choice)), actual, position)

    def _limiter(self, project: CompiledProject, model: str) -> AbstractConcurrencyLimiter | None:
        shared = self.limiters if self.limiters is not None else ProviderLimiters()
        return shared.of(provider_spec(project, model_provider(model)))
