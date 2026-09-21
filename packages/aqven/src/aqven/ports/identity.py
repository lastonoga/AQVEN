import getpass
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal

from aqven.ports.settings import SettingKey, SettingScope, SettingsStore, SettingView, setting_key

ASSIGNEE_ME: Final = "me"
ASSIGNEE_SETTING: Final[SettingKey] = setting_key("user.assignee")
USER_SCOPE: Final[SettingScope] = "project"
USER_ENV_NAMES: Final = ("USER", "LOGNAME", "USERNAME")
UNKNOWN_USER: Final = "local"

type AssigneeSource = Literal["setting", "os_user"]


@dataclass(frozen=True, slots=True)
class LocalUser:
    assignee: str
    source: AssigneeSource


def setting_text(view: SettingView | None) -> str | None:
    value = None if view is None else view.value
    return value.strip() if isinstance(value, str) and value.strip() else None


def system_user() -> str:
    try:
        return getpass.getuser().strip() or UNKNOWN_USER
    except OSError, KeyError:
        return UNKNOWN_USER


def os_user_name(environ: Mapping[str, str]) -> str:
    named = (environ.get(name, "").strip() for name in USER_ENV_NAMES)
    return next((name for name in named if name), None) or system_user()


async def local_user(store: SettingsStore | None, environ: Mapping[str, str]) -> LocalUser:
    view = None if store is None else await store.get_setting(USER_SCOPE, ASSIGNEE_SETTING)
    configured = setting_text(view)
    if configured is None:
        return LocalUser(assignee=os_user_name(environ), source="os_user")
    return LocalUser(assignee=configured, source="setting")


def resolved_assignee(assignee: str | None, user: LocalUser) -> str | None:
    return user.assignee if assignee == ASSIGNEE_ME else assignee
