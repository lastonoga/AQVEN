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
from aqven.ports.chat import ChatEffort, ChatPermissionMode
from aqven.server.chat.router import ChatRouteContext, build_chat_router


@dataclass(frozen=True, slots=True)
class ChatSessionDefaults:
    model: str | None = None
    effort: ChatEffort | None = None
    permission_mode: ChatPermissionMode = "default"

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
    trust_project: bool = False,
    defaults: ChatSessionDefaults | None = None,
) -> ChatServerParts:
    chat = create_claude_chat(project_root, access_token, allowed_tools, trust_project)
    codex = CodexAgentBackend(chat.journal, project_root, mcp_url, access_token)
    registry = BackendRegistry({"claude": chat.backend, "codex": codex}, BackendSelection(settings))
    chosen = defaults or ChatSessionDefaults()
    router = build_chat_router(
        registry,
        chat.journal,
        ChatRouteContext(
            project_root,
            mcp_url,
            default_model=chosen.model,
            default_effort=chosen.effort,
            default_permission_mode=chosen.permission_mode,
        ),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        try:
            yield
        finally:
            await codex.aclose()
            await chat.aclose()

    return ChatServerParts(chat, codex, router, lifespan)
