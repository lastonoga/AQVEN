import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Final, Literal, NewType, Protocol

from pydantic import AwareDatetime, Field, JsonValue, SecretStr

from aqven.runtime.address import RequestModel, ResourceModel
from aqven.spec import ProviderName

SettingKey = NewType("SettingKey", str)
EnvName = NewType("EnvName", str)

SETTING_KEY_PATTERN: Final = r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$"
SETTING_KEY: Final = re.compile(SETTING_KEY_PATTERN)
ENV_NAME_PATTERN: Final = r"^[A-Z][A-Z0-9_]*$"
ENV_NAME: Final = re.compile(ENV_NAME_PATTERN)
SECRET_MASK: Final = "••••"
SECRET_VISIBLE_SUFFIX: Final = 4
SECRET_MIN_LENGTH_FOR_SUFFIX: Final = 12
PROJECT_ENV_FILE: Final = ".env"
SECRET_SETTING_PREFIX: Final = "secrets."
SECRET_FORBIDDEN_CHARACTERS: Final = frozenset("\x00\r\n")

type SettingScope = Literal["studio", "project"]
type SettingKind = Literal["secret", "value"]
type SecretSource = Literal["environment", "dotenv"]
type SettingKeyText = Annotated[SettingKey, Field(pattern=SETTING_KEY_PATTERN)]
type SettingRejectionCode = Literal[
    "SECRET_SCOPE_UNSUPPORTED",
    "NOT_A_SECRET_KEY",
    "SECRET_KEY_NEEDS_SECRET",
    "SECRET_VALUE_INVALID",
]

SECRET_SCOPE: Final[SettingScope] = "project"


class InvalidSettingKey(ValueError):
    def __init__(self, key: str) -> None:
        super().__init__(f"setting key {key!r} does not match {SETTING_KEY_PATTERN}")
        self.key = key


class SettingRejected(ValueError):
    def __init__(self, code: SettingRejectionCode, key: SettingKey, message: str, hint: str) -> None:
        super().__init__(message)
        self.code: SettingRejectionCode = code
        self.key = key
        self.hint = hint


def setting_key(text: str) -> SettingKey:
    if SETTING_KEY.fullmatch(text) is None:
        raise InvalidSettingKey(text)
    return SettingKey(text)


def provider_key_setting(provider: ProviderName) -> SettingKey:
    return setting_key(f"providers.{provider}.api_key")


def env_name(text: str) -> EnvName | None:
    if ENV_NAME.fullmatch(text) is None:
        return None
    return EnvName(text)


def env_secret_setting(name: EnvName) -> SettingKey:
    return setting_key(f"{SECRET_SETTING_PREFIX}{name.lower()}")


def project_env_file(root: Path) -> Path:
    return root / PROJECT_ENV_FILE


def mask_secret(secret: str) -> str:
    if len(secret) < SECRET_MIN_LENGTH_FOR_SUFFIX:
        return SECRET_MASK
    return f"{SECRET_MASK}{secret[-SECRET_VISIBLE_SUFFIX:]}"


def secret_outside_project(key: SettingKey, scope: SettingScope) -> SettingRejected:
    return SettingRejected(
        "SECRET_SCOPE_UNSUPPORTED",
        key,
        f"secret {key} cannot be stored in scope {scope}: provider keys and secrets live in the project .env file",
        f"write {key} to scope {SECRET_SCOPE}",
    )


def not_a_secret_key(key: SettingKey) -> SettingRejected:
    return SettingRejected(
        "NOT_A_SECRET_KEY",
        key,
        f"setting {key} has no environment variable name, so it cannot hold a secret",
        f"use providers.<provider>.api_key or {SECRET_SETTING_PREFIX}<environment_variable_name>",
    )


def secret_key_needs_secret(key: SettingKey) -> SettingRejected:
    return SettingRejected(
        "SECRET_KEY_NEEDS_SECRET",
        key,
        f"setting {key} names a secret in the project .env file and cannot hold a plain value",
        'send {"kind": "secret", "secret": "..."}',
    )


def invalid_secret_value(key: SettingKey) -> SettingRejected:
    return SettingRejected(
        "SECRET_VALUE_INVALID",
        key,
        f"secret for {key} contains a line break or NUL character",
        "remove line breaks and NUL characters from the secret",
    )


class SettingView(ResourceModel):
    scope: SettingScope
    key: SettingKeyText
    kind: SettingKind
    value: JsonValue = None
    masked: str | None = None
    env_var: str | None = None
    updated_at: AwareDatetime


class ValueSettingWrite(RequestModel):
    kind: Literal["value"] = "value"
    value: JsonValue


class SecretSettingWrite(RequestModel):
    kind: Literal["secret"] = "secret"
    secret: SecretStr


type SettingWrite = Annotated[ValueSettingWrite | SecretSettingWrite, Field(discriminator="kind")]


@dataclass(frozen=True, slots=True)
class ResolvedSecret:
    value: SecretStr
    source: SecretSource


class SettingsStore(Protocol):
    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]: ...

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None: ...

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView: ...

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView: ...

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool: ...

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None: ...


def resolved_of(from_dotenv: str, from_environment: str) -> ResolvedSecret | None:
    if from_environment and from_environment != from_dotenv:
        return ResolvedSecret(SecretStr(from_environment), "environment")
    if not from_dotenv:
        return None
    return ResolvedSecret(SecretStr(from_dotenv), "dotenv")


async def resolve_secret(
    store: SettingsStore,
    key: SettingKey,
    env_var: str | None,
    environ: Mapping[str, str],
) -> ResolvedSecret | None:
    stored = await store.read_secret(SECRET_SCOPE, key)
    from_dotenv = "" if stored is None else stored.get_secret_value()
    return resolved_of(from_dotenv, "" if env_var is None else environ.get(env_var, ""))
