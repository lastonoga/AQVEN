import importlib
import os
import sys
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

PYTHON_SUFFIX: Final = ".py"
SKIPPED_DIRECTORIES: Final = frozenset({"__pycache__", ".aqven", ".venv", ".git", "node_modules"})

type CodeStamp = tuple[int, int, int]


def python_files(root: Path) -> Iterator[Path]:
    for folder, directories, files in os.walk(root):
        directories[:] = [name for name in directories if name not in SKIPPED_DIRECTORIES]
        yield from (Path(folder, name) for name in files if name.endswith(PYTHON_SUFFIX))


def modified_ns(path: Path) -> int | None:
    try:
        return path.stat().st_mtime_ns
    except FileNotFoundError:
        return None


def code_stamp(root: Path) -> CodeStamp:
    times = [stamp for stamp in (modified_ns(path) for path in python_files(root)) if stamp is not None]
    return (len(times), max(times, default=0), sum(times))


def owned_by(package: str, name: str) -> bool:
    return name == package or name.startswith(f"{package}.")


def forget_modules(package: str) -> None:
    for name in [name for name in sys.modules if owned_by(package, name)]:
        del sys.modules[name]
    importlib.invalidate_caches()


@dataclass(slots=True)
class CodeFreshness:
    seen: dict[Path, CodeStamp] = field(default_factory=dict[Path, CodeStamp])

    def refresh(self, root: Path) -> None:
        stamp = code_stamp(root)
        if self.seen.get(root) == stamp:
            return
        self.seen[root] = stamp
        forget_modules(root.name)


PROJECT_CODE: Final = CodeFreshness()
