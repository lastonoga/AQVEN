import asyncio
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
from aqven.chat.feed import ChatSignals
from aqven.chat.server_guard import ServerProcess, ServerProcessGuard
from aqven.chat.sqlite_journal import utc_now
from aqven.chat.sqlite_transcripts import SqliteChatTranscripts
from aqven.chat.turn_settling import TurnSettler
from aqven.ports.chat import ChatEffort, ChatPermissionMode
from aqven.server.chat.router import ChatEventFeed, ChatRouteContext, build_chat_router


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
    feed: ChatEventFeed


def studio_chat_parts(
    project_root: Path,
    mcp_url: str,
    access_token: SecretStr,
    settings: BackendSettingValues,
    allowed_tools: tuple[str, ...] = (),
    defaults: ChatSessionDefaults | None = None,
    shutdown_signal: asyncio.Event | None = None,
) -> ChatServerParts:
    server = ServerProcess.current(mcp_url)
    chat = create_claude_chat(project_root, access_token, allowed_tools, shutdown_signal=shutdown_signal, server=server)
    codex = CodexAgentBackend(
        chat.journal,
        project_root,
        mcp_url,
        access_token,
        shutdown_signal=shutdown_signal,
        command_guard=ServerProcessGuard(server),
    )
    registry = BackendRegistry({"claude": chat.backend, "codex": codex}, BackendSelection(settings))
    chosen = defaults or ChatSessionDefaults()
    transcripts = SqliteChatTranscripts.for_project(project_root)
    router = build_chat_router(
        registry,
        chat.journal,
        transcripts,
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
        TurnSettler(chat.journal, ChatSignals(), utc_now).sweep("server_restarted")
        try:
            yield
        finally:
            await codex.aclose()
            await chat.aclose()
            transcripts.close()

    return ChatServerParts(chat, codex, router, lifespan, ChatEventFeed(registry, chat.journal))
