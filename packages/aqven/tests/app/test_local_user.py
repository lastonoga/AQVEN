import asyncio
import getpass
from pathlib import Path
from typing import Final

from aqven.app.locations import ProjectState, StudioState
from aqven.app.settings_store import LocalSettingsStore, open_settings_store
from aqven.ports.identity import ASSIGNEE_ME, ASSIGNEE_SETTING, LocalUser, local_user, os_user_name, resolved_assignee

LEAD: Final = "support_lead"
SHELL_USER: Final = "shell_user"
PROJECT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Project"
description: "local user test project"
package: "shop"
"""


def settings_of(folder: Path) -> LocalSettingsStore:
    root = folder / "project"
    root.mkdir()
    (root / "aqven.yaml").write_text(PROJECT_YAML, encoding="utf-8")
    project = ProjectState(root)
    project.ensure()
    studio = StudioState(folder / "data")
    studio.ensure()
    return open_settings_store(project, studio, {})


def test_without_a_setting_the_local_user_is_the_os_user(tmp_path: Path) -> None:
    store = settings_of(tmp_path)

    user = asyncio.run(local_user(store, {}))

    assert user == LocalUser(assignee=getpass.getuser(), source="os_user")


def test_the_environment_names_the_os_user_without_touching_the_host(tmp_path: Path) -> None:
    store = settings_of(tmp_path)

    user = asyncio.run(local_user(store, {"USER": SHELL_USER}))

    assert user == LocalUser(assignee=SHELL_USER, source="os_user")


def test_the_project_setting_names_the_assignee(tmp_path: Path) -> None:
    store = settings_of(tmp_path)

    async def scenario() -> LocalUser:
        await store.set_value("project", ASSIGNEE_SETTING, f"  {LEAD}  ")
        return await local_user(store, {"USER": SHELL_USER})

    assert asyncio.run(scenario()) == LocalUser(assignee=LEAD, source="setting")


def test_a_blank_setting_falls_back_to_the_os_user(tmp_path: Path) -> None:
    store = settings_of(tmp_path)

    async def scenario() -> LocalUser:
        await store.set_value("project", ASSIGNEE_SETTING, "   ")
        return await local_user(store, {"USER": SHELL_USER})

    assert asyncio.run(scenario()).source == "os_user"


def test_without_a_store_the_os_user_still_answers() -> None:
    user = asyncio.run(local_user(None, {"LOGNAME": SHELL_USER}))

    assert (user.assignee, user.source) == (SHELL_USER, "os_user")


def test_only_the_word_me_is_replaced_by_the_local_user() -> None:
    user = LocalUser(assignee=LEAD, source="setting")

    assert resolved_assignee(ASSIGNEE_ME, user) == LEAD
    assert resolved_assignee("brand_editor", user) == "brand_editor"
    assert resolved_assignee(None, user) is None


def test_the_os_user_name_prefers_the_given_environment() -> None:
    assert os_user_name({"USER": SHELL_USER, "LOGNAME": "other"}) == SHELL_USER
    assert os_user_name({}) == getpass.getuser()
