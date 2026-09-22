from dataclasses import dataclass, replace
from typing import Final, Literal

from pydantic_ai.models.openrouter import OpenRouterModelSettings, OpenRouterProviderConfig

type DataCollection = Literal["allow", "deny"]

OPENROUTER_BASE_URL: Final = "https://openrouter.ai/api/v1"


@dataclass(frozen=True, slots=True)
class OpenRouterRouting:
    data_collection: DataCollection | None = None
    zdr: bool | None = None

    def without_zdr(self) -> OpenRouterRouting:
        return replace(self, zdr=False)

    def provider_config(self) -> OpenRouterProviderConfig:
        config = OpenRouterProviderConfig()
        if self.data_collection is not None:
            config["data_collection"] = self.data_collection
        if self.zdr is not None:
            config["zdr"] = self.zdr
        return config

    def settings(self) -> OpenRouterModelSettings:
        return OpenRouterModelSettings(openrouter_provider=self.provider_config())


PRIVATE_ROUTING: Final = OpenRouterRouting(data_collection="deny", zdr=True)
