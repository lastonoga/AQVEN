from pathlib import Path

from aqven.app.dotenv_secrets import load_project_env
from aqven.console.command import FORMATTERS, OutputFormat
from aqven.diagnostics import DiagnosticCode, diagnostic
from aqven.loader import ProjectNotFound, find_project_root
from aqven.ports.settings import PROJECT_ENV_FILE, project_env_file

__all__ = ["PROJECT_ENV_FILE", "load_project_env", "open_project", "project_env_file"]


def open_project(start: Path, output: OutputFormat) -> Path | None:
    try:
        root = find_project_root(start)
    except ProjectNotFound as error:
        missing = diagnostic(DiagnosticCode.E_PROJECT_NOT_FOUND, start.as_posix(), (), str(error))
        print(FORMATTERS[output]((missing,)))
        return None
    load_project_env(root)
    return root
