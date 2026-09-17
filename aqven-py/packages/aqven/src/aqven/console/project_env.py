from pathlib import Path
from typing import Final

from dotenv import load_dotenv

from aqven.console.command import FORMATTERS, OutputFormat
from aqven.diagnostics import DiagnosticCode, diagnostic
from aqven.loader import ProjectNotFound, find_project_root

PROJECT_ENV_FILE: Final = ".env"


def project_env_file(root: Path) -> Path:
    return root / PROJECT_ENV_FILE


def load_project_env(root: Path) -> bool:
    env_file = project_env_file(root)
    if not env_file.is_file():
        return False
    return load_dotenv(env_file, override=False, interpolate=False)


def open_project(start: Path, output: OutputFormat) -> Path | None:
    try:
        root = find_project_root(start)
    except ProjectNotFound as error:
        missing = diagnostic(DiagnosticCode.E_PROJECT_NOT_FOUND, start.as_posix(), (), str(error))
        print(FORMATTERS[output]((missing,)))
        return None
    load_project_env(root)
    return root
