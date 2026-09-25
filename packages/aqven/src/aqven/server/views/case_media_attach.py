import posixpath
import re
from dataclasses import dataclass
from functools import reduce
from typing import Final

from pydantic import JsonValue, ValidationError

from aqven.client.ids import new_client_op_id
from aqven.datasets import JsonPath, guessed_media_type, media_file_name, unused_media_file_name
from aqven.loader import dataset_media_folder
from aqven.runtime.address import JsonObject, ResourceModel
from aqven.server.errors import ApiFailure, not_found
from aqven.server.views.common import loaded_project
from aqven.server.views.datasets import DatasetSummary
from aqven.server.views.documents import alias_scope, current_document
from aqven.server.workspace import WorkspaceState
from aqven.spec import MEDIA_FILE_KEY, MEDIA_KEY, DatasetId
from aqven.spec.builtins import MEDIA_TYPE_PATTERN
from aqven.write import canonical_yaml
from aqven.write.model import ExpectedFile, FileBytesWriteRequest, WriteActor
from aqven.write.service import WriteService

CASE_LOCATION_PATTERN: Final = (
    r"^(inputs|expected_output|node_outputs\.[A-Za-z_][A-Za-z0-9_]*)(\.[^.\[\]]+|\[[0-9]+\])+$"
)
CASE_LOCATION_MAX_LENGTH: Final = 512
MEBIBYTE: Final = 1024 * 1024
MAX_CASE_MEDIA_BYTES: Final = 100 * MEBIBYTE
DEFAULT_MEDIA_TYPE: Final = "application/octet-stream"
GENERIC_MEDIA_TYPES: Final = frozenset({DEFAULT_MEDIA_TYPE})
CASES_KEY: Final = "cases"
CASE_NAME_KEY: Final = "name"
MEDIA_NAME_KEY: Final = "name"
PARAMETER_SEPARATOR: Final = ";"
LOCATION_STEP: Final = re.compile(r"([^.\[\]]+)|\[([0-9]+)\]")
MEDIA_TYPE: Final = re.compile(MEDIA_TYPE_PATTERN)


@dataclass(frozen=True, slots=True)
class CaseMediaUpload:
    dataset_id: str
    case_name: str
    location: str
    file_hash: str
    file_name: str | None
    media_type: str | None
    data: bytes


@dataclass(frozen=True, slots=True)
class AttachedFile:
    file: str
    path: str
    media_type: str


class CaseMediaAttached(ResourceModel):
    dataset: DatasetSummary
    case_name: str
    location: str
    file: str
    path: str
    media_type: str


def case_location(location: str) -> JsonPath:
    return tuple(int(index) if index else key for key, index in LOCATION_STEP.findall(location))


def upload_media_type(declared: str | None, file_name: str) -> str:
    candidates = (_bare_media_type(declared), _bare_media_type(guessed_media_type(file_name)))
    return next((item for item in candidates if _specific(item)), DEFAULT_MEDIA_TYPE)


def attach_case_media(
    state: WorkspaceState, writer: WriteService, upload: CaseMediaUpload, actor: WriteActor
) -> AttachedFile:
    project = loaded_project(state)
    source = project.datasets.get(DatasetId(upload.dataset_id))
    if source is None:
        raise not_found(f"dataset {upload.dataset_id} is not in the project")
    document = current_document(state.root, source.path, upload.file_hash)
    wanted = media_file_name(upload.file_name or "")
    stored = unused_media_file_name(state.root, source.path, wanted)
    attached = AttachedFile(
        file=stored,
        path=posixpath.join(dataset_media_folder(source.path), stored),
        media_type=upload_media_type(upload.media_type, wanted),
    )
    case = _case_document(document, upload)
    _place(case, case_location(upload.location), _reference(attached, wanted), upload.location)
    files = {source.path: canonical_yaml(source.path, document, alias_scope(state)), attached.path: upload.data}
    expects = ((source.path, upload.file_hash), (attached.path, None))
    writer.write_bytes(_write_request(upload, expects, files), actor)
    return attached


def _case_document(document: JsonObject, upload: CaseMediaUpload) -> JsonValue:
    cases = document.get(CASES_KEY)
    items = cases if isinstance(cases, list) else []
    found = next((item for item in items if _named(item, upload.case_name)), None)
    if found is None:
        raise not_found(f"case {upload.case_name} is not in dataset {upload.dataset_id}")
    return found


def _named(item: JsonValue, name: str) -> bool:
    return isinstance(item, dict) and item.get(CASE_NAME_KEY) == name


def _reference(attached: AttachedFile, wanted: str) -> JsonValue:
    named: JsonObject = {} if wanted == attached.file else {MEDIA_NAME_KEY: wanted}
    return {MEDIA_KEY: attached.media_type, MEDIA_FILE_KEY: attached.file, **named}


def _place(case: JsonValue, path: JsonPath, value: JsonValue, location: str) -> None:
    *parents, last = path
    parent = reduce(lambda current, step: _child(current, step, location), parents, case)
    if isinstance(parent, dict) and isinstance(last, str):
        parent[last] = value
        return
    if isinstance(parent, list) and isinstance(last, int) and last < len(parent):
        parent[last] = value
        return
    raise _missing(location)


def _child(current: JsonValue, step: str | int, location: str) -> JsonValue:
    if isinstance(current, dict) and isinstance(step, str) and step in current:
        return current[step]
    if isinstance(current, list) and isinstance(step, int) and step < len(current):
        return current[step]
    raise _missing(location)


def _missing(location: str) -> ApiFailure:
    return ApiFailure("REQUEST_INVALID", f"case has no place for a media value at {location}")


def _write_request(
    upload: CaseMediaUpload, expects: tuple[tuple[str, str | None], ...], files: dict[str, bytes]
) -> FileBytesWriteRequest:
    try:
        return FileBytesWriteRequest(
            expects=[ExpectedFile(path=path, file_hash=digest) for path, digest in expects],
            files=files,
            client_op_id=new_client_op_id(),
            intent=f"attach a media file to case {upload.case_name} of dataset {upload.dataset_id}",
        )
    except ValidationError as error:
        raise ApiFailure("REQUEST_INVALID", f"media file name cannot be written: {error.errors()[0]['msg']}") from error


def _bare_media_type(media_type: str | None) -> str:
    return (media_type or "").partition(PARAMETER_SEPARATOR)[0].strip().lower()


def _specific(media_type: str) -> bool:
    return MEDIA_TYPE.fullmatch(media_type) is not None and media_type not in GENERIC_MEDIA_TYPES
