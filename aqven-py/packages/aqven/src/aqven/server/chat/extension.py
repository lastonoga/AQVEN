from collections.abc import AsyncGenerator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, FastAPI
from pydantic import SecretStr

from aqven.chat.claude_backend import ClaudeChat, create_claude_chat
from aqven.server.chat.router import ChatRouteContext, build_chat_router

type ChatLifespan = Callable[[FastAPI], AbstractAsyncContextManager[None]]


@dataclass(frozen=True, slots=True)
class ChatServerParts:
    chat: ClaudeChat
    router: APIRouter
    lifespan: ChatLifespan


def claude_chat_parts(project_root: Path, mcp_url: str, access_token: SecretStr) -> ChatServerParts:
    chat = create_claude_chat(project_root, access_token)
    router = build_chat_router(chat.backend, chat.journal, ChatRouteContext(project_root, mcp_url))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        try:
            yield
        finally:
            await chat.aclose()

    return ChatServerParts(chat, router, lifespan)
