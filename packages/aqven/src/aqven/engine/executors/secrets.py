from collections.abc import Sequence
from typing import Final

from aqven.engine.runtime import ToolServices
from aqven.ports.settings import SECRET_SETTING_PREFIX, SettingKey, resolve_secret, setting_key
from aqven.spec import SecretBinding, SecretHeader

SECRET_REF_PREFIX: Final = "ref:env/"


def secret_env_name(ref: str) -> str:
    return ref.removeprefix(SECRET_REF_PREFIX)


def secret_setting(env_name: str) -> SettingKey:
    return setting_key(f"{SECRET_SETTING_PREFIX}{env_name.lower()}")


async def resolve_ref(services: ToolServices, ref: str) -> str | None:
    env_name = secret_env_name(ref)
    if services.settings is None:
        return services.environ.get(env_name) or None
    found = await resolve_secret(services.settings, secret_setting(env_name), env_name, services.environ)
    return None if found is None else found.value.get_secret_value()


async def tool_secrets(services: ToolServices, bindings: Sequence[SecretBinding]) -> dict[str, str]:
    resolved = {binding.name: await resolve_ref(services, binding.ref) for binding in bindings}
    return {name: value for name, value in resolved.items() if value is not None}


async def header_values(services: ToolServices, headers: Sequence[SecretHeader]) -> dict[str, str]:
    resolved = {header.name: await resolve_ref(services, header.value) for header in headers}
    return {name: value for name, value in resolved.items() if value is not None}
