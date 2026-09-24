import os
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Final

from dotenv import dotenv_values, set_key, unset_key
from pydantic import SecretStr

from aqven.app.host_os import ensure_private_file
from aqven.app.locations import GITIGNORE_FILE
from aqven.ports.settings import PROJECT_ENV_FILE, EnvName, env_name, project_env_file, resolved_of

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


def value_to_load(environ: Mapping[str, str], name: str, from_dotenv: str | None) -> str | None:
    resolved = resolved_of(from_dotenv or "", environ.get(name, ""))
    if resolved is None or resolved.source == "environment":
        return None
    return resolved.value.get_secret_value()


def load_project_env(root: Path, environ: MutableMapping[str, str] | None = None) -> bool:
    """Load the project `.env` file into the environment of the process.

    A variable from `.env` is loaded when the environment lacks it or holds an empty string, because an empty
    value counts as unset, the same rule the server applies to provider keys. A non-empty environment value wins
    over `.env`. Values are read literally, without `${VAR}` interpolation, and empty `.env` values are skipped.

    Args:
        root: Project root that holds the `.env` file.
        environ: Environment to fill; the environment of the process, `os.environ`, when omitted.

    Returns:
        `True` when the project has a `.env` file with at least one variable, `False` otherwise.
    """
    env_file = project_env_file(root)
    if not env_file.is_file():
        return False
    target = os.environ if environ is None else environ
    values = dotenv_values(env_file, interpolate=False, encoding=DOTENV_ENCODING)
    loaded = ((name, value_to_load(target, name, value)) for name, value in values.items())
    target.update({name: value for name, value in loaded if value is not None})
    return bool(values)


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
