from collections.abc import MutableMapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Final

from dotenv import dotenv_values, set_key, unset_key
from pydantic import SecretStr

from aqven.app.host_os import ensure_private_file
from aqven.app.locations import GITIGNORE_FILE
from aqven.ports.settings import PROJECT_ENV_FILE, EnvName, env_name, project_env_file

DOTENV_QUOTE_MODE: Final = "always"
DOTENV_ENCODING: Final = "utf-8"
ENV_IGNORE_LINES: Final = frozenset(
    {
        PROJECT_ENV_FILE,
        f"/{PROJECT_ENV_FILE}",
        f"{PROJECT_ENV_FILE}*",
        f"/{PROJECT_ENV_FILE}*",
        f"**/{PROJECT_ENV_FILE}",
    }
)


@dataclass(frozen=True, slots=True)
class DotenvEntry:
    name: EnvName
    value: SecretStr


def ensure_env_ignored(root: Path) -> bool:
    target = root / GITIGNORE_FILE
    text = target.read_text(encoding="utf-8") if target.is_file() else ""
    present = frozenset(line.strip() for line in text.splitlines())
    if present & ENV_IGNORE_LINES:
        return False
    separator = "" if not text or text.endswith("\n") else "\n"
    target.write_text(f"{text}{separator}{PROJECT_ENV_FILE}\n", encoding="utf-8")
    return True


def valid_entry(raw_name: str, raw_value: str | None) -> DotenvEntry | None:
    name = env_name(raw_name)
    if name is None or raw_value is None:
        return None
    return DotenvEntry(name, SecretStr(raw_value))


@dataclass(frozen=True, slots=True)
class DotenvFile:
    root: Path
    lock: Lock = field(default_factory=Lock, compare=False)

    @property
    def path(self) -> Path:
        return project_env_file(self.root)

    def entries(self) -> tuple[DotenvEntry, ...]:
        if not self.path.is_file():
            return ()
        values = dotenv_values(self.path, interpolate=False, encoding=DOTENV_ENCODING)
        found = (valid_entry(name, value) for name, value in values.items())
        return tuple(entry for entry in found if entry is not None)

    def read(self, name: EnvName) -> SecretStr | None:
        return next((entry.value for entry in self.entries() if entry.name == name), None)

    def modified_at(self) -> datetime:
        return datetime.fromtimestamp(self.path.stat().st_mtime, UTC)

    def write(self, name: EnvName, value: SecretStr) -> SecretStr | None:
        with self.lock:
            previous = self.read(name)
            ensure_private_file(self.path)
            ensure_env_ignored(self.root)
            set_key(
                self.path,
                name,
                value.get_secret_value(),
                quote_mode=DOTENV_QUOTE_MODE,
                encoding=DOTENV_ENCODING,
            )
            return previous

    def remove(self, name: EnvName) -> SecretStr | None:
        with self.lock:
            previous = self.read(name)
            if previous is None:
                return None
            unset_key(self.path, name, quote_mode=DOTENV_QUOTE_MODE, encoding=DOTENV_ENCODING)
            return previous


@dataclass(frozen=True, slots=True)
class EnvironmentMirror:
    environment: MutableMapping[str, str]

    def replace(self, name: EnvName, previous: SecretStr | None, current: SecretStr | None) -> None:
        if previous is None or self.environment.get(name) != previous.get_secret_value():
            return
        if current is None:
            self.environment.pop(name, None)
            return
        self.environment[name] = current.get_secret_value()
