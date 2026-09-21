import shutil
from collections.abc import Iterable
from pathlib import Path
from typing import Final

from aqven.check import CheckReport
from aqven.diagnostics import Diagnostic

COPY_IGNORED: Final[tuple[str, ...]] = (".aqven", "__pycache__", "*.pyc")


def copy_project(root: Path, destination: Path) -> Path:
    target = destination / root.name
    shutil.copytree(root, target, ignore=shutil.ignore_patterns(*COPY_IGNORED))
    return target


def diagnostics_under(report: CheckReport, prefixes: Iterable[str]) -> tuple[Diagnostic, ...]:
    scope = tuple(prefixes)
    return tuple(item for item in report.diagnostics if item.file.startswith(scope))
