from fastapi import APIRouter

from aqven.server.context import ServerContext, rest_only
from aqven.server.resources import ReadyState


def build_meta_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/ready", operation_id="ready", openapi_extra=rest_only("readiness probe"))
    async def ready() -> ReadyState:
        return ReadyState(engine_version=context.engine_version)

    return router
