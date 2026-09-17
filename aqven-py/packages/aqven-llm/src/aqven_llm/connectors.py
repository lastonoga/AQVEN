import importlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

import httpx2
from openai import AsyncOpenAI
from pydantic import TypeAdapter
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.providers import Provider
from pydantic_ai.providers.alibaba import AlibabaProvider
from pydantic_ai.providers.cerebras import CerebrasProvider
from pydantic_ai.providers.crusoe import CrusoeProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.fireworks import FireworksProvider
from pydantic_ai.providers.heroku import HerokuProvider
from pydantic_ai.providers.litellm import LiteLLMProvider
from pydantic_ai.providers.moonshotai import MoonshotAIProvider
from pydantic_ai.providers.nebius import NebiusProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.providers.ovhcloud import OVHcloudProvider
from pydantic_ai.providers.sambanova import SambaNovaProvider
from pydantic_ai.providers.together import TogetherProvider
from pydantic_ai.providers.vercel import VercelProvider
from pydantic_ai.providers.vllm import VLLMProvider
from pydantic_ai.providers.zai import ZaiProvider
from pydantic_ai.settings import ModelSettings, merge_model_settings

from aqven_llm.media import OpenRouterMediaModel
from aqven_llm.target import ModelTarget

type ModelBuilder = Callable[[ModelTarget], Model]
type OpenAIClientProvider = Provider[AsyncOpenAI]

NO_SDK_RETRIES: Final = 0
SINGLE_ATTEMPT: Final = 1
BEDROCK_SERVICE: Final = "bedrock-runtime"
BEDROCK_RETRIES: Final = {"total_max_attempts": SINGLE_ATTEMPT, "mode": "standard"}
XAI_CHANNEL_OPTIONS: Final = [("grpc.enable_retries", 0)]

EXTRA_BODY: Final[TypeAdapter[dict[str, object]]] = TypeAdapter(dict[str, object])


@dataclass(frozen=True, slots=True)
class DraftArguments:
    api_key: str
    http_client: httpx2.AsyncClient
    base_url: str | None


type DraftProvider = Callable[[DraftArguments], OpenAIClientProvider]
type BoundProvider = Callable[[AsyncOpenAI], OpenAIClientProvider]
type OpenAIModel = Callable[[ModelTarget, OpenAIClientProvider], Model]


def secret(target: ModelTarget) -> str:
    return "" if target.api_key is None else target.api_key.get_secret_value()


def draft_arguments(target: ModelTarget) -> DraftArguments:
    return DraftArguments(api_key=secret(target), http_client=target.http_client, base_url=target.base_url)


def retryless_client(target: ModelTarget, draft: OpenAIClientProvider) -> AsyncOpenAI:
    client = draft.client.with_options(max_retries=NO_SDK_RETRIES)
    if target.base_url is None:
        return client
    return client.with_options(base_url=target.base_url)


@dataclass(frozen=True, slots=True)
class OpenAICompatible:
    draft: DraftProvider
    bind: BoundProvider
    model: OpenAIModel

    def __call__(self, target: ModelTarget) -> Model:
        client = retryless_client(target, self.draft(draft_arguments(target)))
        return self.model(target, self.bind(client))


def chat_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    return OpenAIChatModel(target.name, provider=provider, settings=target.settings)


def responses_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    return OpenAIResponsesModel(target.name, provider=provider, settings=target.settings)


def ollama_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    from pydantic_ai.models.ollama import OllamaModel

    return OllamaModel(target.name, provider=provider, settings=target.settings)


def cerebras_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    from pydantic_ai.models.cerebras import CerebrasModel, CerebrasModelSettings

    settings = None if target.settings is None else CerebrasModelSettings(**target.settings)
    return CerebrasModel(target.name, provider=provider, settings=settings)


def crusoe_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    from pydantic_ai.models.crusoe import CrusoeModel

    return CrusoeModel(target.name, provider=provider, settings=target.settings)


def zai_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    from pydantic_ai.models.zai import ZaiModel, ZaiModelSettings

    settings = None if target.settings is None else ZaiModelSettings(**target.settings)
    return ZaiModel(target.name, provider=provider, settings=settings)


def extra_body_of(settings: ModelSettings | None) -> dict[str, object]:
    if settings is None:
        return {}
    return EXTRA_BODY.validate_python(settings.get("extra_body") or {})


def openrouter_settings(target: ModelTarget) -> ModelSettings | None:
    routed = merge_model_settings(target.settings, None if target.routing is None else target.routing.settings())
    if not target.media.requested:
        return routed
    extra_body = {**extra_body_of(routed), **target.media.extra_body()}
    return merge_model_settings(routed, ModelSettings(extra_body=extra_body))


def openrouter_profile(target: ModelTarget) -> ModelProfile | None:
    if not target.media.image:
        return None
    return ModelProfile(supports_image_output=True)


def openrouter_model(target: ModelTarget, provider: OpenAIClientProvider) -> Model:
    return OpenRouterMediaModel(
        target.name, provider=provider, profile=openrouter_profile(target), settings=openrouter_settings(target)
    )


def anthropic_model(target: ModelTarget) -> Model:
    from anthropic import AsyncAnthropic
    from pydantic_ai.models.anthropic import AnthropicModel
    from pydantic_ai.providers.anthropic import AnthropicProvider

    client = AsyncAnthropic(
        api_key=secret(target),
        base_url=target.base_url,
        max_retries=NO_SDK_RETRIES,
        http_client=target.http_client,
    )
    return AnthropicModel(target.name, provider=AnthropicProvider(anthropic_client=client), settings=target.settings)


def google_model(target: ModelTarget) -> Model:
    from google.genai.types import HttpRetryOptions
    from pydantic_ai.models.google import GoogleModel
    from pydantic_ai.providers.google import GoogleProvider

    provider = GoogleProvider(
        api_key=secret(target),
        http_client=target.http_client,
        base_url=target.base_url,
        retry_options=HttpRetryOptions(attempts=SINGLE_ATTEMPT),
    )
    return GoogleModel(target.name, provider=provider, settings=target.settings)


def groq_model(target: ModelTarget) -> Model:
    from groq import AsyncGroq
    from pydantic_ai.models.groq import GroqModel
    from pydantic_ai.providers.groq import GroqProvider

    client = AsyncGroq(api_key=secret(target), base_url=target.base_url, max_retries=NO_SDK_RETRIES)
    return GroqModel(target.name, provider=GroqProvider(groq_client=client), settings=target.settings)


def mistral_model(target: ModelTarget) -> Model:
    from mistralai.client import Mistral
    from pydantic_ai.models.mistral import MistralModel
    from pydantic_ai.providers.mistral import MistralProvider

    provider = (
        MistralProvider(api_key=secret(target), http_client=target.http_client)
        if target.base_url is None
        else MistralProvider(mistral_client=Mistral(api_key=secret(target), server_url=target.base_url))
    )
    return MistralModel(target.name, provider=provider, settings=target.settings)


def bedrock_model(target: ModelTarget) -> Model:
    from pydantic_ai.models.bedrock import BedrockConverseModel
    from pydantic_ai.providers.bedrock import BedrockProvider

    boto3 = importlib.import_module("boto3")
    config = importlib.import_module("botocore.config").Config(retries=BEDROCK_RETRIES)
    client = boto3.Session().client(BEDROCK_SERVICE, config=config, endpoint_url=target.base_url)
    return BedrockConverseModel(target.name, provider=BedrockProvider(bedrock_client=client), settings=target.settings)


def huggingface_model(target: ModelTarget) -> Model:
    from pydantic_ai.models.huggingface import HuggingFaceModel
    from pydantic_ai.providers.huggingface import HuggingFaceProvider

    provider = (
        HuggingFaceProvider(api_key=secret(target))
        if target.base_url is None
        else HuggingFaceProvider(base_url=target.base_url, api_key=secret(target))
    )
    return HuggingFaceModel(target.name, provider=provider, settings=target.settings)


def xai_model(target: ModelTarget) -> Model:
    from pydantic_ai.models.xai import XaiModel
    from pydantic_ai.providers.xai import XaiProvider

    client = importlib.import_module("xai_sdk").AsyncClient(api_key=secret(target), channel_options=XAI_CHANNEL_OPTIONS)
    return XaiModel(target.name, provider=XaiProvider(xai_client=client), settings=target.settings)


def openai_draft(arguments: DraftArguments) -> OpenAIClientProvider:
    return OpenAIProvider(base_url=arguments.base_url, api_key=arguments.api_key, http_client=arguments.http_client)


def openai_bound(client: AsyncOpenAI) -> OpenAIClientProvider:
    return OpenAIProvider(openai_client=client)


MODEL_BUILDERS: Final[Mapping[str, ModelBuilder]] = {
    "openai": OpenAICompatible(openai_draft, openai_bound, responses_model),
    "openai-chat": OpenAICompatible(openai_draft, openai_bound, chat_model),
    "openai-responses": OpenAICompatible(openai_draft, openai_bound, responses_model),
    "openrouter": OpenAICompatible(
        lambda a: OpenRouterProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: OpenRouterProvider(openai_client=client),
        openrouter_model,
    ),
    "deepseek": OpenAICompatible(
        lambda a: DeepSeekProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: DeepSeekProvider(openai_client=client),
        chat_model,
    ),
    "together": OpenAICompatible(
        lambda a: TogetherProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: TogetherProvider(openai_client=client),
        chat_model,
    ),
    "fireworks": OpenAICompatible(
        lambda a: FireworksProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: FireworksProvider(openai_client=client),
        chat_model,
    ),
    "moonshotai": OpenAICompatible(
        lambda a: MoonshotAIProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: MoonshotAIProvider(openai_client=client),
        chat_model,
    ),
    "nebius": OpenAICompatible(
        lambda a: NebiusProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: NebiusProvider(openai_client=client),
        chat_model,
    ),
    "ovhcloud": OpenAICompatible(
        lambda a: OVHcloudProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: OVHcloudProvider(openai_client=client),
        chat_model,
    ),
    "alibaba": OpenAICompatible(
        lambda a: AlibabaProvider(api_key=a.api_key, base_url=a.base_url, http_client=a.http_client),
        lambda client: AlibabaProvider(openai_client=client),
        chat_model,
    ),
    "sambanova": OpenAICompatible(
        lambda a: SambaNovaProvider(api_key=a.api_key, base_url=a.base_url, http_client=a.http_client),
        lambda client: SambaNovaProvider(openai_client=client),
        chat_model,
    ),
    "vercel": OpenAICompatible(
        lambda a: VercelProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: VercelProvider(openai_client=client),
        chat_model,
    ),
    "heroku": OpenAICompatible(
        lambda a: HerokuProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: HerokuProvider(openai_client=client),
        chat_model,
    ),
    "litellm": OpenAICompatible(
        lambda a: LiteLLMProvider(api_key=a.api_key, api_base=a.base_url, http_client=a.http_client),
        lambda client: LiteLLMProvider(openai_client=client),
        chat_model,
    ),
    "vllm": OpenAICompatible(
        lambda a: VLLMProvider(base_url=a.base_url, api_key=a.api_key or None, http_client=a.http_client),
        lambda client: VLLMProvider(openai_client=client),
        chat_model,
    ),
    "ollama": OpenAICompatible(
        lambda a: OllamaProvider(base_url=a.base_url, api_key=a.api_key or None, http_client=a.http_client),
        lambda client: OllamaProvider(openai_client=client),
        ollama_model,
    ),
    "cerebras": OpenAICompatible(
        lambda a: CerebrasProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: CerebrasProvider(openai_client=client),
        cerebras_model,
    ),
    "crusoe": OpenAICompatible(
        lambda a: CrusoeProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: CrusoeProvider(openai_client=client),
        crusoe_model,
    ),
    "zai": OpenAICompatible(
        lambda a: ZaiProvider(api_key=a.api_key, http_client=a.http_client),
        lambda client: ZaiProvider(openai_client=client),
        zai_model,
    ),
    "anthropic": anthropic_model,
    "google": google_model,
    "groq": groq_model,
    "mistral": mistral_model,
    "bedrock": bedrock_model,
    "huggingface": huggingface_model,
    "xai": xai_model,
}
