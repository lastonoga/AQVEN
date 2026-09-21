from pathlib import Path

import pytest

from aqven.app.host_os import OWNER_PERMISSIONS, ensure_private_file, permission_bits, write_private_text
from aqven.app.locations import RUNTIME_IGNORES, ProjectState, ensure_gitignored, studio_data_dir

HOME = Path("/home/tester")


def test_macos_data_dir_is_application_support() -> None:
    folder = studio_data_dir(platform="darwin", environ={"XDG_DATA_HOME": "/xdg"}, home=HOME)
    assert folder == HOME / "Library" / "Application Support" / "AQVEN"


def test_windows_data_dir_uses_appdata() -> None:
    folder = studio_data_dir(platform="win32", environ={"APPDATA": "/roaming"}, home=HOME)
    assert folder == Path("/roaming") / "AQVEN"


def test_windows_data_dir_without_appdata_falls_back_to_roaming_profile() -> None:
    folder = studio_data_dir(platform="win32", environ={}, home=HOME)
    assert folder == HOME / "AppData" / "Roaming" / "AQVEN"


def test_linux_data_dir_follows_xdg_data_home() -> None:
    folder = studio_data_dir(platform="linux", environ={"XDG_DATA_HOME": "/xdg/data"}, home=HOME)
    assert folder == Path("/xdg/data") / "aqven"


def test_linux_data_dir_ignores_relative_xdg_and_uses_local_share() -> None:
    folder = studio_data_dir(platform="linux", environ={"XDG_DATA_HOME": "relative"}, home=HOME)
    assert folder == HOME / ".local" / "share" / "aqven"


def test_override_wins_over_platform(tmp_path: Path) -> None:
    folder = studio_data_dir(tmp_path / "custom", platform="darwin", environ={}, home=HOME)
    assert folder == (tmp_path / "custom").resolve()


def test_gitignore_is_created_with_runtime_entries(tmp_path: Path) -> None:
    added = ensure_gitignored(tmp_path)
    assert added == RUNTIME_IGNORES
    lines = (tmp_path / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert ".aqven/server.json" in lines
    assert ".aqven/*.sqlite" in lines


def test_gitignore_keeps_user_lines_and_adds_only_missing(tmp_path: Path) -> None:
    (tmp_path / ".gitignore").write_text("node_modules/\n.aqven/server.json", encoding="utf-8")
    added = ensure_gitignored(tmp_path)
    text = (tmp_path / ".gitignore").read_text(encoding="utf-8")
    assert ".aqven/server.json" not in added
    assert text.startswith("node_modules/\n.aqven/server.json\n")
    assert ensure_gitignored(tmp_path) == ()


def test_gitignore_whole_state_folder_is_enough(tmp_path: Path) -> None:
    (tmp_path / ".gitignore").write_text("/.aqven/\n", encoding="utf-8")
    assert ensure_gitignored(tmp_path) == ()
    assert (tmp_path / ".gitignore").read_text(encoding="utf-8") == "/.aqven/\n"


def test_project_state_ensure_creates_private_folder(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)
    folder = state.ensure()
    assert folder == tmp_path / ".aqven"
    assert (tmp_path / ".gitignore").is_file()
    assert state.server_record == tmp_path / ".aqven" / "server.json"
    assert state.database == tmp_path / ".aqven" / "aqven.sqlite"


@pytest.mark.skipif(not OWNER_PERMISSIONS, reason="owner permissions are checked only on POSIX")
def test_private_files_are_owner_only(tmp_path: Path) -> None:
    created = ensure_private_file(tmp_path / "nested" / "file.sqlite")
    written = write_private_text(tmp_path / "nested" / "server.json", "{}")
    assert permission_bits(created) == 0o600
    assert permission_bits(written) == 0o600
    assert permission_bits(tmp_path / "nested") == 0o700
