import hashlib
import os
from dataclasses import dataclass
from enum import StrEnum
from importlib.metadata import PackageNotFoundError, version
from importlib.resources import files
from pathlib import Path, PurePosixPath
from typing import Final, Protocol

from aqven.loader.roots import project_workspace

PLUGIN_PACKAGE: Final = "aqven"
PLUGIN_FOLDER: Final = "agent_plugin"
SKILLS_FOLDER: Final = "skills"
PROJECT_FOLDER: Final = "project"
TEMPLATE_SUFFIX: Final = ".tmpl"
PACKAGE_TOKEN: Final = "__package__"
VERSION_TOKEN: Final = "<version>"
ENCODING: Final = "utf-8"
HASH_PREFIX: Final = "sha256-"
UNRELEASED_VERSION: Final = "0.0.0"
CURRENT_FOLDER: Final = "."


def agent_plugin_root() -> Path:
    return Path(str(files(PLUGIN_PACKAGE) / PLUGIN_FOLDER))


def installed_version() -> str:
    try:
        return version(PLUGIN_PACKAGE)
    except PackageNotFoundError:
        return UNRELEASED_VERSION


def file_digest(content: bytes) -> str:
    return f"{HASH_PREFIX}{hashlib.sha256(content).hexdigest()}"


def disk_digest(path: Path) -> str | None:
    if not path.is_file():
        return None
    return file_digest(path.read_bytes())


class Action(StrEnum):
    WROTE = "wrote"
    REMOVED = "removed"
    LINKED = "linked"
    COPIED = "copied"
    KEPT = "kept"


@dataclass(frozen=True, slots=True)
class Change:
    action: Action
    path: str
    detail: str = ""

    def line(self) -> str:
        detail = f": {self.detail}" if self.detail else ""
        return f"{self.action.value} {self.path}{detail}"


@dataclass(frozen=True, slots=True)
class Drift:
    path: str
    problem: str

    def line(self) -> str:
        return f"{self.path}: {self.problem}"


@dataclass(frozen=True, slots=True)
class AgentPlace:
    root: Path
    workspace: Path
    version: str
    plugin: Path

    @classmethod
    def of(cls, root: Path, workspace: Path | None = None) -> AgentPlace:
        resolved = root.resolve()
        folder = project_workspace(resolved) if workspace is None else workspace.resolve()
        return cls(resolved, folder, installed_version(), agent_plugin_root())

    @property
    def package(self) -> str:
        if self.root == self.workspace:
            return CURRENT_FOLDER
        return self.root.relative_to(self.workspace).as_posix()

    @property
    def skills(self) -> Path:
        return self.plugin / SKILLS_FOLDER

    def path(self, relative: str | PurePosixPath) -> Path:
        return self.workspace / relative

    def shown(self, path: Path) -> str:
        return path.relative_to(self.workspace).as_posix()

    def from_root(self, relative: str) -> str:
        return PurePosixPath(os.path.relpath(self.path(relative), self.root)).as_posix()

    def template(self, name: str) -> str:
        source = self.plugin / PROJECT_FOLDER / f"{name}{TEMPLATE_SUFFIX}"
        text = source.read_text(encoding=ENCODING)
        return text.replace(PACKAGE_TOKEN, self.package).replace(VERSION_TOKEN, self.version)


class AgentTarget(Protocol):
    def drift(self, place: AgentPlace) -> tuple[Drift, ...]: ...

    def sync(self, place: AgentPlace) -> tuple[Change, ...]: ...


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding=ENCODING)


def read_text(path: Path) -> str | None:
    return path.read_text(encoding=ENCODING) if path.is_file() else None
