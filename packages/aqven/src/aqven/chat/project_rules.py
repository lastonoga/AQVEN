from pathlib import Path
from typing import Final

PROJECT_RULE_FILES: Final[tuple[str, ...]] = ("AGENTS.md", "CLAUDE.md")


def project_rules(project_root: Path) -> str:
    files = (project_root / name for name in PROJECT_RULE_FILES)
    return "\n\n".join(path.read_text(encoding="utf-8") for path in files if path.is_file() and not path.is_symlink())
