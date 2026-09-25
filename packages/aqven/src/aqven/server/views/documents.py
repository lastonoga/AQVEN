from pathlib import Path

from aqven.loader import file_hash
from aqven.loader.aliases import AliasScope
from aqven.runtime.address import JsonObject
from aqven.server.errors import ApiFailure
from aqven.server.views.common import loaded_project
from aqven.server.workspace import WorkspaceState
from aqven.write import parse_document


def alias_scope(state: WorkspaceState) -> AliasScope:
    project = loaded_project(state)
    return AliasScope(state.root.name, tuple(flow.folder for flow in project.flows.values()))


def current_document(root: Path, path: str, expected: str) -> JsonObject:
    location = root / path
    if not location.is_file():
        raise ApiFailure("FILE_VANISHED", f"{path} was deleted after it was read")
    data = location.read_bytes()
    current = file_hash(data)
    if current != expected:
        conflict: JsonObject = {"path": path, "your_hash": expected, "current_hash": current}
        raise ApiFailure("STALE_FILE", f"{path} changed after it was read", conflict=conflict)
    document = parse_document(path, data)
    if document is None:
        raise ApiFailure("REQUEST_INVALID", f"{path} does not parse as a YAML definition: fix the file first")
    return document
