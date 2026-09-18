import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Final

from aqven.spec.agent import CapabilityOverride
from aqven.spec.names import MODEL_PATTERN, Modality, ModelFamily, ProviderName
from aqven.spec.project import ProviderCapabilitiesSpec

MODEL: Final = re.compile(MODEL_PATTERN)
PROVIDER_SEPARATOR: Final = ":"
VENDOR_SEPARATOR: Final = "/"

TEXT_ONLY: Final = frozenset({Modality.TEXT})
DOCUMENT_VISION: Final = frozenset({Modality.TEXT, Modality.IMAGE, Modality.DOCUMENT})
TEXT_AND_IMAGE: Final = frozenset({Modality.TEXT, Modality.IMAGE})


class ModelSyntaxError(ValueError):
    def __init__(self, text: str) -> None:
        super().__init__(f"model string {text!r} does not match {MODEL_PATTERN}")
        self.text = text


@dataclass(frozen=True, slots=True)
class ModelRef:
    provider: ProviderName
    name: str


@dataclass(frozen=True, slots=True)
class ModelProfile:
    family: ModelFamily
    input: frozenset[Modality]
    output: frozenset[Modality]
    strict: bool
    verified: bool


type ProfileRow = tuple[str, ModelFamily, frozenset[Modality], frozenset[Modality], bool]

VERIFIED_PROVIDER: Final = "openrouter:"
ALL_INPUTS: Final = frozenset(Modality)
QWEN_INPUTS: Final = frozenset({Modality.TEXT, Modality.IMAGE, Modality.VIDEO})

PROFILE_ROWS: Final[tuple[ProfileRow, ...]] = (
    ("openai:gpt-5.6-terra", ModelFamily.OPENAI, DOCUMENT_VISION, TEXT_ONLY, True),
    ("openai:gpt-5.4-mini", ModelFamily.OPENAI, DOCUMENT_VISION, TEXT_ONLY, True),
    ("openrouter:openai/gpt-5.6-terra", ModelFamily.OPENAI, DOCUMENT_VISION, TEXT_ONLY, True),
    ("anthropic:claude-sonnet-5", ModelFamily.ANTHROPIC, DOCUMENT_VISION, TEXT_ONLY, True),
    ("anthropic:claude-opus-5", ModelFamily.ANTHROPIC, DOCUMENT_VISION, TEXT_ONLY, True),
    ("google:gemini-3.8-flash", ModelFamily.GOOGLE, ALL_INPUTS, TEXT_ONLY, True),
    ("google:gemini-3-pro-image", ModelFamily.GOOGLE, TEXT_AND_IMAGE, TEXT_AND_IMAGE, False),
    ("openrouter:openai/gpt-5.4-image-2", ModelFamily.OPENAI, DOCUMENT_VISION, TEXT_AND_IMAGE, False),
    ("openrouter:openai/gpt-5-image-mini", ModelFamily.OPENAI, DOCUMENT_VISION, TEXT_AND_IMAGE, True),
    ("openrouter:google/gemini-2.5-flash-lite", ModelFamily.GOOGLE, ALL_INPUTS, TEXT_ONLY, True),
    ("openrouter:google/gemini-3.1-flash-lite-image", ModelFamily.GOOGLE, TEXT_AND_IMAGE, TEXT_AND_IMAGE, False),
    ("openrouter:anthropic/claude-sonnet-5", ModelFamily.ANTHROPIC, DOCUMENT_VISION, TEXT_ONLY, False),
    ("openrouter:x-ai/grok-4.6", ModelFamily.XAI, DOCUMENT_VISION, TEXT_ONLY, False),
    ("openrouter:deepseek/deepseek-v4-pro-0813", ModelFamily.DEEPSEEK, TEXT_ONLY, TEXT_ONLY, False),
    ("openrouter:qwen/qwen3.8-max-0902", ModelFamily.QWEN, QWEN_INPUTS, TEXT_ONLY, False),
    ("together:meta-llama/Llama-3.3-70B-Instruct-Turbo", ModelFamily.META, TEXT_ONLY, TEXT_ONLY, False),
)

MODEL_PROFILES: Final[Mapping[str, ModelProfile]] = {
    model: ModelProfile(family, inputs, outputs, strict, model.startswith(VERIFIED_PROVIDER))
    for model, family, inputs, outputs, strict in PROFILE_ROWS
}

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


def resolve_profile(
    model: str, override: CapabilityOverride | None, declared: ProviderCapabilitiesSpec | None = None
) -> ModelProfile:
    base = _declared_profile(MODEL_PROFILES.get(model) or _default_profile(model), declared)
    if override is None:
        return base
    return replace(
        base,
        family=override.family or base.family,
        input=_modalities(override.input, base.input),
        output=_modalities(override.output, base.output),
        strict=base.strict if override.strict is None else override.strict,
    )


def _declared_profile(base: ModelProfile, declared: ProviderCapabilitiesSpec | None) -> ModelProfile:
    if declared is None:
        return base
    inputs = _modalities(declared.input, base.input)
    return replace(base, input=inputs, output=_modalities(declared.output, base.output))


def _default_profile(model: str) -> ModelProfile:
    provider, _, name = model.partition(PROVIDER_SEPARATOR)
    vendor = name.partition(VENDOR_SEPARATOR)[0]
    family = PROVIDER_FAMILIES.get(provider) or VENDOR_FAMILIES.get(vendor, ModelFamily.OTHER)
    return ModelProfile(family, TEXT_ONLY, TEXT_ONLY, strict=False, verified=False)


def _modalities(declared: Sequence[Modality] | None, base: frozenset[Modality]) -> frozenset[Modality]:
    return base if declared is None else frozenset(declared)
