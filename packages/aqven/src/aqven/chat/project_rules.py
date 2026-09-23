from collections.abc import Iterator
from pathlib import Path
from typing import Final

from aqven.loader.layout import FINDINGS_FILE
from aqven.loader.roots import project_workspace

PROJECT_RULE_FILES: Final[tuple[str, ...]] = ("AGENTS.md", "CLAUDE.md")


def rule_roots(project_root: Path) -> tuple[Path, ...]:
    return tuple(dict.fromkeys((project_root.resolve(), project_workspace(project_root))))


def rule_files(project_root: Path) -> Iterator[Path]:
    for root in rule_roots(project_root):
        yield from (root / name for name in PROJECT_RULE_FILES)
    yield project_root / FINDINGS_FILE


def project_rules(project_root: Path) -> str:
    files = rule_files(project_root)
    return "\n\n".join(path.read_text(encoding="utf-8") for path in files if path.is_file() and not path.is_symlink())
