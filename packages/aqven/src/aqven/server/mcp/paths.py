from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.runtime.address import Problem
from aqven.server.errors import ApiFailure

NODE_ID_SEPARATOR: Final = "::"
OUTSIDE_CODE: Final = "path_outside_project"


@dataclass(frozen=True, slots=True)
class ProjectPaths:
    workspace: Path
    module: Path

    @classmethod
    def of(cls, workspace: Path, module: Path) -> ProjectPaths:
        return cls(workspace=workspace.resolve(), module=module.resolve())

    def workspace_targets(self, paths: Iterable[str]) -> tuple[str, ...]:
        return tuple(_scoped(self.workspace, path) for path in paths)

    def workspace_test_targets(self, paths: Iterable[str]) -> tuple[str, ...]:
        return tuple(_scoped_test(self.workspace, path) for path in paths)

    def module_prefixes(self, paths: Iterable[str]) -> tuple[str, ...]:
        return tuple(_relative(self.module, _inside(self.module, path)) for path in paths)

    def workspace_relative(self, file: str) -> str:
        location = Path(file)
        if not location.is_absolute() or not location.is_relative_to(self.workspace):
            return file
        return location.relative_to(self.workspace).as_posix()


def _scoped(root: Path, path: str) -> str:
    return _inside(root, path).as_posix()


def _scoped_test(root: Path, path: str) -> str:
    file, separator, selector = path.partition(NODE_ID_SEPARATOR)
    return f"{_scoped(root, file)}{separator}{selector}"


def _inside(root: Path, path: str) -> Path:
    resolved = (root / path).resolve()
    if resolved.is_relative_to(root):
        return resolved
    problem = Problem(path=("paths",), code=OUTSIDE_CODE, message=f"{path} is outside the project {root}")
    raise ApiFailure("REQUEST_INVALID", f"path {path} is outside the project", problems=(problem,))


def _relative(root: Path, location: Path) -> str:
    relative = location.relative_to(root).as_posix()
    return "" if relative == "." else relative
