from collections.abc import AsyncIterable
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import Field

from aqven.ports.chat import ChatEvent
from aqven.runtime.address import ResourceModel
from aqven.runtime.events import RunEvent
from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.routes.runs import event_cursor
from aqven.server.spec_channel import SpecEvent


class EventCatalog(ResourceModel):
    spec: list[SpecEvent]
    run: list[RunEvent]
    chat: list[ChatEvent] = Field(default_factory=list[ChatEvent])


def spec_frame(event: SpecEvent) -> ServerSentEvent:
    return ServerSentEvent(data=event, event=event.type, id=str(event.seq))


def build_events_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get(
        "/events/spec",
        response_class=EventSourceResponse,
        operation_id="spec_events",
        openapi_extra=rest_only("sse transport"),
    )
    async def spec_events(start: Annotated[int, Depends(event_cursor)]) -> AsyncIterable[ServerSentEvent]:
        async for event in context.hub.follow(start):
            yield spec_frame(event)

    @router.get("/schemas/events", operation_id="event_catalog", openapi_extra=rest_only("event schemas"))
    async def event_catalog() -> EventCatalog:
        return EventCatalog(spec=[], run=[], chat=[])

    return router
