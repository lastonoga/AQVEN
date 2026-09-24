from collections.abc import AsyncIterable
from typing import Annotated, Final

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent

from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.routes.runs import event_cursor
from aqven.server.spec_channel import SpecEvent

STREAM_SUMMARY: Final = "Server-sent stream of project changes: spec files and research"
STREAM_DESCRIPTION: Final = (
    "A text/event-stream that stays open and pushes a frame per spec change and per research fact: a series "
    "started, its progress at most once a second, a status change, a finding written, an experiment's files "
    "changed. It is not a schema document and a plain request to it never completes. Each frame carries one "
    "SpecEvent as data, its type as the event name and its seq as the id; resume with after_seq or "
    "Last-Event-ID. The JSON Schema of every event is at GET /api/schemas/events."
)


def spec_frame(event: SpecEvent) -> ServerSentEvent:
    return ServerSentEvent(data=event, event=event.type, id=str(event.seq))


def build_events_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get(
        "/events/spec",
        response_class=EventSourceResponse,
        operation_id="spec_events",
        summary=STREAM_SUMMARY,
        description=STREAM_DESCRIPTION,
        openapi_extra=rest_only("sse transport"),
    )
    async def spec_events(start: Annotated[int, Depends(event_cursor)]) -> AsyncIterable[ServerSentEvent]:
        async for event in context.hub.follow(start):
            yield spec_frame(event)

    return router
