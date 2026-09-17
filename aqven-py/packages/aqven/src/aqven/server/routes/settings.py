import asyncio
from collections.abc import Mapping
from typing import Annotated, Final

from fastapi import APIRouter, Body, Path

from aqven.app.secret_names import ProjectSecretNames, ProviderKeyName
from aqven.ports.settings import (
    SECRET_MASK,
    SETTING_KEY_PATTERN,
    SecretSettingWrite,
    SecretSource,
    SettingKey,
    SettingRejected,
    SettingScope,
    SettingsStore,
    SettingView,
    SettingWrite,
    mask_secret,
    resolve_secret,
)
from aqven.runtime.address import Problem, ResourceModel
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES, ApiFailure, not_found
from aqven.spec import ProviderName

SECRETS_REST_ONLY: Final = "secrets stay outside MCP"

type SettingKeyPath = Annotated[str, Path(pattern=SETTING_KEY_PATTERN)]


class ProviderKeyStatus(ResourceModel):
    provider: ProviderName
    setting_key: str
    env_var: str
    declared: bool
    source: SecretSource | None
    masked: str | None


class SettingDeleted(ResourceModel):
    scope: SettingScope
    key: str
    deleted: bool


def public_view(view: SettingView) -> SettingView:
    if view.kind == "value":
        return view
    return view.model_copy(update={"value": None, "masked": view.masked or SECRET_MASK})


def rejected(error: SettingRejected) -> ApiFailure:
    problem = Problem(path=(error.key,), code=error.code, message=error.hint)
    return ApiFailure("REQUEST_INVALID", f"{error}; fix: {error.hint}", problems=(problem,))


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


async def write_setting(store: SettingsStore, scope: SettingScope, key: SettingKey, write: SettingWrite) -> SettingView:
    if isinstance(write, SecretSettingWrite):
        return await store.set_secret(scope, key, write.secret)
    return await store.set_value(scope, key, write.value)


def build_settings_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api/settings", responses=ERROR_RESPONSES)
    store = context.settings
    names = ProjectSecretNames(context.workspace.root)

    @router.get("/providers", operation_id="provider_keys", openapi_extra=rest_only(SECRETS_REST_ONLY))
    async def provider_keys() -> tuple[ProviderKeyStatus, ...]:
        providers = await asyncio.to_thread(names.providers)
        return tuple([await provider_status(store, context.environ, name) for name in providers])

    @router.get("/{scope}", operation_id="setting_list", openapi_extra=rest_only(SECRETS_REST_ONLY))
    async def list_settings(scope: SettingScope) -> tuple[SettingView, ...]:
        return tuple(public_view(view) for view in await store.list_settings(scope))

    @router.get("/{scope}/{key}", operation_id="setting_get", openapi_extra=rest_only(SECRETS_REST_ONLY))
    async def get_setting(scope: SettingScope, key: SettingKeyPath) -> SettingView:
        view = await store.get_setting(scope, SettingKey(key))
        if view is None:
            raise not_found(f"setting {key} not found in scope {scope}")
        return public_view(view)

    @router.put("/{scope}/{key}", operation_id="setting_put", openapi_extra=rest_only(SECRETS_REST_ONLY))
    async def put_setting(
        scope: SettingScope,
        key: SettingKeyPath,
        write: Annotated[SettingWrite, Body()],
    ) -> SettingView:
        try:
            view = await write_setting(store, scope, SettingKey(key), write)
        except SettingRejected as error:
            raise rejected(error) from None
        return public_view(view)

    @router.delete("/{scope}/{key}", operation_id="setting_delete", openapi_extra=rest_only(SECRETS_REST_ONLY))
    async def delete_setting(scope: SettingScope, key: SettingKeyPath) -> SettingDeleted:
        deleted = await store.delete_setting(scope, SettingKey(key))
        return SettingDeleted(scope=scope, key=key, deleted=deleted)

    return router
