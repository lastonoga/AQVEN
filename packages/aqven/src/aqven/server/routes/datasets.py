from typing import Annotated

from anyio import to_thread
from fastapi import APIRouter, File, Form, Query, UploadFile

from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from aqven.runtime.runs import Page
from aqven.series.views import CaseDraft, CaseFromRunRequest
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES, ApiFailure, not_found
from aqven.server.views.case_media_attach import (
    CASE_LOCATION_MAX_LENGTH,
    CASE_LOCATION_PATTERN,
    MAX_CASE_MEDIA_BYTES,
    MEBIBYTE,
    CaseMediaAttached,
    CaseMediaUpload,
    attach_case_media,
)
from aqven.server.views.common import page_of
from aqven.server.views.dataset_csv import MAX_CSV_BYTES, CsvImportPreview, inspect_csv
from aqven.server.views.dataset_csv_template import CsvTemplate, csv_template
from aqven.server.views.datasets import (
    DatasetCreateRequest,
    DatasetDraftRequest,
    DatasetSummary,
    case_from_run,
    create_dataset,
    dataset_cases,
    dataset_summaries,
    dataset_summary,
    draft_dataset,
    filtered_dataset_cases,
)
from aqven.spec import NAME_PATTERN, DatasetCase, DatasetFile, FlowId
from aqven.write.paths import FILE_HASH_PATTERN

DATASET_CATALOGUE = "dataset catalogue read from the project files"
MCP_PENDING = "no MCP tool yet: docs/14-mcp-contract.md names it for a later phase"
CASE_DRAFT = "a case draft; the agent writes the dataset file"
CASE_MEDIA = "Studio attaches a media file to a case; an agent writes the file and the reference itself"


async def media_upload(file: UploadFile) -> bytes:
    data = await file.read(MAX_CASE_MEDIA_BYTES + 1)
    if not data:
        raise ApiFailure("REQUEST_INVALID", "media file is empty")
    if len(data) > MAX_CASE_MEDIA_BYTES:
        raise ApiFailure("REQUEST_INVALID", f"media file exceeds {MAX_CASE_MEDIA_BYTES // MEBIBYTE} MB")
    return data


def build_datasets_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get("/datasets", operation_id="dataset_list", openapi_extra=rest_only(DATASET_CATALOGUE))
    async def list_datasets(
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[DatasetSummary]:
        rows = dataset_summaries(await context.workspace.state())
        return page_of(rows, lambda row: row.dataset_id, cursor, limit)

    @router.get("/datasets/{dataset_id}", operation_id="dataset_get", openapi_extra=rest_only(MCP_PENDING))
    async def get_dataset(dataset_id: str) -> DatasetSummary:
        return dataset_summary(await context.workspace.state(), dataset_id)

    @router.get(
        "/datasets/{dataset_id}/cases", operation_id="dataset_cases", openapi_extra=rest_only(DATASET_CATALOGUE)
    )
    async def list_dataset_cases(
        dataset_id: str,
        search: str | None = None,
        split: str | None = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[DatasetCase]:
        rows = filtered_dataset_cases(await context.workspace.state(), dataset_id, search, split)
        return page_of(rows, lambda row: row.name, cursor, limit)

    @router.get(
        "/datasets/{dataset_id}/case-names",
        operation_id="dataset_case_names",
        openapi_extra=rest_only(DATASET_CATALOGUE),
    )
    async def list_dataset_case_names(
        dataset_id: str,
        search: str | None = None,
        split: str | None = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[str]:
        rows = tuple(
            case.name for case in filtered_dataset_cases(await context.workspace.state(), dataset_id, search, split)
        )
        return page_of(rows, lambda row: row, cursor, limit)

    @router.get(
        "/datasets/{dataset_id}/cases/{case_name}",
        operation_id="dataset_case_get",
        openapi_extra=rest_only(DATASET_CATALOGUE),
    )
    async def get_dataset_case(dataset_id: str, case_name: str) -> DatasetCase:
        case = next(
            (item for item in dataset_cases(await context.workspace.state(), dataset_id) if item.name == case_name),
            None,
        )
        if case is None:
            raise not_found(f"case {case_name} is not in dataset {dataset_id}")
        return case

    @router.post(
        "/datasets/{dataset_id}/cases/from-run",
        operation_id="case_from_run",
        openapi_extra=rest_only(CASE_DRAFT),
    )
    async def draft_case_from_run(dataset_id: str, body: CaseFromRunRequest) -> CaseDraft:
        snapshot = await context.facade.get_run(body.run_id)
        return case_from_run(await context.workspace.state(), dataset_id, snapshot, body)

    @router.post(
        "/datasets/{dataset_id}/cases/{case_name}/media",
        status_code=201,
        operation_id="case_media_attach",
        openapi_extra=rest_only(CASE_MEDIA),
    )
    async def attach_media(
        dataset_id: str,
        case_name: str,
        location: Annotated[str, Form(pattern=CASE_LOCATION_PATTERN, max_length=CASE_LOCATION_MAX_LENGTH)],
        file_hash: Annotated[str, Form(pattern=FILE_HASH_PATTERN)],
        file: Annotated[UploadFile, File()],
    ) -> CaseMediaAttached:
        data = await media_upload(file)
        upload = CaseMediaUpload(dataset_id, case_name, location, file_hash, file.filename, file.content_type, data)
        state = await context.workspace.state()
        actor = await context.human()
        attached = await to_thread.run_sync(attach_case_media, state, context.writer, upload, actor)
        return CaseMediaAttached(
            dataset=dataset_summary(await context.workspace.state(), dataset_id),
            case_name=case_name,
            location=location,
            file=attached.file,
            path=attached.path,
            media_type=attached.media_type,
        )

    @router.post(
        "/datasets/draft",
        operation_id="dataset_draft",
        openapi_extra=rest_only("schema sample for the Studio editor"),
    )
    async def generate_dataset_draft(body: DatasetDraftRequest) -> DatasetFile:
        return draft_dataset(await context.workspace.state(), body)

    @router.get(
        "/datasets/import-csv/template",
        operation_id="dataset_csv_template",
        openapi_extra=rest_only("flow-specific CSV fields and downloadable example"),
    )
    async def get_dataset_csv_template(flow_id: FlowId) -> CsvTemplate:
        return csv_template(await context.workspace.state(), flow_id)

    async def csv_fields(file: UploadFile) -> bytes:
        data = await file.read(MAX_CSV_BYTES + 1)
        if len(data) > MAX_CSV_BYTES:
            raise ApiFailure("REQUEST_INVALID", f"CSV file exceeds {MAX_CSV_BYTES // (1024 * 1024)} MB")
        return data

    @router.post(
        "/datasets/import-csv/preview",
        operation_id="dataset_csv_preview",
        openapi_extra=rest_only("preview a flow dataset CSV without saving it"),
    )
    async def preview_dataset_csv(
        dataset_id: Annotated[str, Form(pattern=NAME_PATTERN)],
        flow_id: Annotated[FlowId, Form()],
        file: Annotated[UploadFile, File()],
    ) -> CsvImportPreview:
        preview, _ = await inspect_csv(
            await context.workspace.state(), context.blobs, dataset_id, flow_id, await csv_fields(file)
        )
        return preview

    @router.post(
        "/datasets/import-csv",
        status_code=201,
        operation_id="dataset_csv_import",
        openapi_extra=rest_only("import CSV cases and public media into a flow dataset"),
    )
    async def import_dataset_csv(
        dataset_id: Annotated[str, Form(pattern=NAME_PATTERN)],
        flow_id: Annotated[FlowId, Form()],
        file: Annotated[UploadFile, File()],
    ) -> DatasetSummary:
        data = await csv_fields(file)
        state = await context.workspace.state()
        final, cases = await inspect_csv(state, context.blobs, dataset_id, flow_id, data, download=True)
        if not final.ready:
            problems = [*final.problems, *(problem for row in final.rows for problem in row.problems)]
            raise ApiFailure("INPUT_INVALID", "; ".join(problems[:5]))
        create_dataset(state, DatasetCreateRequest(dataset_id=dataset_id, flow_id=flow_id, cases=cases))
        return dataset_summary(await context.workspace.state(), dataset_id)

    @router.post(
        "/datasets",
        operation_id="dataset_create",
        openapi_extra=rest_only("Studio creates flow datasets as project files"),
    )
    async def save_dataset(body: DatasetCreateRequest) -> DatasetSummary:
        state = await context.workspace.state()
        create_dataset(state, body)
        return dataset_summary(await context.workspace.state(), body.dataset_id)

    return router
