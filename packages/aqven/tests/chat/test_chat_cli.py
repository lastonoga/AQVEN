import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path

import claude_agent_sdk

from aqven.chat.claude_cli import (
    LOGIN_HINT,
    ClaudeCli,
    ClaudeLoginProbe,
    CommandResult,
    bundled_claude_path,
    locate_claude_cli,
)


@dataclass
class RecordedRunner:
    result: CommandResult | None = None
    error: OSError | None = None
    calls: list[tuple[str, ...]] = field(default_factory=list[tuple[str, ...]])

    async def run(self, argv: Sequence[str], timeout_seconds: float) -> CommandResult:
        self.calls.append(tuple(argv))
        if self.error is not None:
            raise self.error
        return self.result or CommandResult(0, b"")


def probe_with(runner: RecordedRunner) -> ClaudeLoginProbe:
    return ClaudeLoginProbe(ClaudeCli("/opt/claude", "user"), runner)


def test_user_installed_claude_wins_over_bundled_cli() -> None:
    assert locate_claude_cli(lambda name: f"/home/dev/.local/bin/{name}") == ClaudeCli(
        "/home/dev/.local/bin/claude", "user"
    )
    assert locate_claude_cli(lambda name: None) == ClaudeCli(str(bundled_claude_path()), "bundled")


def test_subscription_login_is_reported_without_reading_tokens() -> None:
    runner = RecordedRunner(
        CommandResult(
            0,
            b'{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty",'
            b' "email": "dev@example.com", "orgName": "Dev Org", "subscriptionType": "max"}',
        )
    )

    status = asyncio.run(probe_with(runner).status())

    assert (status.state, status.method, status.account, status.detail) == (
        "logged_in",
        "subscription",
        "dev@example.com",
        "Dev Org",
    )
    assert runner.calls == [("/opt/claude", "auth", "status", "--json")]


def test_logged_out_and_api_key_states() -> None:
    logged_out = RecordedRunner(CommandResult(1, b'{"loggedIn": false, "authMethod": "none"}'))
    api_key = RecordedRunner(
        CommandResult(0, b'{"loggedIn": true, "authMethod": "api_key", "apiKeySource": "ANTHROPIC_API_KEY"}')
    )

    out_status = asyncio.run(probe_with(logged_out).status())
    key_status = asyncio.run(probe_with(api_key).status())

    assert (out_status.state, out_status.method, out_status.detail) == ("logged_out", None, LOGIN_HINT)
    assert (key_status.state, key_status.method, key_status.account) == ("logged_in", "api_key", None)


def test_unreadable_or_missing_cli_gives_unknown_state() -> None:
    garbage = asyncio.run(probe_with(RecordedRunner(CommandResult(None, b"not json"))).status())
    missing = asyncio.run(probe_with(RecordedRunner(error=FileNotFoundError(2, "No such file"))).status())

    assert garbage.state == "unknown"
    assert missing.state == "unknown"
    assert missing.detail is not None and "No such file" in missing.detail


def test_sdk_imports_and_a_claude_cli_is_discoverable_without_prompting() -> None:
    cli = locate_claude_cli()

    assert version("claude-agent-sdk") == "0.2.154"
    assert claude_agent_sdk.ClaudeSDKClient.__name__ == "ClaudeSDKClient"
    assert Path(cli.path).is_file()
