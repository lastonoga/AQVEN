import asyncio
import json
import sys
from collections.abc import Mapping
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    PermissionResult,
    PermissionResultAllow,
    PermissionResultDeny,
    TextBlock,
    ToolPermissionContext,
    ToolUseBlock,
)
from claude_agent_sdk.types import HookContext, PostToolUseHookInput, PreToolUseHookInput
from pydantic import BaseModel, JsonValue, SecretStr

from aqven.chat.claude_cli import SubprocessCommandRunner
from aqven.chat.claude_options import ClaudeChatSettings, ClaudeOptionsFactory
from aqven.chat.env_guard import SECRET_FILE_REASON, SecretFileGuard, names_env_file, scrubbed_environment
from aqven.chat.journal import StoredChatSession
from aqven.chat.mcp_config import MCP_CONFIG_PREFIX
from aqven.chat.testing import ApprovalStep, ScriptedClaudeClient, ScriptedClientFactory, ScriptStep
from aqven.ports.chat import (
    ChatApprovalRequested,
    ChatEvent,
    ChatMessageRequest,
    ChatToolCallFinished,
    ChatTurnFinished,
    ChatUsageReported,
)
from aqven.runtime.address import ClientOpId

from .fixtures import (
    MCP_TOKEN,
    MCP_URL,
    assistant,
    chat_harness,
    chat_session,
    init_message,
    result,
    streamed_answer_turn,
    tool_result,
    until_turn_finished,
)

GUARD: Final = SecretFileGuard(protected_markers=(MCP_CONFIG_PREFIX,))
HOOK_CONTEXT: Final = HookContext(signal=None)
SECRET_VALUE: Final = "sk-or-v1-dotenv-secret-0123456789"
FAKE_CLI_SCRIPT: Final = """
import json
import os
import sys

record = {"argv": sys.argv, "env": {name: os.environ.get(name) for name in ("OPENROUTER_API_KEY", "PATH_MARKER")}}
with open(sys.argv[0] + ".record.json", "w", encoding="utf-8") as stream:
    json.dump(record, stream)
for line in sys.stdin:
    frame = json.loads(line)
    if frame.get("type") != "control_request":
        continue
    answer = {"subtype": "success", "request_id": frame["request_id"], "response": {}}
    print(json.dumps({"type": "control_response", "response": answer}), flush=True)
"""


class CliRecord(BaseModel):
    argv: list[str]
    env: dict[str, str | None]


def message(text: str, op: str) -> ChatMessageRequest:
    return ChatMessageRequest(text=text, client_op_id=ClientOpId(op))


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def pre_tool_use(tool_name: str, tool_input: dict[str, JsonValue]) -> PreToolUseHookInput:
    return PreToolUseHookInput(
        session_id="s",
        transcript_path="/tmp/t.jsonl",
        cwd="/work",
        hook_event_name="PreToolUse",
        tool_name=tool_name,
        tool_input=dict(tool_input),
        tool_use_id="toolu_1",
    )


@pytest.mark.parametrize(
    ("tool_name", "tool_input"),
    [
        ("Read", {"file_path": "/work/lumen/.env"}),
        ("Read", {"file_path": "lumen/.env.local"}),
        ("Write", {"file_path": "./.env", "content": "A=1"}),
        ("Edit", {"file_path": "config/prod.env", "old_string": "a", "new_string": "b"}),
        ("MultiEdit", {"file_path": ".env", "edits": []}),
        ("NotebookEdit", {"notebook_path": "/work/.env", "new_source": ""}),
        ("Grep", {"pattern": "API_KEY", "path": ".env"}),
        ("Grep", {"pattern": "API_KEY", "glob": "**/.env*"}),
        ("Glob", {"pattern": "**/*.env"}),
        ("Glob", {"pattern": ".env.*", "path": "/work"}),
        ("Bash", {"command": "cat .env"}),
        ("Bash", {"command": "grep KEY ./lumen/.env && echo done"}),
        ("Bash", {"command": "python -c \"print(open('.env').read())\""}),
        ("Bash", {"command": "source .env.production; env"}),
        ("Bash", {"command": "cat .e''nv"}),
        ("Bash", {"command": 'cat ".env"'}),
        ("Bash", {"command": "cat .en\\v"}),
        ("Bash", {"command": "cat `echo .env`"}),
        ("Bash", {"command": "cat $(echo .env)"}),
        ("Read", {"file_path": f"/var/folders/T/{MCP_CONFIG_PREFIX}abc.json"}),
        ("Bash", {"command": f"cat $TMPDIR/{MCP_CONFIG_PREFIX}abc.json"}),
    ],
)
def test_guard_refuses_env_files_and_mcp_config(tool_name: str, tool_input: dict[str, JsonValue]) -> None:
    assert GUARD.violation(tool_name, tool_input) == SECRET_FILE_REASON
    output = asyncio.run(GUARD.pre_tool_use(pre_tool_use(tool_name, tool_input), "toolu_1", HOOK_CONTEXT))
    assert output == {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": SECRET_FILE_REASON,
        }
    }


@pytest.mark.parametrize(
    ("tool_name", "tool_input"),
    [
        ("Read", {"file_path": "lumen/aqven.yaml"}),
        ("Read", {"file_path": ".envrc"}),
        ("Glob", {"pattern": "**/*.py"}),
        ("Glob", {"pattern": "**/*"}),
        ("Grep", {"pattern": "process.env", "path": "src"}),
        ("Bash", {"command": "uv run pytest -q"}),
        ("Bash", {"command": "ls .venv/bin"}),
        ("Write", {"file_path": "docs/setup.md", "content": "copy .env.example to .env"}),
        ("mcp__aqven__flow_get", {"flow": ".env"}),
    ],
)
def test_guard_allows_ordinary_tool_calls(tool_name: str, tool_input: dict[str, JsonValue]) -> None:
    assert GUARD.violation(tool_name, tool_input) is None
    assert asyncio.run(GUARD.pre_tool_use(pre_tool_use(tool_name, tool_input), None, HOOK_CONTEXT)) == {}


def test_hook_ignores_other_events_and_rules_cover_env_files_and_config() -> None:
    after = PostToolUseHookInput(
        session_id="s",
        transcript_path="/tmp/t.jsonl",
        cwd="/work",
        hook_event_name="PostToolUse",
        tool_name="Read",
        tool_input={"file_path": ".env"},
        tool_response="A=1",
        tool_use_id="toolu_1",
    )
    rules = GUARD.permission_rules((Path("/var/folders/T/aqven-mcp-1.json"),))

    assert asyncio.run(GUARD.pre_tool_use(after, "toolu_1", HOOK_CONTEXT)) == {}
    assert {"Read(**/.env)", "Read(//**/.env)", "Edit(**/.env.*)", "Edit(//**/*.env)"} <= set(rules)
    assert {"Read(//var/folders/T/aqven-mcp-1.json)", "Edit(//var/folders/T/aqven-mcp-1.json)"} <= set(rules)
    assert [names_env_file(name) for name in (".env", ".env.test", "prod.env", ".envrc", ".venv", "*", "*.e*")] == [
        True,
        True,
        True,
        False,
        False,
        False,
        True,
    ]
    guarded = GUARD.hooks()["PreToolUse"][0].matcher or ""
    assert set(guarded.split("|")) == {"Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Grep", "Glob", "Bash"}


def read_env_turn(project_root: Path) -> list[ScriptStep]:
    arguments: dict[str, JsonValue] = {"file_path": str(project_root / ".env")}
    return [
        init_message(project_root),
        assistant("msg_read", [ToolUseBlock(id="toolu_env", name="Read", input=arguments)]),
        ApprovalStep(tool_name="Read", tool_use_id="toolu_env", tool_input=arguments),
        tool_result("toolu_env", SECRET_FILE_REASON, is_error=True),
        assistant("msg_final", [TextBlock(text="I cannot read .env.")]),
        result(),
    ]


def test_can_use_tool_refuses_env_file_without_asking_studio(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([read_env_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("show keys", "op-1"))
        _, seen = await until_turn_finished(events)
        await harness.backend.aclose()
        return seen

    seen = asyncio.run(scenario())
    permissions = factory.clients[0].permissions

    assert of_type(seen, ChatApprovalRequested) == []
    assert len(permissions) == 1
    refused = permissions[0]
    assert isinstance(refused, PermissionResultDeny)
    assert (refused.message, refused.interrupt) == (SECRET_FILE_REASON, False)
    assert [(event.tool_call_id, event.status) for event in of_type(seen, ChatToolCallFinished)] == [
        ("toolu_env", "denied")
    ]


def stored_session(project_root: Path) -> StoredChatSession:
    session = chat_session("session-1", project_root)
    return StoredChatSession(session=session, mcp_url=MCP_URL, backend_session_id=None, closed_at=None)


async def allow_all(
    tool_name: str, tool_input: Mapping[str, object], context: ToolPermissionContext
) -> PermissionResult:
    return PermissionResultAllow()


def fake_cli(folder: Path) -> Path:
    script = folder / "fake_claude.py"
    script.write_text(FAKE_CLI_SCRIPT, encoding="utf-8")
    launcher = folder / "fake_claude"
    launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n', encoding="utf-8")
    launcher.chmod(0o700)
    return launcher


@pytest.mark.skipif(sys.platform == "win32", reason="the fake Claude CLI is a POSIX shell launcher")
def test_claude_cli_argv_has_no_token_and_env_values_from_dotenv_are_blank(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = tmp_path / "project"
    project.mkdir()
    (project / ".env").write_text(f"OPENROUTER_API_KEY='{SECRET_VALUE}'\n", encoding="utf-8")
    monkeypatch.setenv("OPENROUTER_API_KEY", SECRET_VALUE)
    monkeypatch.setenv("PATH_MARKER", "kept")
    monkeypatch.setenv("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")
    cli = fake_cli(tmp_path)
    settings = ClaudeChatSettings(mcp_token=SecretStr(MCP_TOKEN), cli_path=str(cli), mcp_config_directory=tmp_path)
    launch = ClaudeOptionsFactory(settings).build(stored_session(project), allow_all)

    async def scenario() -> None:
        client = ClaudeSDKClient(launch.options)
        async with asyncio.timeout(20):
            await client.connect()
        await client.disconnect()

    asyncio.run(scenario())
    record = CliRecord.model_validate_json((tmp_path / "fake_claude.py.record.json").read_text(encoding="utf-8"))
    config_path = launch.mcp_config.path

    assert all(MCP_TOKEN not in argument for argument in record.argv)
    assert record.argv[record.argv.index("--mcp-config") + 1] == str(config_path)
    assert "Read(**/.env)" in record.argv[record.argv.index("--disallowedTools") + 1]
    assert json.loads(config_path.read_text(encoding="utf-8"))["mcpServers"]["aqven"]["headers"] == {
        "Authorization": f"Bearer {MCP_TOKEN}"
    }
    assert config_path.stat().st_mode & 0o777 == 0o600
    assert config_path.name.startswith(MCP_CONFIG_PREFIX)
    assert record.env == {"OPENROUTER_API_KEY": "", "PATH_MARKER": "kept"}
    launch.mcp_config.remove()
    assert not config_path.exists()


class RefusingClient(ScriptedClaudeClient):
    async def connect(self) -> None:
        raise OSError("claude is not installed")


def test_mcp_config_file_is_removed_when_the_client_fails_or_closes(tmp_path: Path) -> None:
    configs: list[Path] = []

    def refusing_factory(options: ClaudeAgentOptions) -> ScriptedClaudeClient:
        assert isinstance(options.mcp_servers, Path)
        configs.append(options.mcp_servers)
        assert options.mcp_servers.is_file()
        return RefusingClient(options, ())

    harness = chat_harness(tmp_path, refusing_factory)

    async def scenario() -> None:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("hi", "op-1"))
        await until_turn_finished(events)
        await harness.backend.aclose()

    asyncio.run(scenario())

    assert len(configs) == 1
    assert not configs[0].exists()
    assert list(tmp_path.glob(f"{MCP_CONFIG_PREFIX}*")) == []


def test_usage_reports_cost_of_each_turn_not_the_session_total(tmp_path: Path) -> None:
    first = [*streamed_answer_turn(tmp_path)[:-1], result(total_cost_usd=0.0044)]
    second = [*streamed_answer_turn(tmp_path)[:-1], result(total_cost_usd=0.0101)]
    resumed = [*streamed_answer_turn(tmp_path)[:-1], result(total_cost_usd=0.0020)]
    factory = ScriptedClientFactory([first, second], [resumed])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("one", "op-1"))
        _, seen_first = await until_turn_finished(events)
        await harness.backend.send_message(session.session_id, message("two", "op-2"))
        _, seen_second = await until_turn_finished(events)
        await harness.backend.close_session(session.session_id)
        reopened = await harness.backend.start_session(
            harness.options().model_copy(update={"resume_session_id": session.session_id})
        )
        resumed_events = harness.backend.events(reopened.session_id, reopened.last_seq)
        await harness.backend.send_message(reopened.session_id, message("three", "op-3"))
        _, seen_resumed = await until_turn_finished(resumed_events)
        await harness.backend.aclose()
        return [*seen_first, *seen_second, *seen_resumed]

    seen = asyncio.run(scenario())

    priced = [event.usage.cost_usd for event in of_type(seen, ChatUsageReported) if event.usage.cost_usd is not None]
    assert priced == [Decimal("0.0044"), Decimal("0.0057"), Decimal("0.0020")]
    assert [event.usage.cost_usd for event in of_type(seen, ChatTurnFinished) if event.usage is not None] == [
        Decimal("0.0044"),
        Decimal("0.0057"),
        Decimal("0.0020"),
    ]


def test_login_probe_runner_blanks_dotenv_names(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / ".env").write_text(f"ANTHROPIC_API_KEY={SECRET_VALUE}\n'BAD NAME'=1\n", encoding="utf-8")
    monkeypatch.setenv("ANTHROPIC_API_KEY", SECRET_VALUE)
    runner = SubprocessCommandRunner(lambda: scrubbed_environment(tmp_path))
    probe = (sys.executable, "-c", "import os; print(repr(os.environ.get('ANTHROPIC_API_KEY')))")

    outcome = asyncio.run(runner.run(probe, 20.0))

    assert scrubbed_environment(tmp_path) == {"ANTHROPIC_API_KEY": ""}
    assert (outcome.exit_code, outcome.stdout.decode().strip()) == (0, "''")


def test_allowed_tools_reach_the_sdk_without_touching_settings_files(tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()
    settings = ClaudeChatSettings(
        mcp_token=SecretStr(MCP_TOKEN),
        cli_path=None,
        mcp_config_directory=tmp_path,
        allowed_tools=("Read", "Grep", "Bash(rg:*)"),
    )
    launch = ClaudeOptionsFactory(settings).build(stored_session(project), allow_all)
    launch.mcp_config.remove()

    assert launch.options.allowed_tools == ["Read", "Grep", "Bash(rg:*)"]
    assert launch.options.setting_sources == []
    assert any(rule.startswith("Read(") and ".env" in rule for rule in launch.options.disallowed_tools)


def test_allowed_tools_are_empty_unless_the_launcher_passes_them(tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()
    settings = ClaudeChatSettings(mcp_token=SecretStr(MCP_TOKEN), cli_path=None, mcp_config_directory=tmp_path)
    launch = ClaudeOptionsFactory(settings).build(stored_session(project), allow_all)
    launch.mcp_config.remove()

    assert launch.options.allowed_tools == []


def test_trust_mode_stops_asking_but_keeps_the_env_guard(tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()
    settings = ClaudeChatSettings(mcp_token=SecretStr(MCP_TOKEN), cli_path=None, mcp_config_directory=tmp_path)
    stored = stored_session(project)
    trusting = stored.model_copy(update={"session": stored.session.model_copy(update={"permission_mode": "trust"})})
    launch = ClaudeOptionsFactory(settings).build(trusting, allow_all)
    launch.mcp_config.remove()

    assert launch.options.permission_mode == "bypassPermissions"
    assert any(rule.startswith("Read(") and ".env" in rule for rule in launch.options.disallowed_tools)
    assert launch.options.hooks is not None
    assert "PreToolUse" in launch.options.hooks
    assert launch.options.setting_sources == []
    assert launch.options.can_use_tool is None


def test_every_studio_mode_maps_to_an_sdk_mode(tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()
    settings = ClaudeChatSettings(mcp_token=SecretStr(MCP_TOKEN), cli_path=None, mcp_config_directory=tmp_path)
    stored = stored_session(project)
    expected = {"default": "default", "accept_edits": "acceptEdits", "plan": "plan", "trust": "bypassPermissions"}
    for chosen, sdk in expected.items():
        session = stored.session.model_copy(update={"permission_mode": chosen})
        launch = ClaudeOptionsFactory(settings).build(stored.model_copy(update={"session": session}), allow_all)
        launch.mcp_config.remove()
        assert launch.options.permission_mode == sdk
