from collections.abc import AsyncGenerator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, FastAPI
from pydantic import SecretStr

from aqven.chat.backend_registry import BackendRegistry
from aqven.chat.backend_selection import BackendSelection, BackendSettingValues
from aqven.chat.claude_backend import ClaudeChat, create_claude_chat
from aqven.chat.codex_backend import CodexAgentBackend
from aqven.server.chat.router import ChatRouteContext, build_chat_router

type ChatLifespan = Callable[[FastAPI], AbstractAsyncContextManager[None]]


@dataclass(frozen=True, slots=True)
class ChatServerParts:
    chat: ClaudeChat
    codex: CodexAgentBackend
    router: APIRouter
    lifespan: ChatLifespan


def studio_chat_parts(
    project_root: Path,
    mcp_url: str,
    access_token: SecretStr,
    settings: BackendSettingValues,
    allowed_tools: tuple[str, ...] = (),
) -> ChatServerParts:
    chat = create_claude_chat(project_root, access_token, allowed_tools)
    codex = CodexAgentBackend(chat.journal, project_root, mcp_url, access_token)
    registry = BackendRegistry({"claude": chat.backend, "codex": codex}, BackendSelection(settings))
    router = build_chat_router(registry, chat.journal, ChatRouteContext(project_root, mcp_url))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        try:
            yield
        finally:
            await codex.aclose()
            await chat.aclose()

    return ChatServerParts(chat, codex, router, lifespan)
