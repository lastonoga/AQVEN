from pathlib import Path

from aqven.app.locations import ProjectState
from aqven.app.runtime_file import ServerRecord, read_server_record, remove_server_record, write_server_record

ServerRuntime = ServerRecord


def runtime_path(root: Path) -> Path:
    return ProjectState(root).server_record


def read_runtime(root: Path) -> ServerRecord | None:
    return read_server_record(ProjectState(root))


def write_runtime(root: Path, runtime: ServerRecord) -> Path:
    return write_server_record(ProjectState(root), runtime)


def remove_runtime(root: Path, pid: int) -> bool:
    return remove_server_record(ProjectState(root), pid)
