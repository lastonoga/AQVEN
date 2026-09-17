from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Annotated, Final

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from aqven.loader import PROJECT_FILE
from aqven.loader.strict_yaml import read_strict_yaml
from aqven.ports.models import PROVIDER_KEY_ENV
from aqven.ports.settings import (
    SECRET_SETTING_PREFIX,
    EnvName,
    SettingKey,
    env_name,
    env_secret_setting,
    provider_key_setting,
)
from aqven.spec import SECRET_REF_PATTERN, ProviderName

SECRET_REF_PREFIX: Final = "ref:env/"
PROVIDERS_KEY: Final = "providers"

type FileStamp = tuple[int, int]
type ProviderRefs = Mapping[ProviderName, EnvName]

NO_REFS: Final[ProviderRefs] = {}


class ProviderKeyRef(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)
    id: ProviderName
    api_key: Annotated[str, Field(pattern=SECRET_REF_PATTERN)]


@dataclass(frozen=True, slots=True)
class ProviderKeyName:
    provider: ProviderName
    key: SettingKey
    env_var: EnvName
    declared: bool


def provider_ref(raw: JsonValue) -> tuple[ProviderName, EnvName] | None:
    try:
        parsed = ProviderKeyRef.model_validate(raw)
    except ValidationError:
        return None
    return parsed.id, EnvName(parsed.api_key.removeprefix(SECRET_REF_PREFIX))


def declared_provider_refs(text: str) -> ProviderRefs:
    document, _ = read_strict_yaml(text, PROJECT_FILE)
    data = None if document is None else document.data
    providers = data.get(PROVIDERS_KEY) if isinstance(data, dict) else None
    if not isinstance(providers, list):
        return {}
    return dict(ref for ref in map(provider_ref, providers) if ref is not None)


def file_stamp(path: Path) -> FileStamp | None:
    try:
        status = path.stat()
    except OSError:
        return None
    return status.st_mtime_ns, status.st_size


def default_env_names() -> Mapping[ProviderName, EnvName]:
    return {provider: EnvName(name) for provider, name in PROVIDER_KEY_ENV.items()}


@dataclass(slots=True)
class ProjectSecretNames:
    root: Path
    defaults: Mapping[ProviderName, EnvName] = field(default_factory=default_env_names)
    _stamp: FileStamp | None = None
    _refs: ProviderRefs = field(default_factory=dict[ProviderName, EnvName])
    _lock: Lock = field(default_factory=Lock)

    def declared(self) -> ProviderRefs:
        path = self.root / PROJECT_FILE
        stamp = file_stamp(path)
        with self._lock:
            if stamp == self._stamp:
                return self._refs
            refs = NO_REFS if stamp is None else declared_provider_refs(path.read_text(encoding="utf-8"))
            self._stamp, self._refs = stamp, refs
            return refs

    def providers(self) -> tuple[ProviderKeyName, ...]:
        declared = self.declared()
        known = (*self.defaults, *(provider for provider in declared if provider not in self.defaults))
        return tuple(self._provider_name(provider, declared) for provider in known)

    def provider_env_var(self, provider: ProviderName) -> EnvName | None:
        return self.declared().get(provider) or self.defaults.get(provider)

    def env_name(self, key: SettingKey) -> EnvName | None:
        by_key = {name.key: name.env_var for name in self.providers()}
        if key in by_key:
            return by_key[key]
        if not key.startswith(SECRET_SETTING_PREFIX):
            return None
        return env_name(key.removeprefix(SECRET_SETTING_PREFIX).upper())

    def setting_key(self, name: EnvName) -> SettingKey:
        by_env = {provider.env_var: provider.key for provider in reversed(self.providers())}
        return by_env.get(name) or env_secret_setting(name)

    def _provider_name(self, provider: ProviderName, declared: ProviderRefs) -> ProviderKeyName:
        env_var = declared.get(provider) or self.defaults[provider]
        return ProviderKeyName(provider, provider_key_setting(provider), env_var, provider in declared)
