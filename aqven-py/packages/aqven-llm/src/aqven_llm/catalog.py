from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from aqven_llm.errors import UnknownProvider

PROVIDER_SEPARATOR: Final = ":"


@dataclass(frozen=True, slots=True)
class ClassRef:
    module: str
    name: str

    @property
    def qualified(self) -> str:
        return f"{self.module}.{self.name}"


@dataclass(frozen=True, slots=True)
class ProviderKey:
    env: tuple[str, ...] = ()
    required: bool = True

    @property
    def primary(self) -> str | None:
        return self.env[0] if self.env else None


@dataclass(frozen=True, slots=True)
class ProviderExtra:
    name: str
    module: str


@dataclass(frozen=True, slots=True)
class ProviderEntry:
    name: str
    model_class: ClassRef
    key: ProviderKey
    extra: ProviderExtra | None = None


OPENAI_MODELS: Final = "pydantic_ai.models.openai"
OPENAI_CHAT: Final = ClassRef(OPENAI_MODELS, "OpenAIChatModel")
OPENAI_RESPONSES: Final = ClassRef(OPENAI_MODELS, "OpenAIResponsesModel")
NO_KEY: Final = ProviderKey(required=False)


def key(*env: str) -> ProviderKey:
    return ProviderKey(env=env)


def optional_key(*env: str) -> ProviderKey:
    return ProviderKey(env=env, required=False)


def extra(name: str, module: str) -> ProviderExtra:
    return ProviderExtra(name=name, module=module)


ENTRIES: Final[tuple[ProviderEntry, ...]] = (
    ProviderEntry("openai", OPENAI_RESPONSES, key("OPENAI_API_KEY")),
    ProviderEntry("openai-chat", OPENAI_CHAT, key("OPENAI_API_KEY")),
    ProviderEntry("openai-responses", OPENAI_RESPONSES, key("OPENAI_API_KEY")),
    ProviderEntry(
        "openrouter", ClassRef("pydantic_ai.models.openrouter", "OpenRouterModel"), key("OPENROUTER_API_KEY")
    ),
    ProviderEntry("deepseek", OPENAI_CHAT, key("DEEPSEEK_API_KEY")),
    ProviderEntry("together", OPENAI_CHAT, key("TOGETHER_API_KEY")),
    ProviderEntry("fireworks", OPENAI_CHAT, key("FIREWORKS_API_KEY")),
    ProviderEntry("moonshotai", OPENAI_CHAT, key("MOONSHOTAI_API_KEY")),
    ProviderEntry("nebius", OPENAI_CHAT, key("NEBIUS_API_KEY")),
    ProviderEntry("ovhcloud", OPENAI_CHAT, key("OVHCLOUD_API_KEY")),
    ProviderEntry("alibaba", OPENAI_CHAT, key("ALIBABA_API_KEY", "DASHSCOPE_API_KEY")),
    ProviderEntry("sambanova", OPENAI_CHAT, key("SAMBANOVA_API_KEY")),
    ProviderEntry("vercel", OPENAI_CHAT, key("VERCEL_AI_GATEWAY_API_KEY")),
    ProviderEntry("heroku", OPENAI_CHAT, key("HEROKU_INFERENCE_KEY")),
    ProviderEntry("litellm", OPENAI_CHAT, NO_KEY),
    ProviderEntry("vllm", OPENAI_CHAT, optional_key("VLLM_API_KEY")),
    ProviderEntry("ollama", ClassRef("pydantic_ai.models.ollama", "OllamaModel"), optional_key("OLLAMA_API_KEY")),
    ProviderEntry("cerebras", ClassRef("pydantic_ai.models.cerebras", "CerebrasModel"), key("CEREBRAS_API_KEY")),
    ProviderEntry("crusoe", ClassRef("pydantic_ai.models.crusoe", "CrusoeModel"), key("CRUSOE_API_KEY")),
    ProviderEntry("zai", ClassRef("pydantic_ai.models.zai", "ZaiModel"), key("ZAI_API_KEY")),
    ProviderEntry(
        "anthropic",
        ClassRef("pydantic_ai.models.anthropic", "AnthropicModel"),
        key("ANTHROPIC_API_KEY"),
        extra("anthropic", "anthropic"),
    ),
    ProviderEntry(
        "google",
        ClassRef("pydantic_ai.models.google", "GoogleModel"),
        key("GOOGLE_API_KEY", "GEMINI_API_KEY"),
        extra("google", "google.genai"),
    ),
    ProviderEntry("groq", ClassRef("pydantic_ai.models.groq", "GroqModel"), key("GROQ_API_KEY"), extra("groq", "groq")),
    ProviderEntry(
        "mistral",
        ClassRef("pydantic_ai.models.mistral", "MistralModel"),
        key("MISTRAL_API_KEY"),
        extra("mistral", "mistralai"),
    ),
    ProviderEntry(
        "cohere", ClassRef("pydantic_ai.models.cohere", "CohereModel"), key("CO_API_KEY"), extra("cohere", "cohere")
    ),
    ProviderEntry(
        "bedrock", ClassRef("pydantic_ai.models.bedrock", "BedrockConverseModel"), NO_KEY, extra("bedrock", "boto3")
    ),
    ProviderEntry(
        "huggingface",
        ClassRef("pydantic_ai.models.huggingface", "HuggingFaceModel"),
        key("HF_TOKEN"),
        extra("huggingface", "huggingface_hub"),
    ),
    ProviderEntry("xai", ClassRef("pydantic_ai.models.xai", "XaiModel"), key("XAI_API_KEY"), extra("xai", "xai_sdk")),
)

PROVIDERS: Final[Mapping[str, ProviderEntry]] = {entry.name: entry for entry in ENTRIES}


def split_model(model: str, catalog: Mapping[str, ProviderEntry] = PROVIDERS) -> tuple[ProviderEntry, str]:
    provider, separator, name = model.partition(PROVIDER_SEPARATOR)
    entry = catalog.get(provider)
    if not separator or not name or entry is None:
        raise UnknownProvider(model, tuple(catalog))
    return entry, name


def provider_entry(provider: str, catalog: Mapping[str, ProviderEntry] = PROVIDERS) -> ProviderEntry | None:
    return catalog.get(provider)
