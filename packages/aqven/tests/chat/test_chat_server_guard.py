import asyncio
import os
from pathlib import Path
from typing import Final

import pytest
from claude_agent_sdk import PermissionResultDeny, ToolUseBlock
from claude_agent_sdk.types import HookContext, PreToolUseHookInput
from openai_codex.client import ApprovalHandler, CodexClient, CodexConfig
from openai_codex.models import Notification
from pydantic import JsonValue, SecretStr

from aqven.chat.claude_options import default_guard
from aqven.chat.codex_approvals import COMMAND_APPROVAL
from aqven.chat.codex_backend import CodexAgentBackend
from aqven.chat.env_guard import SECRET_FILE_REASON, GuardChain
from aqven.chat.server_guard import SERVER_PROCESS_REASON, ServerProcess, ServerProcessGuard
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.chat.testing import ApprovalStep, ScriptedClientFactory, ScriptStep
from aqven.ports.chat import ChatApprovalRequested, ChatMessageRequest, ChatSessionOptions
from aqven.runtime.address import ClientOpId, JsonObject

from .fixtures import assistant, chat_harness, init_message, result, tool_result, until_turn_finished
from .test_codex_backend import FakeCodexClient

SERVER: Final = ServerProcess(pid=78556, port=5181)
GUARD: Final = ServerProcessGuard(SERVER)
CHAIN: Final = GuardChain(default_guard(), (GUARD,))
HOOK_CONTEXT: Final = HookContext(signal=None)
OWNER_RESTART: Final = (
    "cd /Users/kirunya/Projects/my/my_flow && PID=$(curl -s http://127.0.0.1:5181/api/health | python3 -c "
    '"import json,sys;print(json.load(sys.stdin)[\'pid\'])" 2>/dev/null); echo "killing $PID"; kill $PID 2>/dev/null; '
    "sleep 6; nohup env -u AQVEN_STUDIO uv run aqven dev my_flow > /tmp/aqven_dev2.log 2>&1 & sleep 40"
)
BLOCKED: Final = (
    OWNER_RESTART,
    "kill 78556",
    "kill -9 78556",
    "kill -9 $(lsof -ti:5181)",
    "lsof -ti :5181 | xargs kill -9",
    "kill $(jq .pid .aqven/server.json)",
    'pkill -f "aqven dev"',
    "pkill -f python",
    "killall uvicorn",
    'kill $(pgrep -f "aqven serve")',
    "kill 0",
    "kill -9 -1",
    "kill -- -4242",
    "kill -s KILL 0",
    'python3 -c "import os, signal; os.kill(78556, signal.SIGTERM)"',
    'python3 -c "import os; os.killpg(os.getpgid(0), 9)"',
    "uv run aqven dev my_flow",
    "nohup aqven serve --port 5190 &",
    "aqven studio",
    "/usr/local/bin/aqven dev",
    "python -m aqven serve",
)
ALLOWED: Final = (
    "kill %1",
    "kill 12345",
    "kill -0 12345",
    "kill -l",
    'pkill -f "npm run dev"',
    "lsof -ti:3000 | xargs kill",
    "killall node",
    'grep -rn "aqven dev" docs',
    "aqven check",
    "uv run aqven run support_case --input case.json",
    "curl -s http://127.0.0.1:5181/api/health",
    "pytest -q packages/aqven/tests",
)


@pytest.mark.parametrize("command", BLOCKED)
def test_the_agent_may_not_kill_or_restart_its_server(command: str) -> None:
    assert GUARD.violation("Bash", {"command": command}) == SERVER_PROCESS_REASON


@pytest.mark.parametrize("command", ALLOWED)
def test_unrelated_processes_and_commands_stay_allowed(command: str) -> None:
    assert GUARD.violation("Bash", {"command": command}) is None


def test_only_shell_commands_are_inspected() -> None:
    assert GUARD.violation("Read", {"command": "kill 78556"}) is None
    assert GUARD.violation("Bash", {"command": ["kill", "78556"]}) is None


def test_without_a_known_server_restarts_and_health_lookups_are_still_refused() -> None:
    blind = ServerProcessGuard()

    assert blind.violation("Bash", {"command": "uv run aqven dev"}) == SERVER_PROCESS_REASON
    assert blind.violation("Bash", {"command": OWNER_RESTART}) == SERVER_PROCESS_REASON
    assert blind.violation("Bash", {"command": "kill 78556"}) is None


def test_the_running_server_protects_its_own_pid_and_port() -> None:
    current = ServerProcess.current("http://127.0.0.1:5181/mcp/")

    assert (current.pid, current.port) == (os.getpid(), 5181)


def hook_input(command: str) -> PreToolUseHookInput:
    return PreToolUseHookInput(
        session_id="s",
        transcript_path="/tmp/t.jsonl",
        cwd="/work",
        hook_event_name="PreToolUse",
        tool_name="Bash",
        tool_input={"command": command},
        tool_use_id="toolu_1",
    )


def test_the_hook_chain_refuses_server_kills_and_env_reads_in_every_mode() -> None:
    killing = asyncio.run(CHAIN.pre_tool_use(hook_input("kill 78556"), "toolu_1", HOOK_CONTEXT))
    reading = asyncio.run(CHAIN.pre_tool_use(hook_input("cat .env"), "toolu_1", HOOK_CONTEXT))
    harmless = asyncio.run(CHAIN.pre_tool_use(hook_input("ls"), "toolu_1", HOOK_CONTEXT))

    assert killing.get("hookSpecificOutput", {}).get("permissionDecisionReason") == SERVER_PROCESS_REASON
    assert reading.get("hookSpecificOutput", {}).get("permissionDecisionReason") == SECRET_FILE_REASON
    assert harmless == {}
    assert {"Read(**/.env)"} <= set(CHAIN.permission_rules(()))
    assert "Bash" in (CHAIN.hooks()["PreToolUse"][0].matcher or "")


def kill_turn(project_root: Path) -> list[ScriptStep]:
    arguments: dict[str, JsonValue] = {"command": OWNER_RESTART, "run_in_background": True}
    return [
        init_message(project_root),
        assistant("msg_kill", [ToolUseBlock(id="toolu_kill", name="Bash", input=arguments)]),
        ApprovalStep(tool_name="Bash", tool_use_id="toolu_kill", tool_input=arguments),
        tool_result("toolu_kill", SERVER_PROCESS_REASON, is_error=True),
        result(),
    ]


def test_a_manual_mode_restart_is_refused_without_asking_studio(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([kill_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory, guard=CHAIN)

    async def scenario() -> int:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(
            session.session_id, ChatMessageRequest(text="restart", client_op_id=ClientOpId("op-1"))
        )
        _, seen = await until_turn_finished(events)
        await harness.backend.aclose()
        return len([event for event in seen if isinstance(event, ChatApprovalRequested)])

    requests = asyncio.run(scenario())
    refused = factory.clients[0].permissions

    assert requests == 0
    assert [(type(item), getattr(item, "message", None)) for item in refused] == [
        (PermissionResultDeny, SERVER_PROCESS_REASON)
    ]


class ApprovalAskingCodexClient(FakeCodexClient):
    def __init__(self, config: CodexConfig, approval_handler: ApprovalHandler) -> None:
        super().__init__(config, approval_handler)
        self.ask = approval_handler
        self.answers: list[JsonObject] = []

    def next_turn_notification(self, turn_id: str) -> Notification:
        params: JsonObject = {"itemId": "command-1", "command": "kill -9 78556", "cwd": "/work"}
        self.answers.append(self.ask(COMMAND_APPROVAL, params))
        return super().next_turn_notification(turn_id)


def test_codex_escalation_to_kill_the_server_is_declined_without_asking_studio(tmp_path: Path) -> None:
    clients: list[ApprovalAskingCodexClient] = []

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = ApprovalAskingCodexClient(config, approval_handler)
        clients.append(client)
        return client

    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    backend = CodexAgentBackend(
        journal,
        tmp_path,
        "http://127.0.0.1:5181/mcp",
        SecretStr("token"),
        client_factory=factory,
        command_guard=GUARD,
    )

    async def scenario() -> int:
        session = await backend.start_session(
            ChatSessionOptions(project_root=str(tmp_path), mcp_url="http://127.0.0.1:5181/mcp")
        )
        events = backend.events(session.session_id)
        await backend.send_message(
            session.session_id, ChatMessageRequest(text="restart", client_op_id=ClientOpId("op-1"))
        )
        _, seen = await until_turn_finished(events)
        await backend.aclose()
        return len([event for event in seen if isinstance(event, ChatApprovalRequested)])

    requests = asyncio.run(scenario())
    journal.close()

    assert requests == 0
    assert [client.answers for client in clients] == [[{"decision": "decline"}]]
