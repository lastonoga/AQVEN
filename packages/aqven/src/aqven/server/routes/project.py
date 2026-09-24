import mimetypes
from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from typing import Annotated, Final

from anyio import to_thread
from fastapi import APIRouter, Header, Query
from starlette.responses import Response

from aqven.loader import file_hash
from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from aqven.runtime.runs import Page
from aqven.series.settings import cap_override
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES, not_found
from aqven.server.resources import FileDetail, FileEntry, FileKind, ProjectInfo, SyncState
from aqven.server.views.common import page_of
from aqven.server.views.files import file_detail, file_entries, project_info
from aqven.server.views.research_budget import ResearchBudgetView, ResearchBudgetWrite, budget_view, write_research
from aqven.server.workspace import WorkspaceState

TEXT_TYPES: Final[Mapping[str, str]] = {
    ".yaml": "application/yaml; charset=utf-8",
    ".yml": "application/yaml; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".py": "text/x-python; charset=utf-8",
    ".json": "application/json",
}
BINARY_TYPE: Final = "application/octet-stream"
RESEARCH_BUDGET: Final = "a person sets the research spend cap in Studio"
NOT_MODIFIED: Final = 304
RAW_RESPONSES: Final[dict[int | str, dict[str, object]]] = {
    **ERROR_RESPONSES,
    200: {"content": {BINARY_TYPE: {"schema": {"type": "string", "format": "binary"}}}},
}


def media_type_of(path: str) -> str:
    suffix = PurePosixPath(path).suffix
    return TEXT_TYPES.get(suffix) or mimetypes.guess_type(path)[0] or BINARY_TYPE


def project_file(state: WorkspaceState, path: str) -> Path:
    if state.snapshot.get(path) is None:
        raise not_found(f"file {path} is not in the project")
    root = state.root.resolve()
    location = (root / path).resolve()
    if not location.is_relative_to(root) or not location.is_file():
        raise not_found(f"file {path} is not in the project")
    return location


def etag(value: str) -> str:
    return f'"{value}"'


def build_project_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get("/project", operation_id="project_get", openapi_extra=rest_only("project status"))
    async def get_project() -> ProjectInfo:
        state = await context.workspace.state()
        return project_info(state, context.engine_version, context.hub.seq, context.mcp_url)

    async def current_budget() -> ResearchBudgetView:
        return budget_view(await context.workspace.state(), await cap_override(context.settings))

    @router.get("/project/research", operation_id="research_budget_get", openapi_extra=rest_only(RESEARCH_BUDGET))
    async def get_research_budget() -> ResearchBudgetView:
        return await current_budget()

    @router.put("/project/research", operation_id="research_budget_put", openapi_extra=rest_only(RESEARCH_BUDGET))
    async def put_research_budget(body: ResearchBudgetWrite) -> ResearchBudgetView:
        await to_thread.run_sync(write_research, context.writer, body, await context.human())
        return await current_budget()

    @router.get("/files", operation_id="file_list", openapi_extra=rest_only("agents read files natively"))
    async def list_files(
        prefix: str | None = None,
        kind: FileKind | None = None,
        state_filter: Annotated[SyncState | None, Query(alias="state")] = None,
        cursor: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> Page[FileEntry]:
        state = await context.workspace.state()
        rows = [
            entry
            for entry in file_entries(state)
            if (prefix is None or entry.path.startswith(prefix))
            and (kind is None or entry.kind == kind)
            and (state_filter is None or entry.sync_state == state_filter)
        ]
        return page_of(rows, lambda entry: entry.path, cursor, limit)

    @router.get("/files/{path:path}", operation_id="file_get", openapi_extra=rest_only("agents read files natively"))
    async def get_file(path: str) -> FileDetail:
        state = await context.workspace.state()
        return file_detail(state, path)

    @router.get(
        "/raw/{path:path}",
        operation_id="raw_get",
        response_class=Response,
        responses=RAW_RESPONSES,
        openapi_extra=rest_only("raw bytes"),
    )
    async def get_raw(path: str, if_none_match: Annotated[str | None, Header()] = None) -> Response:
        state = await context.workspace.state()
        location = project_file(state, path)
        data = await to_thread.run_sync(location.read_bytes)
        tag = etag(file_hash(data))
        headers = {"ETag": tag, "Cache-Control": "no-cache"}
        if if_none_match == tag:
            return Response(status_code=NOT_MODIFIED, headers=headers)
        return Response(content=data, media_type=media_type_of(path), headers=headers)

    return router
