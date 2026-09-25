import asyncio
import json
from pathlib import Path

import pytest
from claude_agent_sdk import ClaudeAgentOptions, CLINotFoundError, PermissionResultAllow, PermissionResultDeny

from aqven.chat.agent_plugin import claude_plugins, claude_skills
from aqven.chat.errors import ChatFailure
from aqven.chat.host_block import HostFacts, host_block
from aqven.chat.testing import ApprovalStep, ScriptedClaudeClient, ScriptedClientFactory
from aqven.ports.chat import (
    AgentBackend,
    ApprovalAnswer,
    ChatApprovalId,
    ChatApprovalRequested,
    ChatApprovalResolved,
    ChatErrorRaised,
    ChatEvent,
    ChatMessageRequest,
    ChatSessionId,
    ChatStatus,
    ChatToolCallFinished,
    ChatTurnFinished,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId

from .fixtures import (
    MCP_TOKEN,
    MCP_URL,
    MODEL,
    SDK_SESSION,
    chat_harness,
    edit_and_check_turn,
    next_event,
    streamed_answer_turn,
    until_turn_finished,
)


def message(text: str, op: str) -> ChatMessageRequest:
    return ChatMessageRequest(text=text, client_op_id=ClientOpId(op))


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def test_backend_satisfies_agent_backend_port(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())
    backend: AgentBackend = harness.backend

    assert backend.kind == "claude"
    assert asyncio.run(backend.login_status()).state == "logged_in"
    assert harness.login.calls == 1


def test_session_options_isolate_claude_and_route_mcp_with_bearer_token(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("Run aqven_check after every edit.", encoding="utf-8")
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[ClaudeAgentOptions, str, int]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("hello", "op-1"))
        await until_turn_finished(events)
        options = factory.clients[0].options
        assert isinstance(options.mcp_servers, Path)
        config_text = options.mcp_servers.read_text(encoding="utf-8")
        config_mode = options.mcp_servers.stat().st_mode & 0o777
        await harness.backend.aclose()
        return options, config_text, config_mode

    options, config_text, config_mode = asyncio.run(scenario())

    assert options.cwd == tmp_path
    assert options.cli_path == "/usr/local/bin/claude"
    assert options.model == MODEL
    assert options.permission_mode == "default"
    assert options.setting_sources == []
    assert options.strict_mcp_config is True
    assert options.include_partial_messages is True
    assert options.can_use_tool is not None
    assert options.thinking == {"type": "enabled", "budget_tokens": 16000, "display": "summarized"}
    assert json.loads(config_text) == {
        "mcpServers": {"aqven": {"type": "http", "url": MCP_URL, "headers": {"Authorization": f"Bearer {MCP_TOKEN}"}}}
    }
    assert config_mode == 0o600
    assert isinstance(options.mcp_servers, Path) and not options.mcp_servers.exists()
    assert "Read(**/.env)" in options.disallowed_tools
    assert options.hooks is not None and "PreToolUse" in options.hooks
    assert options.env == {"CLAUDE_AGENT_SDK_CLIENT_APP": "aqven-studio"}
    assert options.system_prompt == {
        "type": "preset",
        "preset": "claude_code",
        "append": f"Run aqven_check after every edit.\n\n{host_block('claude', HostFacts.of(tmp_path, MCP_URL))}",
    }
    assert options.plugins == claude_plugins()
    assert options.skills == claude_skills()
    assert options.resume is None


def test_turn_streams_events_and_routes_approvals_to_studio(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([edit_and_check_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        turn_id = await harness.backend.send_message(session.session_id, message("add return intent", "op-1"))
        edit_request, before_edit = await next_event(events, ChatApprovalRequested)
        await harness.backend.answer_approval(
            session.session_id, ApprovalAnswer(approval_id=edit_request.approval_id, decision="allow")
        )
        check_request, before_check = await next_event(events, ChatApprovalRequested)
        await harness.backend.answer_approval(
            session.session_id,
            ApprovalAnswer(approval_id=check_request.approval_id, decision="deny", message="not now"),
        )
        _, rest = await until_turn_finished(events)
        await harness.backend.aclose()
        seen = [*before_edit, *before_check, *rest]
        assert all(event.turn_id == turn_id for event in seen)
        return seen

    seen = asyncio.run(scenario())
    client = factory.clients[0]

    assert [event.seq for event in seen] == list(range(1, len(seen) + 1))
    assert isinstance(seen[0], ChatTurnStarted) and seen[0].text == "add return intent"
    requests = of_type(seen, ChatApprovalRequested)
    assert [(request.tool_call_id, request.tool_name, request.reason) for request in requests] == [
        ("toolu_edit", "Edit", "Edit needs approval"),
        ("toolu_check", "aqven_check", None),
    ]
    assert [(event.decision, event.resolved_by) for event in of_type(seen, ChatApprovalResolved)] == [
        ("allow", "user"),
        ("deny", "user"),
    ]
    assert [type(result) for result in client.permissions] == [PermissionResultAllow, PermissionResultDeny]
    denied = client.permissions[1]
    assert isinstance(denied, PermissionResultDeny) and (denied.message, denied.interrupt) == ("not now", False)
    statuses = {event.tool_call_id: event.status for event in of_type(seen, ChatToolCallFinished)}
    assert statuses == {"toolu_edit": "ok", "toolu_check": "denied", "toolu_bash": "ok"}
    assert "waiting_approval" in [event.state for event in of_type(seen, ChatStatus)]
    assert of_type(seen, ChatStatus)[-1].state == "idle"
    assert of_type(seen, ChatTurnFinished)[0].stop_reason == "end_turn"
    stored = harness.journal.get_session(seen[0].session_id)
    assert stored is not None and stored.backend_session_id == SDK_SESSION
    assert client.prompts == ["add return intent"]


def test_turn_events_name_the_backend_and_the_model_that_produced_them(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path), streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[list[ChatEvent], list[ChatEvent]]:
        session = await harness.backend.start_session(harness.options(model=None))
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("one", "op-1"))
        _, first = await until_turn_finished(events)
        await harness.backend.send_message(session.session_id, message("two", "op-2"))
        _, second = await until_turn_finished(events)
        await harness.backend.aclose()
        return first, second

    first, second = asyncio.run(scenario())
    opened = of_type(first, ChatTurnStarted)[0]
    closed = of_type(first, ChatTurnFinished)[0]
    reopened = of_type(second, ChatTurnStarted)[0]

    assert (opened.backend, opened.model) == ("claude", None)
    assert (closed.backend, closed.model) == ("claude", MODEL)
    assert (reopened.backend, reopened.model) == ("claude", MODEL)


def test_message_operation_is_idempotent(tmp_path: Path) -> None:
    turn = [ApprovalStep(tool_name="Bash", tool_use_id="toolu_wait"), *streamed_answer_turn(tmp_path)]
    factory = ScriptedClientFactory([turn])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[str, str]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        first = await harness.backend.send_message(session.session_id, message("one", "op-1"))
        request, _ = await next_event(events, ChatApprovalRequested)
        repeated = await harness.backend.send_message(session.session_id, message("one", "op-1"))
        await harness.backend.answer_approval(
            session.session_id, ApprovalAnswer(approval_id=request.approval_id, decision="allow")
        )
        await until_turn_finished(events)
        await harness.backend.aclose()
        return first, repeated

    first, repeated = asyncio.run(scenario())

    assert first == repeated
    assert factory.clients[0].prompts == ["one"]
    assert factory.clients[0].queued == []


def test_interrupt_resolves_pending_approval_and_finishes_turn(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([edit_and_check_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("edit", "op-1"))
        _, before = await next_event(events, ChatApprovalRequested)
        await harness.backend.interrupt(session.session_id)
        _, after = await until_turn_finished(events)
        with pytest.raises(ChatFailure) as missing:
            await harness.backend.answer_approval(
                session.session_id, ApprovalAnswer(approval_id=_approval_of(before), decision="allow")
            )
        assert missing.value.code == "NOT_WAITING"
        await harness.backend.aclose()
        return [*before, *after]

    seen = asyncio.run(scenario())

    assert [(event.decision, event.resolved_by) for event in of_type(seen, ChatApprovalResolved)] == [
        ("deny", "interrupt")
    ]
    assert "interrupting" in [event.state for event in of_type(seen, ChatStatus)]
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["interrupted"]
    assert factory.clients[0].interrupts == 1


def _approval_of(events: list[ChatEvent]) -> ChatApprovalId:
    return of_type(events, ChatApprovalRequested)[0].approval_id


def test_approval_timeout_denies_and_interrupts(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([edit_and_check_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory, approval_timeout_seconds=0.05)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("edit", "op-1"))
        _, seen = await until_turn_finished(events)
        await harness.backend.aclose()
        return seen

    seen = asyncio.run(scenario())
    permission = factory.clients[0].permissions[0]

    assert isinstance(permission, PermissionResultDeny) and permission.interrupt
    assert [event.resolved_by for event in of_type(seen, ChatApprovalResolved)] == ["interrupt"]
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["interrupted"]


def test_close_stops_client_ends_stream_and_resume_reuses_backend_session(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([streamed_answer_turn(tmp_path)], [streamed_answer_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> tuple[str, ChatSessionId, int]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("first", "op-1"))
        await until_turn_finished(events)
        await harness.backend.close_session(session.session_id)
        async with asyncio.timeout(2.0):
            tail = [event async for event in events]
        with pytest.raises(ChatFailure) as closed:
            await harness.backend.send_message(session.session_id, message("late", "op-2"))
        reopened = await harness.backend.start_session(
            harness.options().model_copy(update={"resume_session_id": session.session_id})
        )
        resumed_events = harness.backend.events(reopened.session_id, reopened.last_seq)
        await harness.backend.send_message(reopened.session_id, message("again", "op-3"))
        await until_turn_finished(resumed_events)
        await harness.backend.aclose()
        return closed.value.code, reopened.session_id, len(tail)

    code, reopened_id, tail_length = asyncio.run(scenario())

    assert code == "CHAT_STATE_CONFLICT"
    assert tail_length == 0
    assert [client.disconnects for client in factory.clients] == [1, 1]
    assert factory.clients[1].options.resume == SDK_SESSION
    stored = harness.journal.get_session(reopened_id)
    assert stored is not None and not stored.closed


class FailingClient(ScriptedClaudeClient):
    async def connect(self) -> None:
        raise CLINotFoundError(f"Claude Code not found; token {MCP_TOKEN} must not leak")


def test_connect_failure_is_reported_as_backend_unavailable_without_secrets(tmp_path: Path) -> None:
    def failing_factory(options: ClaudeAgentOptions) -> ScriptedClaudeClient:
        return FailingClient(options, ())

    harness = chat_harness(tmp_path, failing_factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("hi", "op-1"))
        _, seen = await until_turn_finished(events)
        await harness.backend.aclose()
        return seen

    seen = asyncio.run(scenario())
    errors = of_type(seen, ChatErrorRaised)

    assert [(error.code, error.retryable) for error in errors] == [("backend_unavailable", False)]
    assert MCP_TOKEN not in errors[0].message
    assert "***" in errors[0].message
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["error"]


def test_cli_exit_mid_turn_fails_turn_and_reconnects_next_time(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([[ApprovalStep(tool_name="Bash", tool_use_id="toolu_hang")]])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("hang", "op-1"))
        await next_event(events, ChatApprovalRequested)
        factory.clients[0].push(None)
        _, seen = await until_turn_finished(events)
        await harness.backend.send_message(session.session_id, message("retry", "op-2"))
        await asyncio.sleep(0.05)
        await harness.backend.aclose()
        return seen

    seen = asyncio.run(scenario())

    assert [error.code for error in of_type(seen, ChatErrorRaised)] == ["backend_unavailable"]
    assert [event.stop_reason for event in of_type(seen, ChatTurnFinished)] == ["error"]
    assert len(factory.clients) == 2
    assert factory.clients[1].prompts == ["retry"]


def test_unknown_session_is_not_found(tmp_path: Path) -> None:
    harness = chat_harness(tmp_path, ScriptedClientFactory())

    async def scenario() -> str:
        with pytest.raises(ChatFailure) as failure:
            await harness.backend.interrupt(ChatSessionId("missing"))
        return failure.value.code

    assert asyncio.run(scenario()) == "NOT_FOUND"
