from collections.abc import Mapping
from typing import Final, Protocol

from pydantic import SecretStr
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven.spec import ModelRef, ProviderName, parse_model

PROVIDER_KEY_ENV: Final[Mapping[ProviderName, str]] = {
    ProviderName.OPENAI: "OPENAI_API_KEY",
    ProviderName.ANTHROPIC: "ANTHROPIC_API_KEY",
    ProviderName.GOOGLE: "GOOGLE_API_KEY",
    ProviderName.OPENROUTER: "OPENROUTER_API_KEY",
    ProviderName.TOGETHER: "TOGETHER_API_KEY",
}


class ModelFactory(Protocol):
    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr) -> Model: ...


def model_provider(model: str) -> ProviderName:
    reference: ModelRef = parse_model(model)
    return reference.provider
