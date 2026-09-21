from typing import Final

from fastapi import APIRouter

from aqven.server.errors import not_found

ALL_METHODS: Final = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


def build_fallback_router() -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.api_route("/{rest:path}", methods=ALL_METHODS, include_in_schema=False, name="api_not_found")
    async def api_not_found(rest: str) -> None:
        raise not_found(f"route /api/{rest} not found")

    return router
