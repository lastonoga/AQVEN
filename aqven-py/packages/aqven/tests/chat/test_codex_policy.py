import os
import subprocess
import sys
from importlib.metadata import distribution
from pathlib import Path

import pytest
from openai_codex.client import CodexClient, CodexConfig

from aqven.chat.codex_policy import codex_config
from aqven.chat.project_rules import project_rules
from aqven.ports.chat import ChatPermissionMode


@pytest.mark.parametrize("mode", ["default", "accept_edits", "plan"])
def test_codex_config_keeps_mcp_token_out_of_arguments_and_agent_shell(
    mode: ChatPermissionMode, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = "private-test-token"
    monkeypatch.setenv("TEST_PROVIDER_KEY", "private-provider-value")
    config = codex_config(Path("/project"), "http://127.0.0.1:9300/mcp", token, mode)

    assert config.codex_bin is None
    assert config.cwd == "/project"
    assert config.env is not None
    assert config.env["AQVEN_MCP_TOKEN"] == token
    assert token not in " ".join(config.config_overrides)
    assert 'shell_environment_policy.inherit="none"' in config.config_overrides
    assert 'mcp_servers.aqven.required=true' in config.config_overrides
    assert 'mcp_servers.aqven.bearer_token_env_var="AQVEN_MCP_TOKEN"' in config.config_overrides
    assert config.env.get("TEST_PROVIDER_KEY", "") == ""
    assert any(".aqven/server.json" in item and "**/.env.*" in item for item in config.config_overrides)
    assert any("=:read-only" in item or '":read-only"' in item for item in config.config_overrides) == (
        mode == "plan"
    )


@pytest.mark.skipif(sys.platform != "darwin", reason="sandbox command probe uses the macOS sandbox")
@pytest.mark.parametrize("mode", ["default", "accept_edits", "plan"])
def test_codex_profile_denies_secret_reads_but_allows_project_file(tmp_path: Path, mode: ChatPermissionMode) -> None:
    (tmp_path / "public.txt").write_text("public", encoding="utf-8")
    (tmp_path / ".env").write_text("KEY=secret", encoding="utf-8")
    (tmp_path / ".env.local").write_text("KEY=secret", encoding="utf-8")
    (tmp_path / "keys.env").write_text("KEY=secret", encoding="utf-8")
    (tmp_path / "keys.env.local").write_text("KEY=secret", encoding="utf-8")
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / ".env.production").write_text("KEY=secret", encoding="utf-8")
    (tmp_path / "nested" / "keys.env.local").write_text("KEY=secret", encoding="utf-8")
    (tmp_path / ".aqven").mkdir()
    (tmp_path / ".aqven" / "server.json").write_text('{"token":"secret"}', encoding="utf-8")
    config = codex_config(tmp_path, "http://127.0.0.1:9300/mcp", "private-test-token", mode)

    def readable(filename: str) -> bool:
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
            f"head -c 1 {filename} >/dev/null 2>&1",
        ]
        return subprocess.run(command, check=False, capture_output=True, env=os.environ.copy()).returncode == 0

    assert readable("public.txt")
    assert not readable(".env")
    assert not readable(".env.local")
    assert not readable("keys.env")
    assert not readable("keys.env.local")
    assert not readable("nested/.env.production")
    assert not readable("nested/keys.env.local")
    assert not readable(".aqven/server.json")


def test_codex_app_server_accepts_complete_strict_profile(tmp_path: Path) -> None:
    config = codex_config(tmp_path, "http://127.0.0.1:9300/mcp", "private-test-token", "default")
    arguments = (
        str(distribution("openai-codex-cli-bin").locate_file("codex_cli_bin/bin/codex")),
        "app-server",
        "--strict-config",
        "--listen",
        "stdio://",
        *(part for override in config.config_overrides for part in ("-c", override)),
    )
    strict = CodexConfig(launch_args_override=arguments, cwd=config.cwd, env=config.env)
    client = CodexClient(strict, approval_handler=lambda method, params: {"decision": "decline"})
    try:
        client.start()
        client.initialize()
    finally:
        client.close()


def test_shared_project_rules_do_not_follow_secret_symlinks(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text("PRIVATE_KEY=secret", encoding="utf-8")
    (tmp_path / "AGENTS.md").symlink_to(".env")
    (tmp_path / "CLAUDE.md").write_text("Safe project rule", encoding="utf-8")

    assert project_rules(tmp_path) == "Safe project rule"
