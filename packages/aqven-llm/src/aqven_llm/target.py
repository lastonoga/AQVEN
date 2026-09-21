from dataclasses import dataclass

import httpx2
from pydantic import SecretStr
from pydantic_ai.settings import ModelSettings

from aqven_llm.media import TEXT_ONLY, MediaOutput
from aqven_llm.routing import OpenRouterRouting


@dataclass(frozen=True, slots=True)
class ModelTarget:
    provider: str
    name: str
    api_key: SecretStr | None
    http_client: httpx2.AsyncClient
    settings: ModelSettings | None = None
    base_url: str | None = None
    routing: OpenRouterRouting | None = None
    media: MediaOutput = TEXT_ONLY
