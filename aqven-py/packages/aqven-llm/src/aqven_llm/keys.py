from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol

from pydantic import SecretStr

from aqven_llm.catalog import PROVIDERS, ProviderEntry, split_model
from aqven_llm.errors import MissingProviderKey


class ProviderKeyStore(Protocol):
    async def provider_key(self, provider: str) -> SecretStr | None: ...


def environment_key(entry: ProviderEntry, environ: Mapping[str, str]) -> SecretStr | None:
    value = next((environ[name] for name in entry.key.env if environ.get(name)), "")
    return SecretStr(value) if value else None


def required_key(entry: ProviderEntry, found: SecretStr | None) -> SecretStr | None:
    env_var = entry.key.primary
    if found is not None or not entry.key.required or env_var is None:
        return found
    raise MissingProviderKey(entry.name, env_var)


def provider_key_env(provider: str, catalog: Mapping[str, ProviderEntry] = PROVIDERS) -> str | None:
    entry = catalog.get(provider)
    return None if entry is None else entry.key.primary


@dataclass(frozen=True, slots=True)
class ProviderKeys:
    environ: Mapping[str, str]
    store: ProviderKeyStore | None = None
    catalog: Mapping[str, ProviderEntry] = field(default_factory=lambda: PROVIDERS)

    async def key(self, model: str) -> SecretStr | None:
        entry, _ = split_model(model, self.catalog)
        stored = None if self.store is None else await self.store.provider_key(entry.name)
        found = stored if stored is not None and stored.get_secret_value() else environment_key(entry, self.environ)
        return required_key(entry, found)
