import asyncio
import json
import os
import subprocess
import sys
from collections.abc import Mapping
from importlib.metadata import distribution
from pathlib import Path

import pytest
from claude_agent_sdk import ClaudeAgentOptions, PermissionResult, PermissionResultAllow, ToolPermissionContext
from openai_codex.client import ApprovalHandler, CodexClient, CodexConfig
from pydantic import SecretStr

from aqven.chat.agent_plugin import (
    PLUGIN_NAME,
    PLUGIN_SKILLS,
    SKILL_NAMES,
    agent_plugin_root,
    agent_skills_root,
    claude_plugins,
    claude_skills,
    context_skill_names,
    plugin_read_rules,
)
from aqven.chat.claude_options import ClaudeChatSettings, ClaudeOptionsFactory
from aqven.chat.codex_backend import CodexAgentBackend
from aqven.chat.codex_policy import codex_config
from aqven.chat.codex_skills import EXTRA_ROOTS_METHOD
from aqven.chat.host_block import HostFacts, host_block
from aqven.chat.journal import StoredChatSession
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.chat.testing import ScriptedClaudeClient, ScriptedClientFactory, context_usage
from aqven.ports.chat import ChatMessageRequest, ChatSessionOptions, ChatTurnFinished
from aqven.runtime.address import ClientOpId

from .fixtures import MCP_TOKEN, MCP_URL, chat_harness, chat_session, streamed_answer_turn, until_turn_finished
from .test_codex_backend import FakeCodexClient

MANIFEST = ".claude-plugin/plugin.json"
SKILL_FILE = "SKILL.md"


def frontmatter_name(skill_file: Path) -> str:
    lines = skill_file.read_text(encoding="utf-8").splitlines()
    return next(line.removeprefix("name:").strip() for line in lines if line.startswith("name:"))


async def allow_all(
    tool_name: str, tool_input: Mapping[str, object], context: ToolPermissionContext
) -> PermissionResult:
    return PermissionResultAllow()


def test_the_plugin_ships_inside_the_package_under_its_manifest_name() -> None:
    manifest = json.loads((agent_plugin_root() / MANIFEST).read_text(encoding="utf-8"))

    assert agent_plugin_root().is_dir()
    assert manifest["name"] == PLUGIN_NAME
    assert manifest["author"]["name"]
    assert not (agent_plugin_root() / "hooks").exists()


def test_skill_names_are_the_skill_folders() -> None:
    folders = sorted(path.name for path in agent_skills_root().iterdir() if path.is_dir())

    assert list(SKILL_NAMES) == folders
    assert len(SKILL_NAMES) == 12
    assert all(frontmatter_name(agent_skills_root() / name / SKILL_FILE) == name for name in SKILL_NAMES)
    assert tuple(f"aqven:{name}" for name in SKILL_NAMES) == PLUGIN_SKILLS


def test_claude_loads_the_plugin_and_names_every_skill_in_a_list(tmp_path: Path) -> None:
    project = tmp_path / "my_flow"
    project.mkdir()
    settings = ClaudeChatSettings(mcp_token=SecretStr(MCP_TOKEN), cli_path=None, mcp_config_directory=tmp_path)
    stored = StoredChatSession(
        session=chat_session("session-1", project), mcp_url=MCP_URL, backend_session_id=None, closed_at=None
    )

    launch = ClaudeOptionsFactory(settings).build(stored, allow_all)
    launch.mcp_config.remove()

    assert launch.options.plugins == [{"type": "local", "path": str(agent_plugin_root())}]
    assert launch.options.plugins == claude_plugins()
    assert isinstance(launch.options.skills, list)
    assert launch.options.skills == claude_skills() == list(PLUGIN_SKILLS)
    assert launch.options.setting_sources == []
    assert plugin_read_rules()[0] == f"Read(/{agent_plugin_root().as_posix()}/**)"
    assert set(plugin_read_rules()) <= set(launch.options.allowed_tools)
    assert launch.options.system_prompt == {
        "type": "preset",
        "preset": "claude_code",
        "append": host_block("claude", HostFacts.of(project, MCP_URL)),
    }


def test_context_usage_without_skills_lists_none() -> None:
    assert context_skill_names({}) == ()
    assert context_skill_names({"skills": {"totalSkills": 13}}) == ()
    assert context_skill_names(context_usage(("aqven:running-series",))) == ("aqven:running-series",)


def run_one_turn(tmp_path: Path, usage: Mapping[str, object]) -> ScriptedClaudeClient:
    scripted = ScriptedClientFactory([streamed_answer_turn(tmp_path)])

    def factory(options: ClaudeAgentOptions) -> ScriptedClaudeClient:
        client = scripted(options)
        client.usage = usage
        return client

    harness = chat_harness(tmp_path, factory)

    async def scenario() -> None:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        request = ChatMessageRequest(text="hello", client_op_id=ClientOpId("op-1"))
        await harness.backend.send_message(session.session_id, request)
        await until_turn_finished(events)
        await harness.backend.aclose()

    asyncio.run(scenario())
    return scripted.clients[0]


def test_loaded_skills_are_logged_after_connect(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="aqven.chat.skills")

    client = run_one_turn(tmp_path, context_usage())

    assert client.usage_reads == 1
    assert "Claude chat loaded 12 of 12 aqven skills: analyzing-failures" in caplog.text
    assert "running-series" in caplog.text
    assert not [record for record in caplog.records if record.levelname == "ERROR"]


def test_missing_skills_are_logged_as_an_error(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="aqven.chat.skills")

    run_one_turn(tmp_path, {})

    errors = [record.getMessage() for record in caplog.records if record.levelname == "ERROR"]
    assert len(errors) == 1
    assert "Claude chat loaded 0 of 12 aqven skills: none; missing: analyzing-failures" in errors[0]
    assert str(agent_plugin_root()) in errors[0]


def test_codex_adds_the_skills_root_before_the_thread_starts(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="aqven.chat.skills")
    (tmp_path / "AGENTS.md").write_text("Project rule", encoding="utf-8")
    clients: list[FakeCodexClient] = []

    def factory(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = FakeCodexClient(config, approval_handler)
        clients.append(client)
        return client

    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    backend = CodexAgentBackend(journal, tmp_path, MCP_URL, SecretStr("token"), client_factory=factory)

    async def scenario() -> None:
        session = await backend.start_session(ChatSessionOptions(project_root=str(tmp_path), mcp_url=MCP_URL))
        events = backend.events(session.session_id)
        await backend.send_message(
            session.session_id, ChatMessageRequest(text="hello", client_op_id=ClientOpId("op-1"))
        )
        async for event in events:
            if isinstance(event, ChatTurnFinished):
                break
        await backend.aclose()

    asyncio.run(scenario())
    journal.close()
    client = clients[0]

    assert client.requests[0] == (EXTRA_ROOTS_METHOD, {"extraRoots": [str(agent_skills_root())]})
    assert client.calls.index(EXTRA_ROOTS_METHOD) < client.calls.index("thread/start")
    assert client.thread_options[0]["developerInstructions"] == (
        f"Project rule\n\n{host_block('codex', HostFacts.of(tmp_path, MCP_URL))}"
    )
    assert "Codex chat loaded 12 of 12 aqven skills" in caplog.text


@pytest.mark.skipif(sys.platform != "darwin", reason="sandbox command probe uses the macOS sandbox")
def test_codex_sandbox_reads_the_skills_but_never_writes_them(tmp_path: Path) -> None:
    config = codex_config(tmp_path, MCP_URL, "private-test-token", "default")
    skill_file = agent_skills_root() / "running-series" / SKILL_FILE

    def sandboxed(script: str) -> int:
        command = [
            str(distribution("openai-codex-cli-bin").locate_file("codex_cli_bin/bin/codex")),
            "sandbox",
            "-P",
            "aqven-studio",
            "-C",
            str(tmp_path),
            *[
                part
                for override in config.config_overrides
                if override.startswith("permissions.")
                for part in ("-c", override)
            ],
            "--",
            "/bin/sh",
            "-c",
            script,
        ]
        return subprocess.run(command, check=False, capture_output=True, env=os.environ.copy()).returncode

    assert sandboxed(f"head -c 1 '{skill_file}' >/dev/null 2>&1") == 0
    assert sandboxed(f"touch '{agent_skills_root() / 'written.txt'}' 2>/dev/null") != 0
    assert not (agent_skills_root() / "written.txt").exists()
