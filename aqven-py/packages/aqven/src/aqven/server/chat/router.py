from collections.abc import AsyncIterable, Callable, Coroutine, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Final

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.routing import APIRoute
from fastapi.sse import EventSourceResponse, ServerSentEvent

from aqven.chat.errors import ChatFailure, ChatFailureCode
from aqven.chat.journal import ChatSessionDirectory
from aqven.ports.chat import (
    AgentBackend,
    ApprovalAnswer,
    ApprovalDecision,
    ChatApprovalId,
    ChatEvent,
    ChatMessageRequest,
    ChatPermissionMode,
    ChatSession,
    ChatSessionId,
    ChatSessionOptions,
    ChatTurnId,
    LoginStatus,
)
from aqven.runtime.address import RequestModel, ResourceModel
from aqven.runtime.runs import Page
from aqven.server.context import rest_only
from aqven.server.errors import ERROR_RESPONSES, ApiErrorCode, ApiFailure
from aqven.server.routes.runs import event_cursor

CHAT_PREFIX: Final[str] = "/api/chat"
CHAT_REST_ONLY: Final[str] = "studio chat agent"
CHAT_SSE_REST_ONLY: Final[str] = "sse transport"
CHAT_API_CODES: Final[Mapping[ChatFailureCode, ApiErrorCode]] = {
    "NOT_FOUND": "NOT_FOUND",
    "CHAT_STATE_CONFLICT": "CHAT_STATE_CONFLICT",
    "NOT_WAITING": "NOT_WAITING",
}


def api_failure(failure: ChatFailure) -> ApiFailure:
    return ApiFailure(CHAT_API_CODES[failure.code], failure.message)


class ChatRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[object, object, Response]]:
        handler = super().get_route_handler()

        async def translated(request: Request) -> Response:
            try:
                return await handler(request)
            except ChatFailure as failure:
                raise api_failure(failure) from failure

        return translated


@dataclass(frozen=True, slots=True)
class ChatRouteContext:
    project_root: Path
    mcp_url: str


class ChatSessionCreate(RequestModel):
    model: str | None = None
    permission_mode: ChatPermissionMode = "default"
    resume_session_id: ChatSessionId | None = None


class ChatTurnAccepted(ResourceModel):
    session_id: ChatSessionId
    turn_id: ChatTurnId


class ChatApprovalReply(RequestModel):
    decision: ApprovalDecision
    message: str | None = None


def chat_frame(event: ChatEvent) -> ServerSentEvent:
    return ServerSentEvent(data=event, event=event.type, id=str(event.seq))


def build_chat_router(backend: AgentBackend, sessions: ChatSessionDirectory, context: ChatRouteContext) -> APIRouter:
    router = APIRouter(prefix=CHAT_PREFIX, responses=ERROR_RESPONSES, route_class=ChatRoute)

    def session_view(session_id: ChatSessionId) -> ChatSession:
        stored = sessions.get_session(session_id)
        if stored is None:
            raise ChatFailure("NOT_FOUND", f"chat session {session_id} does not exist")
        return stored.session

    def existing_session(session_id: str) -> ChatSession:
        return session_view(ChatSessionId(session_id))

    @router.get("/status", operation_id="chat_login_status", openapi_extra=rest_only(CHAT_REST_ONLY))
    async def chat_login_status() -> LoginStatus:
        return await backend.login_status()

    @router.get("/sessions", operation_id="chat_session_list", openapi_extra=rest_only(CHAT_REST_ONLY))
    async def chat_session_list() -> Page[ChatSession]:
        items = sessions.list_sessions()
        return Page[ChatSession](items=items, next_cursor=None, total_estimate=len(items))

    @router.post(
        "/sessions",
        operation_id="chat_session_create",
        status_code=status.HTTP_201_CREATED,
        openapi_extra=rest_only(CHAT_REST_ONLY),
    )
    async def chat_session_create(body: ChatSessionCreate) -> ChatSession:
        options = ChatSessionOptions(
            project_root=str(context.project_root),
            mcp_url=context.mcp_url,
            model=body.model,
            permission_mode=body.permission_mode,
            resume_session_id=body.resume_session_id,
        )
        return await backend.start_session(options)

    @router.get("/sessions/{session_id}", operation_id="chat_session_get", openapi_extra=rest_only(CHAT_REST_ONLY))
    async def chat_session_get(session: Annotated[ChatSession, Depends(existing_session)]) -> ChatSession:
        return session

    @router.delete("/sessions/{session_id}", operation_id="chat_session_close", openapi_extra=rest_only(CHAT_REST_ONLY))
    async def chat_session_close(session: Annotated[ChatSession, Depends(existing_session)]) -> ChatSession:
        await backend.close_session(session.session_id)
        return session_view(session.session_id)

    @router.post(
        "/sessions/{session_id}/messages",
        operation_id="chat_message_send",
        status_code=status.HTTP_202_ACCEPTED,
        openapi_extra=rest_only(CHAT_REST_ONLY),
    )
    async def chat_message_send(
        session: Annotated[ChatSession, Depends(existing_session)], body: ChatMessageRequest
    ) -> ChatTurnAccepted:
        turn_id = await backend.send_message(session.session_id, body)
        return ChatTurnAccepted(session_id=session.session_id, turn_id=turn_id)

    @router.get(
        "/sessions/{session_id}/events",
        response_class=EventSourceResponse,
        operation_id="chat_events",
        openapi_extra=rest_only(CHAT_SSE_REST_ONLY),
    )
    async def chat_events(
        session: Annotated[ChatSession, Depends(existing_session)], start: Annotated[int, Depends(event_cursor)]
    ) -> AsyncIterable[ServerSentEvent]:
        async for event in backend.events(session.session_id, start):
            yield chat_frame(event)

    @router.post(
        "/sessions/{session_id}/approvals/{approval_id}",
        operation_id="chat_approval_answer",
        openapi_extra=rest_only(CHAT_REST_ONLY),
    )
    async def chat_approval_answer(
        session: Annotated[ChatSession, Depends(existing_session)], approval_id: str, body: ChatApprovalReply
    ) -> ChatSession:
        answer = ApprovalAnswer(approval_id=ChatApprovalId(approval_id), decision=body.decision, message=body.message)
        await backend.answer_approval(session.session_id, answer)
        return session_view(session.session_id)

    @router.post(
        "/sessions/{session_id}/interrupt", operation_id="chat_interrupt", openapi_extra=rest_only(CHAT_REST_ONLY)
    )
    async def chat_interrupt(session: Annotated[ChatSession, Depends(existing_session)]) -> ChatSession:
        await backend.interrupt(session.session_id)
        return session_view(session.session_id)

    return router
