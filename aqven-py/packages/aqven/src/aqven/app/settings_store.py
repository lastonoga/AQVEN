import asyncio
import os
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass
from pathlib import Path

from pydantic import JsonValue, SecretStr

from aqven.app.dotenv_secrets import DotenvEntry, DotenvFile, EnvironmentMirror
from aqven.app.locations import ProjectState, StudioState
from aqven.app.secret_names import ProjectSecretNames
from aqven.app.settings_values import SettingValuesDatabase
from aqven.ports.settings import (
    SECRET_FORBIDDEN_CHARACTERS,
    SECRET_SCOPE,
    EnvName,
    SettingKey,
    SettingScope,
    SettingView,
    invalid_secret_value,
    mask_secret,
    not_a_secret_key,
    secret_key_needs_secret,
    secret_outside_project,
)


@dataclass(frozen=True, slots=True)
class ProjectSecrets:
    file: DotenvFile
    names: ProjectSecretNames
    mirror: EnvironmentMirror

    def view(self, key: SettingKey, name: EnvName) -> SettingView | None:
        value = self.file.read(name)
        if value is None:
            return None
        return self._view(key, name, value)

    def views(self) -> tuple[SettingView, ...]:
        return tuple(self._entry_view(entry) for entry in self.file.entries())

    def write(self, key: SettingKey, name: EnvName, secret: SecretStr) -> SettingView:
        previous = self.file.write(name, secret)
        self.mirror.replace(name, previous, secret)
        return self._view(key, name, secret)

    def remove(self, name: EnvName) -> bool:
        previous = self.file.remove(name)
        self.mirror.replace(name, previous, None)
        return previous is not None

    def _entry_view(self, entry: DotenvEntry) -> SettingView:
        return self._view(self.names.setting_key(entry.name), entry.name, entry.value)

    def _view(self, key: SettingKey, name: EnvName, secret: SecretStr) -> SettingView:
        return SettingView(
            scope=SECRET_SCOPE,
            key=key,
            kind="secret",
            masked=mask_secret(secret.get_secret_value()),
            env_var=name,
            updated_at=self.file.modified_at(),
        )


def checked_secret(key: SettingKey, secret: SecretStr) -> SecretStr:
    if SECRET_FORBIDDEN_CHARACTERS.isdisjoint(secret.get_secret_value()):
        return secret
    raise invalid_secret_value(key)


@dataclass(frozen=True, slots=True)
class LocalSettingsStore:
    values: Mapping[SettingScope, SettingValuesDatabase]
    secrets: ProjectSecrets

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        stored = await asyncio.to_thread(self.values[scope].all)
        secrets = await asyncio.to_thread(self.secrets.views) if scope == SECRET_SCOPE else ()
        views = (*(item.view(scope) for item in stored), *secrets)
        return tuple(sorted(views, key=lambda view: view.key))

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        name = await self._env_name(key)
        if name is not None:
            return await self._secret_view(scope, key, name)
        stored = await asyncio.to_thread(self.values[scope].get, key)
        return None if stored is None else stored.view(scope)

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        if await self._env_name(key) is not None:
            raise secret_key_needs_secret(key)
        stored = await asyncio.to_thread(self.values[scope].put, key, value)
        return stored.view(scope)

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        if scope != SECRET_SCOPE:
            raise secret_outside_project(key, scope)
        name = await self._env_name(key)
        if name is None:
            raise not_a_secret_key(key)
        return await asyncio.to_thread(self.secrets.write, key, name, checked_secret(key, secret))

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        name = await self._env_name(key)
        if name is None:
            return await asyncio.to_thread(self.values[scope].delete, key)
        if scope != SECRET_SCOPE:
            return False
        return await asyncio.to_thread(self.secrets.remove, name)

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        name = await self._env_name(key)
        if scope != SECRET_SCOPE or name is None:
            return None
        return await asyncio.to_thread(self.secrets.file.read, name)

    async def _env_name(self, key: SettingKey) -> EnvName | None:
        return await asyncio.to_thread(self.secrets.names.env_name, key)

    async def _secret_view(self, scope: SettingScope, key: SettingKey, name: EnvName) -> SettingView | None:
        if scope != SECRET_SCOPE:
            return None
        return await asyncio.to_thread(self.secrets.view, key, name)


def project_secrets(root: Path, environment: MutableMapping[str, str]) -> ProjectSecrets:
    return ProjectSecrets(DotenvFile(root), ProjectSecretNames(root), EnvironmentMirror(environment))


def open_settings_store(
    project: ProjectState,
    studio: StudioState,
    environment: MutableMapping[str, str] = os.environ,
) -> LocalSettingsStore:
    values: dict[SettingScope, SettingValuesDatabase] = {
        "studio": SettingValuesDatabase.open(studio.database),
        "project": SettingValuesDatabase.open(project.database),
    }
    return LocalSettingsStore(values=values, secrets=project_secrets(project.root, environment))
