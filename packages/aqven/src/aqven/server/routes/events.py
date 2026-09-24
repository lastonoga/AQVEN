from collections.abc import AsyncIterable
from typing import Annotated, Final

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent

from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.event_feeds import FOLLOW_GRAMMAR, Follow, core_feeds, followed, follows_of
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
FOLLOW_SUMMARY: Final = "Server-sent stream that follows several feeds over one connection"
FOLLOW_DESCRIPTION: Final = (
    "A text/event-stream that stays open and multiplexes the feeds named by repeated follow parameters, each "
    f"written {FOLLOW_GRAMMAR}: spec for project changes, run:<run_id> for one run, chat:<session_id> for one "
    "chat session. A browser holds a handful of connections per server, so Studio follows everything a tab "
    "needs here instead of opening a stream per feed. Each frame carries one event of its feed as data and the "
    "followed name, without the cursor, as the event name. Frames carry no id: to resume, reconnect with each "
    "feed's last seq after @. A feed this server does not serve, or whose key names no run or session, ends "
    "quietly and the others go on. It is not a schema document; the per-feed streams stay available and the JSON "
    "Schema of every event is at GET /api/schemas/events."
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

    feeds = {**core_feeds(context.hub, context.facade), **context.feeds}

    @router.get(
        "/events",
        response_class=EventSourceResponse,
        operation_id="events_follow",
        summary=FOLLOW_SUMMARY,
        description=FOLLOW_DESCRIPTION,
        openapi_extra=rest_only("sse transport"),
    )
    async def follow_events(
        follows: Annotated[tuple[Follow, ...], Depends(follows_of(feeds))],
    ) -> AsyncIterable[ServerSentEvent]:
        async for frame in followed(feeds, follows):
            yield frame

    return router
