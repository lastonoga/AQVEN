from collections.abc import Mapping
from typing import Final, Protocol

from pydantic import SecretStr
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven.spec import ModelRef, ProviderName, parse_model
from aqven_llm import PROVIDERS, provider_key_env

PROVIDER_KEY_ENV: Final[Mapping[ProviderName, str]] = {
    ProviderName("openai"): "OPENAI_API_KEY",
    ProviderName("anthropic"): "ANTHROPIC_API_KEY",
    ProviderName("google"): "GOOGLE_API_KEY",
    ProviderName("openrouter"): "OPENROUTER_API_KEY",
    ProviderName("together"): "TOGETHER_API_KEY",
}


def provider_env_var(provider: ProviderName) -> str | None:
    return PROVIDER_KEY_ENV.get(provider) or provider_key_env(provider)


def provider_key_variables() -> frozenset[str]:
    catalog = (name for entry in PROVIDERS.values() for name in entry.key.env)
    return frozenset((*PROVIDER_KEY_ENV.values(), *catalog))


class ModelFactory(Protocol):
    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None) -> Model: ...


def model_provider(model: str) -> ProviderName:
    reference: ModelRef = parse_model(model)
    return reference.provider
