from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile

from aqven.evals import CaseRecord, DatasetSummary, EvalRunId, EvalRunRecord, EvalSummary
from aqven.evals.gate import GateReport
from aqven.evals.store import EvalRunQuery
from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from aqven.runtime.runs import Page
from aqven.server.context import ServerContext, operation, rest_only
from aqven.server.errors import ERROR_RESPONSES, ApiFailure, not_found
from aqven.server.views.common import decode_cursor, encode_cursor, page_of
from aqven.server.views.dataset_batches import (
    DatasetBatchCase,
    DatasetBatchJobs,
    DatasetBatchRecord,
    DatasetBatchStartRequest,
)
from aqven.server.views.dataset_csv import MAX_CSV_BYTES, CsvImportPreview, inspect_csv
from aqven.server.views.dataset_csv_template import CsvTemplate, csv_template
from aqven.server.views.datasets import (
    DatasetCreateRequest,
    DatasetDraftRequest,
    create_dataset,
    dataset_cases,
    draft_dataset,
    filtered_dataset_cases,
)
from aqven.server.views.evals import (
    EvalJobs,
    EvalRunAccepted,
    EvalRunRequest,
    accepted,
    dataset_summaries,
    dataset_summary,
    eval_summaries,
    eval_summary,
)
from aqven.server.views.services import StudioServices
from aqven.spec import NAME_PATTERN, DatasetCase, DatasetFile, DatasetId, EvalId, FlowId

ACCEPTED = 202
EVAL_CATALOGUE = "eval catalogue read from the project files"
EVAL_RUNS = "eval run history in the project database"
MCP_PENDING = "no MCP tool yet: docs/14-mcp-contract.md names it for a later phase"


def build_evals_router(context: ServerContext, services: StudioServices | None = None) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)
    shared = services or StudioServices()
    jobs = shared.evals = shared.evals or EvalJobs(context)
    batches = shared.batches = shared.batches or DatasetBatchJobs(context)

    @router.get("/evals", operation_id="eval_list", openapi_extra=rest_only(EVAL_CATALOGUE))
    async def list_evals(
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[EvalSummary]:
        rows = eval_summaries(await context.workspace.state())
        return page_of(rows, lambda row: row.eval_id, cursor, limit)

    @router.get("/evals/{eval_id}", operation_id="eval_get", openapi_extra=rest_only(EVAL_CATALOGUE))
    async def get_eval(eval_id: str) -> EvalSummary:
        return eval_summary(await context.workspace.state(), eval_id)

    @router.get("/datasets", operation_id="dataset_list", openapi_extra=rest_only(EVAL_CATALOGUE))
    async def list_datasets(
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[DatasetSummary]:
        rows = dataset_summaries(await context.workspace.state())
        return page_of(rows, lambda row: row.dataset_id, cursor, limit)

    @router.get("/datasets/{dataset_id}", operation_id="dataset_get", openapi_extra=rest_only(MCP_PENDING))
    async def get_dataset(dataset_id: str) -> DatasetSummary:
        return dataset_summary(await context.workspace.state(), dataset_id)

    @router.get("/datasets/{dataset_id}/cases", operation_id="dataset_cases", openapi_extra=rest_only(EVAL_CATALOGUE))
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
        "/datasets/{dataset_id}/case-names", operation_id="dataset_case_names", openapi_extra=rest_only(EVAL_CATALOGUE)
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
        openapi_extra=rest_only(EVAL_CATALOGUE),
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
        "/dataset-batches",
        status_code=202,
        operation_id="dataset_batch_start",
        openapi_extra=operation("dataset_batch_start"),
    )
    async def start_dataset_batch(body: DatasetBatchStartRequest) -> DatasetBatchRecord:
        return await batches.start(body)

    @router.get(
        "/dataset-batches", operation_id="dataset_batch_list", openapi_extra=rest_only("flow dataset batch history")
    )
    async def list_dataset_batches(
        flow_id: FlowId,
        dataset_id: DatasetId,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[DatasetBatchRecord]:
        before = decode_cursor(cursor) if cursor is not None else None
        records = batches.opened().batches(flow_id, dataset_id, before, limit + 1)
        chosen = records[:limit]
        next_cursor = encode_cursor(chosen[-1].batch_id) if len(records) > limit and chosen else None
        return Page[DatasetBatchRecord](items=chosen, next_cursor=next_cursor, total_estimate=None)

    @router.get(
        "/dataset-batches/{batch_id}",
        operation_id="dataset_batch_get",
        openapi_extra=operation("dataset_batch_get"),
    )
    async def get_dataset_batch(batch_id: str) -> DatasetBatchRecord:
        return await batches.get(batch_id)

    @router.get(
        "/dataset-batches/{batch_id}/cases",
        operation_id="dataset_batch_cases",
        openapi_extra=rest_only("flow dataset batch case results"),
    )
    async def list_dataset_batch_cases(
        batch_id: str,
        search: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[DatasetBatchCase]:
        if batches.opened().batch(batch_id) is None:
            raise not_found(f"dataset batch {batch_id} is not in the project database")
        query = search.casefold().strip() if search is not None else ""
        rows = tuple(
            case.public()
            for case in batches.opened().cases(batch_id)
            if (not query or query in case.case_name.casefold()) and (status is None or case.status == status)
        )
        return page_of(rows, lambda row: row.case_name, cursor, limit)

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

    @router.post(
        "/eval-runs",
        status_code=ACCEPTED,
        operation_id="eval_run_start",
        openapi_extra=operation("eval_run_start"),
    )
    async def start_eval_run(body: EvalRunRequest) -> EvalRunAccepted:
        return accepted(await jobs.start(body))

    @router.get("/eval-runs", operation_id="eval_run_list", openapi_extra=rest_only(EVAL_RUNS))
    async def list_eval_runs(
        eval_id: EvalId | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[EvalRunRecord]:
        rows = await jobs.opened().search(EvalRunQuery(eval_id=eval_id, status=status, limit=MAX_PAGE_LIMIT))
        return page_of(rows, lambda row: row.eval_run_id, cursor, limit)

    @router.get("/eval-runs/{eval_run_id}", operation_id="eval_run_get", openapi_extra=operation("eval_run_get"))
    async def get_eval_run(eval_run_id: str) -> EvalRunRecord:
        return await jobs.run(EvalRunId(eval_run_id))

    @router.get("/eval-runs/{eval_run_id}/cases", operation_id="eval_run_cases", openapi_extra=rest_only(EVAL_RUNS))
    async def list_eval_cases(
        eval_run_id: str,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[CaseRecord]:
        await jobs.run(EvalRunId(eval_run_id))
        rows = await jobs.opened().cases(EvalRunId(eval_run_id))
        return page_of(rows, lambda row: f"{row.case_name}#{row.run_index}", cursor, limit)

    @router.get(
        "/eval-runs/{eval_run_id}/gate",
        operation_id="eval_gate",
        openapi_extra=operation("eval_gate"),
    )
    async def get_eval_gate(eval_run_id: str) -> GateReport:
        return await jobs.gate(EvalRunId(eval_run_id))

    return router
