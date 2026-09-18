from typing import Annotated

from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse, Response

from aqven.engine.selection import SelectionError, execution_order, range_missing
from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, EngineError, RunListQuery
from aqven.preview import PromptPreview
from aqven.runtime.address import RequestModel, ResourceModel
from aqven.runtime.runs import Page
from aqven.server.context import ServerContext, operation, rest_only
from aqven.server.errors import ERROR_RESPONSES, ApiFailure
from aqven.server.resources import (
    CompileStatus,
    FlowDetail,
    FlowIr,
    FlowSchemas,
    FlowSpecView,
    FlowSummary,
    NodeDetail,
    NodeSummary,
    PromptDetail,
    PromptLevel,
    PromptSummary,
    RunBrief,
    TypeDetail,
    TypeSummary,
)
from aqven.server.views.common import loaded_project, page_of
from aqven.server.views.flows import flow_detail, flow_ir, flow_schemas, flow_spec_view, flow_summaries
from aqven.server.views.nodes import node_detail, node_summaries
from aqven.server.views.preview import PromptPreviewBody, prompt_preview
from aqven.server.views.prompts import prompt_detail, prompt_summaries
from aqven.server.views.types import type_detail, type_summaries
from aqven.spec import DatasetId, FlowId, NodeId

NOT_MODIFIED = 304


class RunScopeRequest(RequestModel):
    selected_nodes: tuple[NodeId, ...] | None = None


class RunScopePreview(ResourceModel):
    selected_nodes: tuple[NodeId, ...] | None
    order: tuple[NodeId, ...]


class DatasetRangeRequest(RequestModel):
    dataset_id: DatasetId
    case_names: tuple[str, ...]


class MissingRangeData(ResourceModel):
    case_name: str
    reference: str
    reason: str


class DatasetRangePair(ResourceModel):
    start_node: NodeId
    end_node: NodeId
    available: bool
    missing: tuple[MissingRangeData, ...]


class DatasetRangePreview(ResourceModel):
    order: tuple[NodeId, ...]
    ranges: tuple[DatasetRangePair, ...]


async def last_run(context: ServerContext, flow_id: str) -> RunBrief | None:
    try:
        page = await context.facade.list_runs(RunListQuery(flow_id=FlowId(flow_id), limit=1))
    except EngineError:
        return None
    latest = next(iter(page.items), None)
    if latest is None:
        return None
    return RunBrief(run_id=latest.run_id, status=latest.status, started_at=latest.started_at)


def build_flows_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get("/flows", operation_id="flow_list", openapi_extra=operation("flow_list"))
    async def list_flows(
        compile_status: Annotated[CompileStatus | None, Query(alias="status")] = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[FlowSummary]:
        state = await context.workspace.state()
        flow_ids = sorted(loaded_project(state).flows)
        runs: dict[str, RunBrief] = {
            flow_id: brief for flow_id in flow_ids if (brief := await last_run(context, flow_id)) is not None
        }
        rows = [
            row for row in flow_summaries(state, runs) if compile_status is None or row.compile_status == compile_status
        ]
        return page_of(rows, lambda row: row.flow_id, cursor, limit)

    @router.get("/flows/{flow_id}", operation_id="flow_get", openapi_extra=operation("flow_get"))
    async def get_flow(flow_id: str) -> FlowDetail:
        state = await context.workspace.state()
        return flow_detail(state, flow_id, await last_run(context, flow_id))

    @router.get("/flows/{flow_id}/spec", operation_id="flow_spec", openapi_extra=operation("flow_get"))
    async def get_flow_spec(flow_id: str) -> FlowSpecView:
        state = await context.workspace.state()
        return flow_spec_view(state, flow_id)

    @router.get(
        "/flows/{flow_id}/ir",
        operation_id="flow_ir",
        response_model=FlowIr,
        openapi_extra=operation("flow_get"),
    )
    async def get_flow_ir(flow_id: str, if_none_match: Annotated[str | None, Header()] = None) -> Response:
        state = await context.workspace.state()
        document = flow_ir(state, flow_id)
        tag = f'"{document.content_hash}"'
        if if_none_match == tag:
            return Response(status_code=NOT_MODIFIED, headers={"ETag": tag})
        return JSONResponse(document.model_dump(mode="json", by_alias=True), headers={"ETag": tag})

    @router.get("/flows/{flow_id}/schemas", operation_id="flow_schemas", openapi_extra=operation("catalog_get"))
    async def get_flow_schemas(flow_id: str) -> FlowSchemas:
        state = await context.workspace.state()
        return flow_schemas(state, flow_id)

    @router.post(
        "/flows/{flow_id}/run-scope",
        operation_id="flow_run_scope",
        openapi_extra=rest_only("preview the nodes executed by a scoped run"),
    )
    async def preview_run_scope(flow_id: str, body: RunScopeRequest) -> RunScopePreview:
        state = await context.workspace.state()
        if state.compiled is None or FlowId(flow_id) not in state.compiled.flows:
            raise ApiFailure("NOT_RUNNABLE", f"flow {flow_id} has no compiled execution plan")
        try:
            order = execution_order(state.compiled.flow(FlowId(flow_id)), body.selected_nodes)
        except SelectionError as error:
            raise ApiFailure("INPUT_INVALID", str(error)) from error
        return RunScopePreview(selected_nodes=body.selected_nodes, order=order)

    @router.post(
        "/flows/{flow_id}/dataset-range",
        operation_id="flow_dataset_range",
        openapi_extra=rest_only("preview contiguous dataset execution ranges"),
    )
    async def preview_dataset_range(flow_id: str, body: DatasetRangeRequest) -> DatasetRangePreview:
        state = await context.workspace.state()
        wanted_flow = FlowId(flow_id)
        if state.compiled is None or wanted_flow not in state.compiled.flows:
            raise ApiFailure("NOT_RUNNABLE", f"flow {flow_id} has no compiled execution plan")
        source = loaded_project(state).datasets.get(body.dataset_id)
        if source is None:
            raise ApiFailure("NOT_FOUND", f"dataset {body.dataset_id} is not in the project")
        if source.spec.flow != wanted_flow:
            raise ApiFailure("NOT_RUNNABLE", f"dataset {body.dataset_id} is not a flow dataset for {flow_id}")
        if not body.case_names or len(set(body.case_names)) != len(body.case_names):
            raise ApiFailure("REQUEST_INVALID", "case_names must be nonempty and unique")
        cases = {case.name: case for case in source.spec.cases}
        unknown = set(body.case_names) - cases.keys()
        if unknown:
            raise ApiFailure("NOT_FOUND", f"cases not in dataset {body.dataset_id}: {', '.join(sorted(unknown))}")
        flow = state.compiled.flow(wanted_flow)
        ranges: list[DatasetRangePair] = []
        for first, start_node in enumerate(flow.order):
            for end_node in flow.order[first:]:
                missing = tuple(
                    MissingRangeData(case_name=case_name, reference=item.reference, reason=item.reason)
                    for case_name in body.case_names
                    for item in range_missing(
                        flow,
                        start_node,
                        end_node,
                        cases[case_name].inputs,
                        cases[case_name].context or {},
                        cases[case_name].node_outputs or {},
                    )
                )
                ranges.append(
                    DatasetRangePair(
                        start_node=start_node,
                        end_node=end_node,
                        available=not missing,
                        missing=missing,
                    )
                )
        return DatasetRangePreview(order=flow.order, ranges=tuple(ranges))

    @router.get("/flows/{flow_id}/nodes", operation_id="flow_nodes", openapi_extra=operation("flow_get"))
    async def list_nodes(flow_id: str) -> tuple[NodeSummary, ...]:
        state = await context.workspace.state()
        return node_summaries(state, flow_id)

    @router.get("/flows/{flow_id}/nodes/{node_id}", operation_id="flow_node", openapi_extra=operation("flow_get"))
    async def get_node(flow_id: str, node_id: str) -> NodeDetail:
        state = await context.workspace.state()
        return node_detail(state, flow_id, node_id)

    @router.get(
        "/flows/{flow_id}/nodes/{node_id}/prompt",
        operation_id="flow_node_prompt",
        openapi_extra=rest_only("prompt source for the studio editor"),
    )
    async def get_prompt(flow_id: str, node_id: str) -> PromptDetail:
        state = await context.workspace.state()
        return prompt_detail(state, flow_id, node_id)

    @router.post(
        "/flows/{flow_id}/nodes/{node_id}/prompt/preview",
        operation_id="flow_node_prompt_preview",
        openapi_extra=operation("prompt_preview"),
    )
    async def preview_prompt_of_node(flow_id: str, node_id: str, body: PromptPreviewBody) -> PromptPreview:
        state = await context.workspace.state()
        return prompt_preview(state, flow_id, node_id, body)

    @router.get("/prompts", operation_id="prompt_list", openapi_extra=rest_only("prompt listing for the studio"))
    async def list_prompts(
        flow_id: str | None = None,
        level: PromptLevel | None = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[PromptSummary]:
        state = await context.workspace.state()
        return prompt_summaries(state, flow_id, level, cursor, limit)

    @router.get("/types", operation_id="type_list", openapi_extra=operation("catalog_list"))
    async def list_types(
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[TypeSummary]:
        state = await context.workspace.state()
        return type_summaries(state, cursor, limit)

    @router.get("/types/{type_id}", operation_id="type_get", openapi_extra=operation("catalog_get"))
    async def get_type(type_id: str) -> TypeDetail:
        state = await context.workspace.state()
        return type_detail(state, type_id)

    return router
