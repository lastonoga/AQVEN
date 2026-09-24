import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from aqven.spec.names import MODEL_PATTERN, ModelFamily, ProviderName

MODEL: Final = re.compile(MODEL_PATTERN)
PROVIDER_SEPARATOR: Final = ":"
VENDOR_SEPARATOR: Final = "/"


class ModelSyntaxError(ValueError):
    def __init__(self, text: str) -> None:
        super().__init__(f"model string {text!r} does not match {MODEL_PATTERN}")
        self.text = text


@dataclass(frozen=True, slots=True)
class ModelRef:
    provider: ProviderName
    name: str


VENDOR_FAMILIES: Final[Mapping[str, ModelFamily]] = {
    "openai": ModelFamily.OPENAI,
    "anthropic": ModelFamily.ANTHROPIC,
    "google": ModelFamily.GOOGLE,
    "deepseek": ModelFamily.DEEPSEEK,
    "deepseek-ai": ModelFamily.DEEPSEEK,
    "qwen": ModelFamily.QWEN,
    "Qwen": ModelFamily.QWEN,
    "x-ai": ModelFamily.XAI,
    "meta-llama": ModelFamily.META,
    "moonshotai": ModelFamily.MOONSHOT,
    "z-ai": ModelFamily.ZHIPU,
    "mistralai": ModelFamily.MISTRAL,
}

PROVIDER_FAMILIES: Final[Mapping[str, ModelFamily]] = {
    "openai": ModelFamily.OPENAI,
    "anthropic": ModelFamily.ANTHROPIC,
    "google": ModelFamily.GOOGLE,
}


def parse_model(text: str) -> ModelRef:
    if MODEL.fullmatch(text) is None:
        raise ModelSyntaxError(text)
    provider, _, name = text.partition(PROVIDER_SEPARATOR)
    return ModelRef(ProviderName(provider), name)


def model_family(model: str) -> ModelFamily:
    provider, _, name = model.partition(PROVIDER_SEPARATOR)
    vendor = name.partition(VENDOR_SEPARATOR)[0]
    return PROVIDER_FAMILIES.get(provider) or VENDOR_FAMILIES.get(vendor, ModelFamily.OTHER)
