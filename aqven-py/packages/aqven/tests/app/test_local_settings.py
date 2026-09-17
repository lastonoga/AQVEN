import logging
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import pytest
from pydantic import SecretStr

from aqven.app.host_os import OWNER_PERMISSIONS, permission_bits
from aqven.app.locations import ProjectState, StudioState
from aqven.app.secret_names import ProjectSecretNames
from aqven.app.settings_store import LocalSettingsStore, open_settings_store
from aqven.app.settings_values import SettingValuesDatabase
from aqven.ports.settings import SettingRejected, provider_key_setting, resolve_secret, setting_key
from aqven.spec import ProviderName

SECRET: Final = "sk-or-v1-dotenv-0123456789abcdef"
ROTATED: Final = "sk-or-v1-rotated-fedcba9876543210"
SHELL_SECRET: Final = "sk-or-v1-shell-000011112222"
GEMINI_SECRET: Final = "AIza-gemini-0123456789abcdef"
OPENROUTER_KEY: Final = provider_key_setting(ProviderName.OPENROUTER)
GOOGLE_KEY: Final = provider_key_setting(ProviderName.GOOGLE)
FIXED_TIME: Final = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
PROJECT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Project"
description: "settings test project"
package: "shop"
providers:
- id: "google"
  api_key: "ref:env/GEMINI_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "zero"
- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "zero"
"""


def fixed_clock() -> datetime:
    return FIXED_TIME


def project_root(folder: Path) -> Path:
    root = folder / "project"
    root.mkdir(parents=True, exist_ok=True)
    (root / "aqven.yaml").write_text(PROJECT_YAML, encoding="utf-8")
    return root


def store_at(folder: Path, environment: dict[str, str] | None = None) -> LocalSettingsStore:
    project = ProjectState(project_root(folder))
    project.ensure()
    studio = StudioState(folder / "data")
    studio.ensure()
    return open_settings_store(project, studio, {} if environment is None else environment)


def env_text(folder: Path) -> str:
    return (folder / "project" / ".env").read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_value_round_trip_and_listing(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    key = setting_key("studio.theme")
    written = await store.set_value("studio", key, {"mode": "dark", "scale": 1.25})
    listed = await store.list_settings("studio")
    assert written.kind == "value"
    assert written.value == {"mode": "dark", "scale": 1.25}
    assert written.masked is None
    assert listed == (written,)
    assert await store.list_settings("project") == ()


@pytest.mark.asyncio
async def test_secret_is_written_to_dotenv_and_masked_on_every_read(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    written = await store.set_secret("project", OPENROUTER_KEY, SecretStr(SECRET))
    fetched = await store.get_setting("project", OPENROUTER_KEY)
    listed = await store.list_settings("project")
    views = (written, fetched, *listed)
    assert env_text(tmp_path) == f"OPENROUTER_API_KEY='{SECRET}'\n"
    assert all(view is not None and view.masked == "••••cdef" for view in views)
    assert all(view is not None and view.env_var == "OPENROUTER_API_KEY" for view in views)
    assert all(view is not None and view.value is None for view in views)
    assert all(SECRET not in view.model_dump_json() for view in views if view is not None)
    secret = await store.read_secret("project", OPENROUTER_KEY)
    assert secret is not None and secret.get_secret_value() == SECRET
    assert await store.read_secret("studio", OPENROUTER_KEY) is None


@pytest.mark.skipif(not OWNER_PERMISSIONS, reason="owner permissions are checked only on POSIX")
@pytest.mark.asyncio
async def test_dotenv_is_owner_only_and_gitignored_once(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    await store.set_secret("project", OPENROUTER_KEY, SecretStr(SECRET))
    await store.set_secret("project", OPENROUTER_KEY, SecretStr(ROTATED))
    ignored = (tmp_path / "project" / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert permission_bits(tmp_path / "project" / ".env") == 0o600
    assert ignored.count(".env") == 1
    assert env_text(tmp_path) == f"OPENROUTER_API_KEY='{ROTATED}'\n"


@pytest.mark.asyncio
async def test_existing_dotenv_lines_survive_writes_and_deletes(tmp_path: Path) -> None:
    root = project_root(tmp_path)
    (root / ".env").write_text("# local tools\nDEBUG=1\nOPENROUTER_API_KEY=old-value\n", encoding="utf-8")
    store = store_at(tmp_path)
    await store.set_secret("project", OPENROUTER_KEY, SecretStr(SECRET))
    assert env_text(tmp_path) == f"# local tools\nDEBUG=1\nOPENROUTER_API_KEY='{SECRET}'\n"
    assert await store.delete_setting("project", OPENROUTER_KEY) is True
    assert await store.delete_setting("project", OPENROUTER_KEY) is False
    assert env_text(tmp_path) == "# local tools\nDEBUG=1\n"
    assert await store.get_setting("project", OPENROUTER_KEY) is None
    listed = await store.list_settings("project")
    assert [(view.key, view.env_var, view.masked) for view in listed] == [("secrets.debug", "DEBUG", "••••")]


@pytest.mark.asyncio
async def test_key_names_follow_aqven_yaml_refs_and_secret_convention(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    await store.set_secret("project", GOOGLE_KEY, SecretStr(GEMINI_SECRET))
    await store.set_secret("project", setting_key("secrets.slack_token"), SecretStr("xoxb-1"))
    names = ProjectSecretNames(tmp_path / "project")
    listed = await store.list_settings("project")
    assert env_text(tmp_path) == f"GEMINI_API_KEY='{GEMINI_SECRET}'\nSLACK_TOKEN='xoxb-1'\n"
    assert [(view.key, view.env_var) for view in listed] == [
        ("providers.google.api_key", "GEMINI_API_KEY"),
        ("secrets.slack_token", "SLACK_TOKEN"),
    ]
    by_provider = {name.provider: (name.env_var, name.declared) for name in names.providers()}
    assert by_provider[ProviderName.GOOGLE] == ("GEMINI_API_KEY", True)
    assert by_provider[ProviderName.ANTHROPIC] == ("ANTHROPIC_API_KEY", False)
    assert names.env_name(setting_key("secrets.not.an.env")) is None
    assert names.env_name(setting_key("ui.theme")) is None


@pytest.mark.asyncio
async def test_invalid_secret_writes_are_rejected_with_codes(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    with pytest.raises(SettingRejected) as studio_scope:
        await store.set_secret("studio", OPENROUTER_KEY, SecretStr(SECRET))
    with pytest.raises(SettingRejected) as plain_key:
        await store.set_secret("project", setting_key("ui.theme"), SecretStr(SECRET))
    with pytest.raises(SettingRejected) as value_for_secret:
        await store.set_value("project", OPENROUTER_KEY, "plain")
    with pytest.raises(SettingRejected) as line_break:
        await store.set_secret("project", OPENROUTER_KEY, SecretStr(f"{SECRET}\nEXTRA=1"))
    codes = [error.value.code for error in (studio_scope, plain_key, value_for_secret, line_break)]
    assert codes == ["SECRET_SCOPE_UNSUPPORTED", "NOT_A_SECRET_KEY", "SECRET_KEY_NEEDS_SECRET", "SECRET_VALUE_INVALID"]
    assert all(SECRET not in str(error.value) and error.value.hint for error in (studio_scope, line_break))
    assert not (tmp_path / "project" / ".env").exists()


@pytest.mark.asyncio
async def test_process_environment_wins_over_dotenv(tmp_path: Path) -> None:
    environment = {"OPENROUTER_API_KEY": SHELL_SECRET}
    store = store_at(tmp_path, environment)
    from_shell = await resolve_secret(store, OPENROUTER_KEY, "OPENROUTER_API_KEY", environment)
    await store.set_secret("project", OPENROUTER_KEY, SecretStr(SECRET))
    still_shell = await resolve_secret(store, OPENROUTER_KEY, "OPENROUTER_API_KEY", environment)
    from_dotenv = await resolve_secret(store, OPENROUTER_KEY, "OPENROUTER_API_KEY", {})
    assert from_shell is not None and from_shell.source == "environment"
    assert still_shell is not None and still_shell.value.get_secret_value() == SHELL_SECRET
    assert still_shell.source == "environment"
    assert environment == {"OPENROUTER_API_KEY": SHELL_SECRET}
    assert from_dotenv is not None and (from_dotenv.source, from_dotenv.value.get_secret_value()) == ("dotenv", SECRET)
    assert await resolve_secret(store_at(tmp_path / "empty"), OPENROUTER_KEY, "OPENROUTER_API_KEY", {}) is None


@pytest.mark.asyncio
async def test_values_loaded_from_dotenv_follow_studio_edits(tmp_path: Path) -> None:
    root = project_root(tmp_path)
    (root / ".env").write_text(f"OPENROUTER_API_KEY={SECRET}\n", encoding="utf-8")
    environment = {"OPENROUTER_API_KEY": SECRET}
    store = store_at(tmp_path, environment)
    loaded = await resolve_secret(store, OPENROUTER_KEY, "OPENROUTER_API_KEY", environment)
    await store.set_secret("project", OPENROUTER_KEY, SecretStr(ROTATED))
    rotated = await resolve_secret(store, OPENROUTER_KEY, "OPENROUTER_API_KEY", environment)
    rotated_environment = dict(environment)
    await store.delete_setting("project", OPENROUTER_KEY)
    assert loaded is not None and loaded.source == "dotenv"
    assert rotated is not None and (rotated.source, rotated.value.get_secret_value()) == ("dotenv", ROTATED)
    assert rotated_environment == {"OPENROUTER_API_KEY": ROTATED}
    assert environment == {}
    assert await resolve_secret(store, OPENROUTER_KEY, "OPENROUTER_API_KEY", environment) is None


@pytest.mark.asyncio
async def test_secret_values_never_reach_logs(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    store = store_at(tmp_path)
    await store.set_secret("project", OPENROUTER_KEY, SecretStr(SECRET))
    await store.list_settings("project")
    await store.read_secret("project", OPENROUTER_KEY)
    await store.delete_setting("project", OPENROUTER_KEY)
    await store.delete_setting("project", OPENROUTER_KEY)
    assert SECRET not in caplog.text


@pytest.mark.asyncio
async def test_values_survive_reopen_and_keep_timestamps(tmp_path: Path) -> None:
    path = tmp_path / "studio.sqlite"
    first = SettingValuesDatabase.open(path, fixed_clock)
    first.put(setting_key("limits.max_runs"), 3)
    reopened = SettingValuesDatabase.open(path)
    stored = reopened.get(setting_key("limits.max_runs"))
    assert stored is not None
    assert stored.view("studio").value == 3
    assert stored.updated_at == FIXED_TIME


LEGACY_SCHEMA: Final = """
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('secret', 'value')),
    value_json TEXT,
    secret TEXT,
    updated_at TEXT NOT NULL
)
"""


def test_legacy_secret_rows_are_dropped_and_values_kept(tmp_path: Path) -> None:
    path = tmp_path / "studio.sqlite"
    with closing(sqlite3.connect(path, autocommit=True)) as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(LEGACY_SCHEMA)
        insert = "INSERT INTO settings (key, kind, value_json, secret, updated_at) VALUES (?, ?, ?, ?, ?)"
        connection.execute(insert, ("providers.openrouter.api_key", "secret", None, SECRET, FIXED_TIME.isoformat()))
        connection.execute(insert, ("ui.theme", "value", '"dark"', None, FIXED_TIME.isoformat()))
    database = SettingValuesDatabase.open(path)
    with closing(sqlite3.connect(path, autocommit=True)) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    stored_bytes = b"".join(item.read_bytes() for item in tmp_path.iterdir() if item.name.startswith("studio.sqlite"))
    assert tables == {"setting_values"}
    assert [(item.key, item.value) for item in database.all()] == [("ui.theme", "dark")]
    assert SECRET.encode() not in stored_bytes
    assert database.migrate() is False


@pytest.mark.skipif(not OWNER_PERMISSIONS, reason="owner permissions are checked only on POSIX")
def test_value_databases_are_owner_only(tmp_path: Path) -> None:
    store_at(tmp_path)
    assert permission_bits(tmp_path / "data" / "studio.sqlite") == 0o600
    assert permission_bits(tmp_path / "project" / ".aqven" / "aqven.sqlite") == 0o600
