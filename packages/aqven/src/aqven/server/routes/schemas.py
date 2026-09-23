from typing import Final

from fastapi import APIRouter

from aqven.server.context import rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.schemas import (
    EventCatalog,
    SpecSchema,
    SpecSchemaCatalog,
    event_catalog,
    spec_schema,
    spec_schema_catalog,
)
from aqven.spec import SpecKind

EVENTS_SUMMARY: Final = "JSON Schema of every event of the spec, run, chat and series channels"
EVENTS_DESCRIPTION: Final = (
    "A schema document, not a stream: schemas.spec, schemas.run, schemas.chat and schemas.series map an "
    "event type to the JSON Schema of that event. The spec, run, chat and series arrays stay empty and exist "
    "only so the generated client can name each channel union. Live events arrive on GET /api/events/spec, "
    "GET /api/runs/{run_id}/events, GET /api/chat/sessions/{session_id}/events and "
    "GET /api/series/{series_id}/events."
)
CATALOG_SUMMARY: Final = "JSON Schema of every definition kind for the editor"
CATALOG_DESCRIPTION: Final = (
    "The same schemas aqven schema writes to .aqven/schema/<kind>.schema.json. Each entry carries the "
    "schema of one kind and, for Node and Type, the schema of every variant under variants."
)
SCHEMA_SUMMARY: Final = "JSON Schema of one definition kind"
SCHEMA_DESCRIPTION: Final = (
    "An unknown kind fails validation of the path parameter and answers 422 REQUEST_INVALID; the known "
    "kinds are the values of SpecKind."
)


def build_schemas_router() -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get(
        "/schemas/events",
        operation_id="event_catalog",
        summary=EVENTS_SUMMARY,
        description=EVENTS_DESCRIPTION,
        openapi_extra=rest_only("event schemas"),
    )
    async def read_event_catalog() -> EventCatalog:
        return event_catalog()

    @router.get(
        "/spec-schemas",
        operation_id="spec_schema_list",
        summary=CATALOG_SUMMARY,
        description=CATALOG_DESCRIPTION,
        openapi_extra=rest_only("editor schemas"),
    )
    async def read_spec_schemas() -> SpecSchemaCatalog:
        return spec_schema_catalog()

    @router.get(
        "/spec-schemas/{kind}",
        operation_id="spec_schema_get",
        summary=SCHEMA_SUMMARY,
        description=SCHEMA_DESCRIPTION,
        openapi_extra=rest_only("editor schema"),
    )
    async def read_spec_schema(kind: SpecKind) -> SpecSchema:
        return spec_schema(kind)

    return router
