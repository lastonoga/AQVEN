import asyncio
import os
import socket
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI
from openai_codex.client import CodexClient
from openai_codex.models import JsonObject
from pydantic import SecretStr

from aqven.chat.codex_backend import CodexAgentBackend
from aqven.chat.codex_policy import codex_config
from aqven.chat.project_rules import project_rules
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.ports.chat import ChatEvent, ChatMessageRequest, ChatSessionOptions, ChatTextDelta, ChatTurnFinished
from aqven.runtime.address import ClientOpId
from aqven.server.mcp import McpEndpoint, build_mcp_endpoint
from aqven.server.security import AccessPolicy

TOKEN = "codex-integration-token"


def mcp_application(endpoint: McpEndpoint) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        async with endpoint.lifespan(app):
            yield

    app = FastAPI(lifespan=lifespan)
    endpoint.mount(app)
    return app


@pytest.mark.asyncio
async def test_codex_app_server_starts_thread_with_required_aqven_mcp(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("Follow the project checks.", encoding="utf-8")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port: int = probe.getsockname()[1]
    endpoint = build_mcp_endpoint((), AccessPolicy(token=TOKEN))
    server = uvicorn.Server(uvicorn.Config(mcp_application(endpoint), host="127.0.0.1", port=port, log_level="warning"))
    serving = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)

    config = codex_config(tmp_path, f"http://127.0.0.1:{port}/mcp/", TOKEN, "default")
    client = CodexClient(config, approval_handler=lambda method, params: {"decision": "decline"})
    try:
        await asyncio.to_thread(client.start)
        await asyncio.to_thread(client.initialize)
        options: JsonObject = {
            "cwd": str(tmp_path),
            "approvalPolicy": "on-request",
            "developerInstructions": project_rules(tmp_path),
        }
        started = await asyncio.wait_for(asyncio.to_thread(client.thread_start, options), 20)
        assert started.thread.id
        if os.environ.get("AQVEN_CODEX_LIVE") == "1":
            journal = SqliteChatJournal(tmp_path / "chat.sqlite")
            backend = CodexAgentBackend(
                journal,
                tmp_path,
                f"http://127.0.0.1:{port}/mcp/",
                SecretStr(TOKEN),
            )
            try:
                session = await backend.start_session(
                    ChatSessionOptions(project_root=str(tmp_path), mcp_url=f"http://127.0.0.1:{port}/mcp/")
                )
                events = backend.events(session.session_id)
                await backend.send_message(
                    session.session_id,
                    ChatMessageRequest(text="Reply with OK only. Do not use tools.", client_op_id=ClientOpId("live-1")),
                )

                async def finished_turn() -> list[ChatEvent]:
                    seen: list[ChatEvent] = []
                    async for event in events:
                        seen.append(event)
                        if isinstance(event, ChatTurnFinished):
                            break
                    return seen

                seen = await asyncio.wait_for(finished_turn(), 120)
                assert any(isinstance(event, ChatTextDelta) and event.delta for event in seen)
                assert isinstance(seen[-1], ChatTurnFinished) and seen[-1].stop_reason == "end_turn"
                stored = journal.get_session(session.session_id)
                assert stored is not None and stored.backend_session_id is not None
                await backend.aclose()
                restored = CodexAgentBackend(
                    journal,
                    tmp_path,
                    f"http://127.0.0.1:{port}/mcp/",
                    SecretStr(TOKEN),
                )
                try:
                    later = restored.events(session.session_id, stored.session.last_seq)
                    await restored.send_message(
                        session.session_id,
                        ChatMessageRequest(
                            text="Reply with OK only. Do not use tools.", client_op_id=ClientOpId("live-2")
                        ),
                    )

                    async def resumed_turn() -> list[ChatEvent]:
                        result: list[ChatEvent] = []
                        async for event in later:
                            result.append(event)
                            if isinstance(event, ChatTurnFinished):
                                break
                        return result

                    resumed = await asyncio.wait_for(resumed_turn(), 120)
                    assert any(isinstance(event, ChatTextDelta) and event.delta for event in resumed)
                    assert isinstance(resumed[-1], ChatTurnFinished) and resumed[-1].stop_reason == "end_turn"
                finally:
                    await restored.aclose()
            finally:
                await backend.aclose()
                journal.close()
    finally:
        await asyncio.to_thread(client.close)
        server.should_exit = True
        await serving
