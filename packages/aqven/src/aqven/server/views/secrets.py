import asyncio
from collections.abc import Mapping
from typing import Final

from aqven.app.secret_declarations import SecretDeclaration, SecretScope, declared_secrets
from aqven.app.secret_names import ProjectSecretNames, ProviderKeyName
from aqven.ports.settings import ResolvedSecret, SecretSource, SettingsStore, mask_secret, resolve_secret
from aqven.runtime.address import Problem, ResourceModel
from aqven.server.views.common import loaded_project
from aqven.server.workspace import WorkspaceState
from aqven.spec import ProviderName

SECRET_MISSING: Final = "SECRET_MISSING"
SECRETS_PATH: Final = "secrets"


class ProviderKeyStatus(ResourceModel):
    provider: ProviderName
    setting_key: str
    env_var: str
    declared: bool
    source: SecretSource | None
    masked: str | None


class SecretStatus(ResourceModel):
    name: str
    env_var: str
    declared_by: str
    scope: SecretScope
    declared_in: str
    setting_key: str
    source: SecretSource | None
    masked: str | None
    set: bool


async def provider_status(store: SettingsStore, environ: Mapping[str, str], name: ProviderKeyName) -> ProviderKeyStatus:
    resolved = await resolve_secret(store, name.key, name.env_var, environ)
    return ProviderKeyStatus(
        provider=name.provider,
        setting_key=name.key,
        env_var=name.env_var,
        declared=name.declared,
        source=None if resolved is None else resolved.source,
        masked=None if resolved is None else mask_secret(resolved.value.get_secret_value()),
    )


async def provider_key_statuses(
    store: SettingsStore, environ: Mapping[str, str], names: ProjectSecretNames
) -> tuple[ProviderKeyStatus, ...]:
    providers = await asyncio.to_thread(names.providers)
    return tuple([await provider_status(store, environ, name) for name in providers])


def secret_status(declaration: SecretDeclaration, resolved: ResolvedSecret | None) -> SecretStatus:
    return SecretStatus(
        name=declaration.name,
        env_var=declaration.env_var,
        declared_by=declaration.declared_by,
        scope=declaration.scope,
        declared_in=declaration.declared_in,
        setting_key=declaration.setting_key,
        source=None if resolved is None else resolved.source,
        masked=None if resolved is None else mask_secret(resolved.value.get_secret_value()),
        set=resolved is not None,
    )


def missing_warning(declaration: SecretDeclaration) -> Problem:
    message = (
        f"{declaration.scope} {declaration.declared_by} needs secret {declaration.name} "
        f"from {declaration.env_var}, which is set neither in the project .env file nor in the environment"
    )
    return Problem(path=(SECRETS_PATH, declaration.env_var), code=SECRET_MISSING, message=message)


async def missing_secret_warnings(
    store: SettingsStore, environ: Mapping[str, str], state: WorkspaceState
) -> tuple[Problem, ...]:
    declarations = declared_secrets(loaded_project(state), ProjectSecretNames(state.root))
    found = [await _unset(store, environ, item) for item in declarations]
    return tuple(warning for warning in found if warning is not None)


async def _unset(store: SettingsStore, environ: Mapping[str, str], declaration: SecretDeclaration) -> Problem | None:
    resolved = await resolve_secret(store, declaration.setting_key, declaration.env_var, environ)
    return None if resolved is not None else missing_warning(declaration)
