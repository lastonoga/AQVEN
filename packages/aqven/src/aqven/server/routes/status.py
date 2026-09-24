from typing import Final

from fastapi import APIRouter, Response

from aqven.app.secret_names import ProjectSecretNames
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.views.status import ServerStatus, StatusSources, server_status

NO_STORE: Final = "no-store"


def build_status_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)
    sources = StatusSources(context=context, names=ProjectSecretNames(context.workspace.root))

    @router.get("/status", operation_id="status_get", openapi_extra=rest_only("server status for Studio"))
    async def get_status(response: Response) -> ServerStatus:
        response.headers["Cache-Control"] = NO_STORE
        return await server_status(sources)

    return router
