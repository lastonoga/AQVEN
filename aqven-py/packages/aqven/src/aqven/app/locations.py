import os
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.app.host_os import ensure_private_directory

STUDIO_DATABASE_FILE: Final = "studio.sqlite"
PROJECT_STATE_FOLDER: Final = ".aqven"
PROJECT_DATABASE_FILE: Final = "aqven.sqlite"
SERVER_RECORD_FILE: Final = "server.json"
SERVER_LOCK_FILE: Final = "server.lock"
SERVER_LOG_FILE: Final = "server.log"
GITIGNORE_FILE: Final = ".gitignore"
MACOS_APPLICATION_NAME: Final = "AQVEN"
WINDOWS_APPLICATION_NAME: Final = "AQVEN"
XDG_APPLICATION_NAME: Final = "aqven"
RUNTIME_IGNORES: Final = (
    f"{PROJECT_STATE_FOLDER}/{SERVER_RECORD_FILE}",
    f"{PROJECT_STATE_FOLDER}/{SERVER_LOCK_FILE}",
    f"{PROJECT_STATE_FOLDER}/{SERVER_LOG_FILE}",
    f"{PROJECT_STATE_FOLDER}/*.sqlite",
    f"{PROJECT_STATE_FOLDER}/*.sqlite-*",
    f"{PROJECT_STATE_FOLDER}/lock",
    f"{PROJECT_STATE_FOLDER}/txn/",
    f"{PROJECT_STATE_FOLDER}/drafts/",
    f"{PROJECT_STATE_FOLDER}/cache/",
    f"{PROJECT_STATE_FOLDER}/plans/",
    f"{PROJECT_STATE_FOLDER}/blobs/",
)
WHOLE_STATE_IGNORES: Final = frozenset(
    {
        PROJECT_STATE_FOLDER,
        f"{PROJECT_STATE_FOLDER}/",
        f"/{PROJECT_STATE_FOLDER}",
        f"/{PROJECT_STATE_FOLDER}/",
    }
)

type DataDirRule = Callable[[Mapping[str, str], Path], Path]


def _macos_data_dir(environ: Mapping[str, str], home: Path) -> Path:
    return home / "Library" / "Application Support" / MACOS_APPLICATION_NAME


def _windows_data_dir(environ: Mapping[str, str], home: Path) -> Path:
    roaming = environ.get("APPDATA", "")
    base = Path(roaming) if roaming else home / "AppData" / "Roaming"
    return base / WINDOWS_APPLICATION_NAME


def _xdg_data_dir(environ: Mapping[str, str], home: Path) -> Path:
    configured = Path(environ.get("XDG_DATA_HOME", ""))
    base = configured if configured.is_absolute() else home / ".local" / "share"
    return base / XDG_APPLICATION_NAME


DATA_DIR_RULES: Final[Mapping[str, DataDirRule]] = {
    "darwin": _macos_data_dir,
    "win32": _windows_data_dir,
}


def studio_data_dir(
    override: Path | None = None,
    *,
    platform: str = sys.platform,
    environ: Mapping[str, str] = os.environ,
    home: Path | None = None,
) -> Path:
    if override is not None:
        return override.expanduser().resolve()
    rule = DATA_DIR_RULES.get(platform, _xdg_data_dir)
    return rule(environ, Path.home() if home is None else home)


@dataclass(frozen=True, slots=True)
class StudioState:
    directory: Path

    @property
    def database(self) -> Path:
        return self.directory / STUDIO_DATABASE_FILE

    def ensure(self) -> Path:
        return ensure_private_directory(self.directory)


@dataclass(frozen=True, slots=True)
class ProjectState:
    root: Path

    @property
    def folder(self) -> Path:
        return self.root / PROJECT_STATE_FOLDER

    @property
    def database(self) -> Path:
        return self.folder / PROJECT_DATABASE_FILE

    @property
    def server_record(self) -> Path:
        return self.folder / SERVER_RECORD_FILE

    @property
    def server_lock(self) -> Path:
        return self.folder / SERVER_LOCK_FILE

    @property
    def server_log(self) -> Path:
        return self.folder / SERVER_LOG_FILE

    def ensure(self) -> Path:
        ensure_gitignored(self.root)
        return ensure_private_directory(self.folder)


def ensure_gitignored(root: Path, entries: Sequence[str] = RUNTIME_IGNORES) -> tuple[str, ...]:
    target = root / GITIGNORE_FILE
    text = target.read_text(encoding="utf-8") if target.is_file() else ""
    present = frozenset(line.strip() for line in text.splitlines())
    if present & WHOLE_STATE_IGNORES:
        return ()
    missing = tuple(entry for entry in entries if entry not in present and f"/{entry}" not in present)
    if not missing:
        return ()
    separator = "" if not text or text.endswith("\n") else "\n"
    lines = "\n".join(missing)
    target.write_text(f"{text}{separator}{lines}\n", encoding="utf-8")
    return missing
