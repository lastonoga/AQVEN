import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

import httpx2
from pydantic import SecretStr
from pydantic_ai.exceptions import UserError
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven_llm.catalog import PROVIDERS, ProviderEntry, split_model
from aqven_llm.connectors import MODEL_BUILDERS, ModelBuilder
from aqven_llm.errors import ProviderMisconfigured
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


@dataclass(frozen=True, slots=True)
class ModelOverride:
    routing: OpenRouterRouting | None = None
    media: MediaOutput | None = None


NO_OPTIONS: Final = ProviderOptions()
NO_OVERRIDE: Final = ModelOverride()


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
    ) -> None:
        self.providers: Mapping[str, ProviderOptions] = {} if providers is None else providers
        self.overrides: Mapping[str, ModelOverride] = {} if overrides is None else overrides
        self.http_client = http_client
        self.environ: Mapping[str, str] = os.environ if environ is None else environ
        self.catalog = catalog
        self.builders = builders
        self.finder = finder
        self.streams = streams

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

    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None = None) -> Model:
        target = self.target(model, settings=settings, api_key=api_key)
        try:
            return self.builders[target.provider](target)
        except UserError as error:
            raise ProviderMisconfigured(target.provider, str(error)) from error
