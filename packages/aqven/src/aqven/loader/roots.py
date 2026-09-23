from pathlib import Path
from typing import Final

WORKSPACE_MARKER: Final = "pyproject.toml"


def project_workspace(root: Path) -> Path:
    resolved = root.resolve()
    return next((folder for folder in resolved.parents if (folder / WORKSPACE_MARKER).is_file()), resolved)
