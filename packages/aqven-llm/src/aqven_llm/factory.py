import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Final

import httpx2
from pydantic import SecretStr
from pydantic_ai.exceptions import UserError
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven_llm.adapters import (
    NO_PARAMS,
    CustomProvider,
    ProviderCapabilities,
    ProviderContext,
    ProviderFactory,
    ProviderParams,
    ProviderRegistry,
    ensure_streaming,
)
from aqven_llm.catalog import PROVIDER_SEPARATOR, PROVIDERS, ProviderEntry, split_model
from aqven_llm.connectors import MODEL_BUILDERS, ModelBuilder
from aqven_llm.errors import ProviderMisconfigured, UnknownProvider
from aqven_llm.keys import environment_key, required_key
from aqven_llm.media import TEXT_ONLY, MediaOutput
from aqven_llm.routing import OpenRouterRouting
from aqven_llm.support import ModuleFinder, StreamProbe, ensure_ready, model_streams, module_available
from aqven_llm.target import ModelTarget

type HttpClientFactory = Callable[[], httpx2.AsyncClient]

REQUEST_TIMEOUT_SECONDS: Final = 600.0
CONNECT_TIMEOUT_SECONDS: Final = 10.0


def default_http_client() -> httpx2.AsyncClient:
    return httpx2.AsyncClient(timeout=httpx2.Timeout(REQUEST_TIMEOUT_SECONDS, connect=CONNECT_TIMEOUT_SECONDS))


@dataclass(frozen=True, slots=True)
class ProviderOptions:
    base_url: str | None = None
    routing: OpenRouterRouting | None = None
    factory: ProviderFactory | None = None
    params: ProviderParams = field(default_factory=lambda: NO_PARAMS)
    capabilities: ProviderCapabilities | None = None
    api_key_env: str | None = None


@dataclass(frozen=True, slots=True)
class ModelOverride:
    routing: OpenRouterRouting | None = None
    media: MediaOutput | None = None


NO_OPTIONS: Final = ProviderOptions()
NO_OVERRIDE: Final = ModelOverride()


def split_provider(model: str, known: tuple[str, ...]) -> tuple[str, str]:
    provider, separator, name = model.partition(PROVIDER_SEPARATOR)
    if not separator or not name:
        raise UnknownProvider(model, known)
    return provider, name


class ProviderModelFactory:
    def __init__(
        self,
        *,
        providers: Mapping[str, ProviderOptions] | None = None,
        overrides: Mapping[str, ModelOverride] | None = None,
        http_client: HttpClientFactory = default_http_client,
        environ: Mapping[str, str] | None = None,
        catalog: Mapping[str, ProviderEntry] = PROVIDERS,
        builders: Mapping[str, ModelBuilder] = MODEL_BUILDERS,
        finder: ModuleFinder = module_available,
        streams: StreamProbe = model_streams,
        registry: ProviderRegistry | None = None,
    ) -> None:
        self.providers: Mapping[str, ProviderOptions] = {} if providers is None else providers
        self.overrides: Mapping[str, ModelOverride] = {} if overrides is None else overrides
        self.http_client = http_client
        self.environ: Mapping[str, str] = os.environ if environ is None else environ
        self.catalog = catalog
        self.builders = builders
        self.finder = finder
        self.streams = streams
        self.registry = ProviderRegistry() if registry is None else registry

    def custom(self, provider: str) -> CustomProvider | None:
        options = self.providers.get(provider)
        if options is not None and options.factory is not None:
            return CustomProvider(provider, options.factory, options.capabilities, "project")
        return self.registry.custom(provider)

    def target(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None = None) -> ModelTarget:
        entry, name = split_model(model, self.catalog)
        ensure_ready(entry, finder=self.finder, streams=self.streams)
        options = self.providers.get(entry.name, NO_OPTIONS)
        override = self.overrides.get(model, NO_OVERRIDE)
        return ModelTarget(
            provider=entry.name,
            name=name,
            api_key=required_key(entry, api_key or environment_key(entry, self.environ)),
            http_client=self.http_client(),
            settings=settings,
            base_url=options.base_url,
            routing=override.routing or options.routing,
            media=override.media or TEXT_ONLY,
        )

    def context(self, provider: str, *, settings: ModelSettings | None, api_key: SecretStr | None) -> ProviderContext:
        options = self.providers.get(provider, NO_OPTIONS)
        return ProviderContext(
            provider=provider,
            http_client=self.http_client(),
            api_key=api_key or self._environment_key(options),
            base_url=options.base_url,
            params=options.params,
            settings=settings,
        )

    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None = None) -> Model:
        provider, name = split_provider(model, self._known())
        custom = self.custom(provider)
        if custom is not None:
            return self._custom_model(custom, name, settings=settings, api_key=api_key)
        if provider not in self.catalog:
            raise UnknownProvider(model, self._known())
        target = self.target(model, settings=settings, api_key=api_key)
        try:
            return self.builders[target.provider](target)
        except UserError as error:
            raise ProviderMisconfigured(target.provider, str(error)) from error

    def _custom_model(
        self, custom: CustomProvider, name: str, *, settings: ModelSettings | None, api_key: SecretStr | None
    ) -> Model:
        context = self.context(custom.id, settings=settings, api_key=api_key)
        try:
            model = custom.factory(name, context)
        except UserError as error:
            raise ProviderMisconfigured(custom.id, str(error)) from error
        return ensure_streaming(custom.id, model)

    def _environment_key(self, options: ProviderOptions) -> SecretStr | None:
        value = "" if options.api_key_env is None else self.environ.get(options.api_key_env, "")
        return SecretStr(value) if value else None

    def _known(self) -> tuple[str, ...]:
        return tuple(sorted({*self.catalog, *self.registry.names(), *self.providers}))
