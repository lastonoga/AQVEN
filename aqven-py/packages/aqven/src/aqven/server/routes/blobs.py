from collections.abc import AsyncIterator
from typing import Annotated, Final

from fastapi import APIRouter, File, UploadFile
from starlette.responses import FileResponse

from aqven.runtime.values import BlobUploaded
from aqven.server.blobs import BlobMeta, uploaded
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES, not_found

CHUNK_BYTES: Final = 1024 * 1024
IMMUTABLE: Final = "private, max-age=31536000, immutable"
BLOB_READ_METHODS: Final = (("GET", "blob_download"), ("HEAD", "blob_head"))
BLOB_RESPONSES: Final[dict[int | str, dict[str, object]]] = {
    **ERROR_RESPONSES,
    200: {"content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}},
    206: {"description": "Partial Content"},
    416: {"description": "Range Not Satisfiable"},
}


async def upload_chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while chunk := await upload.read(CHUNK_BYTES):
        yield chunk


def build_blobs_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.post("/blobs", status_code=201, operation_id="blob_upload", openapi_extra=rest_only("studio uploads media"))
    async def upload_blob(file: Annotated[UploadFile, File()]) -> BlobUploaded:
        media_type = file.content_type or ""
        meta = await context.blobs.store(upload_chunks(file), media_type, file.filename)
        return uploaded(meta)

    @router.get("/blobs/{blob_id}/meta", operation_id="blob_meta", openapi_extra=rest_only("blob metadata"))
    async def blob_meta(blob_id: str) -> BlobMeta:
        found = await context.blobs.locate(blob_id)
        if found is None:
            raise not_found(f"blob {blob_id} not found")
        return found.meta

    async def download_blob(blob_id: str) -> FileResponse:
        found = await context.blobs.locate(blob_id)
        if found is None:
            raise not_found(f"blob {blob_id} not found")
        headers = {
            "ETag": f'"{found.meta.blob_id}"',
            "Cache-Control": IMMUTABLE,
            "X-Content-Type-Options": "nosniff",
        }
        return FileResponse(found.path, media_type=found.meta.media_type, headers=headers)

    for method, operation_id in BLOB_READ_METHODS:
        router.add_api_route(
            "/blobs/{blob_id}",
            download_blob,
            methods=[method],
            operation_id=operation_id,
            response_class=FileResponse,
            responses=BLOB_RESPONSES,
            openapi_extra=rest_only("media bytes with range"),
        )

    return router
