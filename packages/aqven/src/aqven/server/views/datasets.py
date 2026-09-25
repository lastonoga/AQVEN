from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Annotated, Final

from pydantic import Field, JsonValue, TypeAdapter, ValidationError

from aqven.datasets import CaseMediaResolver, with_media_placeholders
from aqven.loader import dataset_media_folder
from aqven.loader.aliases import AliasScope
from aqven.loader.strict_yaml import read_strict_yaml
from aqven.preview.samples import sample_document
from aqven.runtime.address import RequestModel, ResourceModel
from aqven.runtime.executions import NodeExecution
from aqven.runtime.options import RunContext
from aqven.runtime.runs import RunSnapshot, RunStartRequest
from aqven.runtime.values import InlineValue
from aqven.series.split import splits_of
from aqven.series.views import CaseDraft, CaseFromRunRequest
from aqven.server.case_media import case_with_media
from aqven.server.errors import ApiFailure, not_found, validation_problems
from aqven.server.run_inputs import input_adapter
from aqven.server.views.common import loaded_flow, loaded_project
from aqven.server.workspace import WorkspaceState
from aqven.spec import API_VERSION, NAME_PATTERN, DatasetCase, DatasetFile, DatasetId, FlowId, NodeId, SeriesSplit
from aqven.write import canonical_yaml

DATASET_FOLDER = "datasets"
RUN_PREFIX_LENGTH: Final = 8


class DatasetDraftRequest(RequestModel):
    flow_id: FlowId


class DatasetCreateRequest(RequestModel):
    dataset_id: Annotated[str, Field(pattern=NAME_PATTERN)]
    flow_id: FlowId
    cases: tuple[DatasetCase, ...] = Field(min_length=1)


class DatasetSummary(ResourceModel):
    dataset_id: DatasetId
    flow_id: FlowId | None = None
    path: str
    media_folder: str
    file_hash: str
    cases: Annotated[int, Field(ge=0)]
    splits: dict[str, int] = {}


def case_splits(state: WorkspaceState, dataset_id: str, cases: Sequence[DatasetCase]) -> Mapping[str, SeriesSplit]:
    package = loaded_project(state).project.spec.package
    return splits_of(package, DatasetId(dataset_id), [case.name for case in cases])


def split_counts(splits: Mapping[str, SeriesSplit]) -> dict[str, int]:
    counted = Counter(splits.values())
    return {split.value: counted[split] for split in SeriesSplit}


def dataset_summaries(state: WorkspaceState) -> tuple[DatasetSummary, ...]:
    return tuple(
        DatasetSummary(
            dataset_id=dataset_id,
            flow_id=source.spec.flow,
            path=source.path,
            media_folder=dataset_media_folder(source.path),
            file_hash=source.file_hash,
            cases=len(source.spec.cases),
            splits=split_counts(case_splits(state, dataset_id, source.spec.cases)),
        )
        for dataset_id, source in sorted(loaded_project(state).datasets.items())
    )


def dataset_summary(state: WorkspaceState, dataset_id: str) -> DatasetSummary:
    found = next((row for row in dataset_summaries(state) if row.dataset_id == dataset_id), None)
    if found is None:
        raise not_found(f"dataset {dataset_id} is not in the project")
    return found


def dataset_cases(state: WorkspaceState, dataset_id: str) -> tuple[DatasetCase, ...]:
    source = loaded_project(state).datasets.get(DatasetId(dataset_id))
    if source is None:
        raise not_found(f"dataset {dataset_id} is not in the project")
    return tuple(sorted(source.spec.cases, key=lambda case: case.name))


def filtered_dataset_cases(
    state: WorkspaceState, dataset_id: str, search: str | None, split: str | None
) -> tuple[DatasetCase, ...]:
    cases = dataset_cases(state, dataset_id)
    splits = case_splits(state, dataset_id, cases)
    query = search.casefold().strip() if search is not None else ""
    return tuple(
        case
        for case in cases
        if (not query or query in case.name.casefold()) and (split is None or splits[case.name].value == split)
    )


@dataclass(frozen=True, slots=True)
class DatasetItem:
    dataset_path: str
    case: DatasetCase


def dataset_item(state: WorkspaceState, request: RunStartRequest, item_id: str) -> DatasetItem:
    dataset_id, separator, case_name = item_id.partition("/")
    if not separator or not dataset_id or not case_name:
        raise ApiFailure("REQUEST_INVALID", "dataset_item_id must be <dataset_id>/<case_name>")
    source = loaded_project(state).datasets.get(DatasetId(dataset_id))
    if source is None:
        raise not_found(f"dataset {dataset_id} is not in the project")
    if source.spec.flow != request.flow_id:
        raise ApiFailure("NOT_RUNNABLE", f"dataset {dataset_id} is not a flow dataset for {request.flow_id}")
    case = next((item for item in source.spec.cases if item.name == case_name), None)
    if case is None:
        raise not_found(f"case {case_name} is not in dataset {dataset_id}")
    if not isinstance(case.inputs, dict):
        raise ApiFailure("INPUT_INVALID", f"case {case_name} does not contain a flow input record")
    return DatasetItem(dataset_path=source.path, case=case)


def case_context(request: RunStartRequest, case: DatasetCase) -> RunContext | None:
    if request.context is not None or case.context is None:
        return request.context
    try:
        return RunContext.model_validate(case.context)
    except ValidationError as error:
        raise ApiFailure(
            "INPUT_INVALID",
            f"case {case.name} has invalid run context",
            problems=validation_problems(error.errors(), ("context",)),
        ) from error


def run_part(request: RunStartRequest, case: DatasetCase) -> DatasetCase:
    node_outputs = case.node_outputs if request.start_node is not None else None
    return case.model_copy(update={"node_outputs": node_outputs, "expected_output": None})


def case_run_request(request: RunStartRequest, case: DatasetCase, context: RunContext | None) -> RunStartRequest:
    return RunStartRequest(
        flow_id=request.flow_id,
        at=request.at,
        mode=request.mode,
        context=context,
        input=case.inputs,
        selected_nodes=request.selected_nodes,
        start_node=request.start_node,
        end_node=request.end_node,
        node_outputs=case.node_outputs or {},
        cassette_id=request.cassette_id,
        human_answers=request.human_answers,
    )


async def resolve_dataset_run(
    state: WorkspaceState, request: RunStartRequest, media: CaseMediaResolver
) -> RunStartRequest:
    item_id = request.dataset_item_id
    if item_id is None:
        return request
    item = dataset_item(state, request, item_id)
    context = case_context(request, item.case)
    case = await case_with_media(media, run_part(request, item.case), item.dataset_path)
    return case_run_request(request, case, context)


def run_input(snapshot: RunSnapshot) -> JsonValue:
    reference = snapshot.input_ref
    if not isinstance(reference, InlineValue):
        raise ApiFailure("INPUT_INVALID", f"run {snapshot.run_id} has no inline input to copy into a case")
    return reference.value


def top_level_output(snapshot: RunSnapshot, execution: NodeExecution) -> JsonValue | None:
    address = execution.address
    nested = (address.branch_key, address.iteration, address.item_index) != (None, None, None)
    if nested or address.node_id not in snapshot.order or not isinstance(execution.output_ref, InlineValue):
        return None
    return execution.output_ref.value


def run_node_outputs(snapshot: RunSnapshot) -> dict[NodeId, JsonValue]:
    produced = ((NodeId(item.address.node_id), top_level_output(snapshot, item)) for item in snapshot.executions)
    return {**snapshot.node_outputs, **{node: value for node, value in produced if value is not None}}


def run_case(snapshot: RunSnapshot, request: CaseFromRunRequest) -> DatasetCase:
    context = None if snapshot.context is None else snapshot.context.model_dump(mode="json", exclude_none=True)
    return DatasetCase(
        name=request.name or f"{snapshot.flow_id}_{snapshot.run_id[:RUN_PREFIX_LENGTH]}",
        inputs=run_input(snapshot),
        context=context or None,
        node_outputs=run_node_outputs(snapshot) or None,
        expected_output=None,
    )


def case_from_run(
    state: WorkspaceState, dataset_id: str, snapshot: RunSnapshot, request: CaseFromRunRequest
) -> CaseDraft:
    project = loaded_project(state)
    source = project.datasets.get(DatasetId(dataset_id))
    if source is None:
        raise not_found(f"dataset {dataset_id} is not in the project")
    if source.spec.flow != snapshot.flow_id:
        holder = f"flow {source.spec.flow}" if source.spec.flow is not None else "no flow"
        message = f"run {snapshot.run_id} ran flow {snapshot.flow_id}, but dataset {dataset_id} belongs to {holder}"
        raise ApiFailure("INPUT_INVALID", message)
    case = run_case(snapshot, request)
    scope = AliasScope(state.root.name, tuple(flow.folder for flow in project.flows.values()))
    document = case.model_dump(mode="json", by_alias=True, exclude_none=True)
    text = canonical_yaml(source.path, document, scope).decode("utf-8")
    return CaseDraft(dataset_id=DatasetId(dataset_id), case=case, yaml=text)


def draft_dataset(state: WorkspaceState, request: DatasetDraftRequest) -> DatasetFile:
    loaded_flow(state, request.flow_id)
    if state.compiled is None or request.flow_id not in state.compiled.flows:
        raise ApiFailure("NOT_RUNNABLE", f"flow {request.flow_id} has no compiled input schema")
    compiled = state.compiled.flow(request.flow_id)
    schema = compiled.input_schema
    context: dict[str, JsonValue] = {
        key.value: date.today().isoformat() if key.value == "date" else "example" for key in compiled.context
    }
    return DatasetFile(
        apiVersion=API_VERSION,
        kind="Dataset",
        flow=request.flow_id,
        cases=[DatasetCase(name="case_1", inputs=sample_document(schema), context=context or None)],
    )


def validate_flow_cases(state: WorkspaceState, request: DatasetCreateRequest) -> DatasetFile:
    flow = loaded_flow(state, request.flow_id)
    if flow.source is None:
        raise ApiFailure("NOT_RUNNABLE", f"flow {request.flow_id} has no source definition")
    names = [case.name for case in request.cases]
    if len(names) != len(set(names)):
        raise ApiFailure("REQUEST_INVALID", "dataset case names must be unique")
    adapter: TypeAdapter[object] = input_adapter(state, flow.source.spec.input)
    compiled = state.compiled.flows.get(request.flow_id) if state.compiled is not None else None
    for index, case in enumerate(request.cases):
        if not isinstance(case.inputs, dict):
            raise ApiFailure("INPUT_INVALID", f"case {case.name} needs an input record")
        try:
            adapter.validate_python(with_media_placeholders(case.inputs))
        except ValidationError as error:
            invalid = tuple(item for item in error.errors() if item["type"] != "missing")
            if invalid:
                raise ApiFailure(
                    "INPUT_INVALID",
                    f"case {case.name} contains invalid flow input fields",
                    problems=validation_problems(invalid, ("cases", index, "inputs")),
                ) from error
        if compiled is not None and case.node_outputs:
            unknown = set(case.node_outputs) - set(compiled.order)
            if unknown:
                raise ApiFailure(
                    "INPUT_INVALID",
                    f"case {case.name} has output fixtures for unknown top-level nodes: {', '.join(sorted(unknown))}",
                )
        try:
            RunContext.model_validate(case.context or {})
        except ValidationError as error:
            raise ApiFailure(
                "INPUT_INVALID",
                f"case {case.name} has invalid run context",
                problems=validation_problems(error.errors(), ("cases", index, "context")),
            ) from error
    return DatasetFile(apiVersion=API_VERSION, kind="Dataset", flow=request.flow_id, cases=list(request.cases))


def create_dataset(state: WorkspaceState, request: DatasetCreateRequest) -> Path:
    project = loaded_project(state)
    if DatasetId(request.dataset_id) in project.datasets:
        raise ApiFailure("FILE_EXISTS", f"dataset {request.dataset_id} already exists")
    document = validate_flow_cases(state, request)
    relative = f"{DATASET_FOLDER}/{request.dataset_id}.yaml"
    location = state.root / relative
    location.parent.mkdir(parents=True, exist_ok=True)
    scope = AliasScope(state.root.name, tuple(flow.folder for flow in project.flows.values()))
    content = canonical_yaml(relative, document.model_dump(mode="json", by_alias=True, exclude_none=True), scope)
    parsed, diagnostics = read_strict_yaml(content.decode("utf-8"), relative)
    if parsed is None or diagnostics:
        detail = diagnostics[0].message if diagnostics else "the generated YAML is invalid"
        raise ApiFailure("INPUT_INVALID", f"dataset cannot be saved: {detail}")
    try:
        with location.open("xb") as file:
            file.write(content)
    except FileExistsError as error:
        raise ApiFailure("FILE_EXISTS", f"dataset file {relative} already exists") from error
    return location
