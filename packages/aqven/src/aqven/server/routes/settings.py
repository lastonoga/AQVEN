import asyncio
from collections.abc import Mapping
from typing import Annotated, Final

from fastapi import APIRouter, Body, Path

from aqven.app.secret_declarations import SecretDeclaration, declared_secrets
from aqven.app.secret_names import ProjectSecretNames
from aqven.ports.identity import ASSIGNEE_SETTING, AssigneeSource, local_user
from aqven.ports.settings import (
    SECRET_MASK,
    SETTING_KEY_PATTERN,
    SecretSettingWrite,
    SettingKey,
    SettingRejected,
    SettingScope,
    SettingsStore,
    SettingView,
    SettingWrite,
    resolve_secret,
)
from aqven.runtime.address import Problem, ResourceModel
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES, ApiFailure, not_found
from aqven.server.views.common import loaded_project
from aqven.server.views.secrets import ProviderKeyStatus, SecretStatus, provider_key_statuses, secret_status

SECRETS_REST_ONLY: Final = "secrets stay outside MCP"

type SettingKeyPath = Annotated[str, Path(pattern=SETTING_KEY_PATTERN)]


class LocalUserView(ResourceModel):
    assignee: str
    source: AssigneeSource
    setting_key: str


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


async def declaration_status(
    store: SettingsStore, environ: Mapping[str, str], declaration: SecretDeclaration
) -> SecretStatus:
    resolved = await resolve_secret(store, declaration.setting_key, declaration.env_var, environ)
    return secret_status(declaration, resolved)


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
        return await provider_key_statuses(store, context.environ, names)

    @router.get("/secrets", operation_id="secret_list", openapi_extra=rest_only(SECRETS_REST_ONLY))
    async def list_secrets() -> tuple[SecretStatus, ...]:
        project = loaded_project(await context.workspace.state())
        declarations = await asyncio.to_thread(declared_secrets, project, names)
        return tuple([await declaration_status(store, context.environ, item) for item in declarations])

    @router.get("/user", operation_id="local_user_get", openapi_extra=rest_only("local user identity"))
    async def get_local_user() -> LocalUserView:
        user = await local_user(store, context.environ)
        return LocalUserView(assignee=user.assignee, source=user.source, setting_key=ASSIGNEE_SETTING)

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
