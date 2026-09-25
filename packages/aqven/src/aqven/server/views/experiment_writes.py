import posixpath
from typing import Annotated, Final

from pydantic import Field

from aqven.diagnostics import Diagnostic
from aqven.loader import experiment_prompt_file
from aqven.runtime.address import JsonObject, RequestModel, ResourceModel
from aqven.series.findings.layout import EXPERIMENTS_FOLDER
from aqven.server.errors import ApiFailure
from aqven.server.views.common import diagnostics_in, diagnostics_within, loaded_project
from aqven.server.views.documents import alias_scope, current_document
from aqven.server.views.research import loaded_experiment
from aqven.server.workspace import WorkspaceState
from aqven.spec import CaseSelection, ExperimentId, ExperimentSpec
from aqven.write import canonical_yaml
from aqven.write.model import EntityName, ExpectedFile, FileBytesWriteRequest, Ulid, WriteActor, WriteResult
from aqven.write.paths import FileHash
from aqven.write.service import WriteService

EXPERIMENT_FILE: Final = "experiment.yaml"
CASES_KEY: Final = "cases"
TEXT_ENCODING: Final = "utf-8"

type PromptText = Annotated[str, Field(min_length=1)]


class ExpectedHash(RequestModel):
    file_hash: FileHash


class ExperimentCasesWrite(RequestModel):
    cases: CaseSelection
    expects: ExpectedHash
    client_op_id: Ulid


class ExperimentCreateRequest(RequestModel):
    experiment_id: EntityName
    spec: ExperimentSpec
    prompts: dict[EntityName, PromptText] = Field(default_factory=dict[EntityName, PromptText])
    client_op_id: Ulid


class ExperimentFileWritten(ResourceModel):
    file: str
    file_hash: str
    diagnostics: tuple[Diagnostic, ...]


class ExperimentCreated(ExperimentFileWritten):
    experiment_id: ExperimentId


def experiment_folder(experiment_id: str) -> str:
    return posixpath.join(EXPERIMENTS_FOLDER, experiment_id)


def experiment_file(experiment_id: str) -> str:
    return posixpath.join(experiment_folder(experiment_id), EXPERIMENT_FILE)


def written_hash(result: WriteResult, path: str) -> str:
    hashes = {item.path: item.file_hash for item in result.version.files if item.file_hash is not None}
    return hashes[path]


def selection_document(selection: CaseSelection) -> JsonObject:
    tags = selection.tags or None
    return selection.model_copy(update={"tags": tags}).model_dump(mode="json", by_alias=True, exclude_none=True)


def experiment_spec_path(state: WorkspaceState, experiment_id: str) -> str:
    return loaded_experiment(state, experiment_id).source.path


def cases_edit(state: WorkspaceState, path: str, request: ExperimentCasesWrite) -> FileBytesWriteRequest:
    expected = request.expects.file_hash
    document = current_document(state.root, path, expected)
    document[CASES_KEY] = selection_document(request.cases)
    return FileBytesWriteRequest(
        expects=[ExpectedFile(path=path, file_hash=expected)],
        files={path: canonical_yaml(path, document, alias_scope(state))},
        client_op_id=request.client_op_id,
        intent=f"experiment cases in {path}",
    )


def write_cases(
    state: WorkspaceState, writer: WriteService, path: str, request: ExperimentCasesWrite, actor: WriteActor
) -> WriteResult:
    replay = writer.intents.find(request.client_op_id)
    if replay is not None:
        return replay
    return writer.write_bytes(cases_edit(state, path, request), actor)


def cases_written(state: WorkspaceState, path: str, result: WriteResult) -> ExperimentFileWritten:
    return ExperimentFileWritten(
        file=path, file_hash=written_hash(result, path), diagnostics=diagnostics_in(state, (path,))
    )


def taken_folder(state: WorkspaceState, experiment_id: str) -> str | None:
    existing = loaded_project(state).experiments.get(ExperimentId(experiment_id))
    if existing is not None:
        return existing.folder
    folder = experiment_folder(experiment_id)
    return folder if (state.root / folder).exists() else None


def require_new_experiment(state: WorkspaceState, experiment_id: str) -> None:
    folder = taken_folder(state, experiment_id)
    if folder is None:
        return
    conflict: JsonObject = {"path": folder}
    raise ApiFailure("FILE_EXISTS", f"experiment {experiment_id} already exists in {folder}", conflict=conflict)


def experiment_document(spec: ExperimentSpec) -> JsonObject:
    return spec.model_dump(mode="json", by_alias=True, exclude_none=True, exclude_defaults=True)


def creation_edit(state: WorkspaceState, request: ExperimentCreateRequest) -> FileBytesWriteRequest:
    folder = experiment_folder(request.experiment_id)
    spec_path = experiment_file(request.experiment_id)
    spec = canonical_yaml(spec_path, experiment_document(request.spec), alias_scope(state))
    prompts = {
        experiment_prompt_file(folder, name): text.encode(TEXT_ENCODING) for name, text in request.prompts.items()
    }
    files = {spec_path: spec, **prompts}
    return FileBytesWriteRequest(
        expects=[ExpectedFile(path=path, file_hash=None) for path in files],
        files=files,
        client_op_id=request.client_op_id,
        intent=f"create experiment {request.experiment_id}",
    )


def create_experiment(
    state: WorkspaceState, writer: WriteService, request: ExperimentCreateRequest, actor: WriteActor
) -> WriteResult:
    replay = writer.intents.find(request.client_op_id)
    if replay is not None:
        return replay
    require_new_experiment(state, request.experiment_id)
    return writer.write_bytes(creation_edit(state, request), actor)


def experiment_created(state: WorkspaceState, experiment_id: str, result: WriteResult) -> ExperimentCreated:
    path = experiment_file(experiment_id)
    return ExperimentCreated(
        experiment_id=ExperimentId(experiment_id),
        file=path,
        file_hash=written_hash(result, path),
        diagnostics=diagnostics_within(state, experiment_folder(experiment_id)),
    )
