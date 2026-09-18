from typing import Final, Protocol

from pydantic import JsonValue

from aqven.chat.errors import ChatFailure
from aqven.ports.chat import AgentBackendKind
from aqven.ports.settings import SettingKey, SettingScope, SettingView, setting_key
from aqven.runtime.address import RequestModel, ResourceModel

BACKEND_KEY: Final[SettingKey] = setting_key("chat.backend")
BACKEND_SCOPE: Final[SettingScope] = "project"


class BackendSettingValues(Protocol):
    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None: ...

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView: ...


class ChatBackendChoice(ResourceModel):
    backend: AgentBackendKind


class ChatBackendWrite(RequestModel):
    backend: AgentBackendKind


class BackendSelection:
    def __init__(self, values: BackendSettingValues) -> None:
        self._values = values

    async def get(self) -> AgentBackendKind:
        setting = await self._values.get_setting(BACKEND_SCOPE, BACKEND_KEY)
        if setting is None:
            return "claude"
        value = setting.value
        if value == "claude":
            return "claude"
        if value == "codex":
            return "codex"
        raise ChatFailure("CHAT_STATE_CONFLICT", "project setting chat.backend must be 'claude' or 'codex'")

    async def set(self, backend: AgentBackendKind) -> AgentBackendKind:
        await self._values.set_value(BACKEND_SCOPE, BACKEND_KEY, backend)
        return backend
