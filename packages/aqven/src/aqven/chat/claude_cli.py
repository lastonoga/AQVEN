import asyncio
import os
import shutil
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Literal, Protocol

import claude_agent_sdk

from aqven.chat.claude_wire import AuthStatusWire, parse_wire_json
from aqven.ports.chat import LoginMethod, LoginStatus

CLAUDE_EXECUTABLE: Final[str] = "claude"
BUNDLED_DIRECTORY: Final[str] = "_bundled"
LOGIN_STATUS_ARGS: Final[tuple[str, ...]] = ("auth", "status", "--json")
LOGIN_STATUS_TIMEOUT_SECONDS: Final[float] = 20.0
LOGIN_HINT: Final[str] = "Sign in inside Claude Code: run `claude` in a terminal and use /login."
AUTH_METHODS: Final[Mapping[str, LoginMethod]] = {
    "claude.ai": "subscription",
    "oauth_token": "subscription",
    "api_key": "api_key",
}

type CliSource = Literal["user", "bundled"]
type Which = Callable[[str], str | None]
type EnvironmentOverrides = Callable[[], Mapping[str, str]]


@dataclass(frozen=True, slots=True)
class ClaudeCli:
    path: str
    source: CliSource


def bundled_claude_path() -> Path:
    name = f"{CLAUDE_EXECUTABLE}.exe" if sys.platform == "win32" else CLAUDE_EXECUTABLE
    return Path(claude_agent_sdk.__file__).parent / BUNDLED_DIRECTORY / name


def system_which(name: str) -> str | None:
    return shutil.which(name)


def locate_claude_cli(which: Which = system_which) -> ClaudeCli:
    user_cli = which(CLAUDE_EXECUTABLE)
    if user_cli is not None:
        return ClaudeCli(user_cli, "user")
    return ClaudeCli(str(bundled_claude_path()), "bundled")


@dataclass(frozen=True, slots=True)
class CommandResult:
    exit_code: int | None
    stdout: bytes


class CommandRunner(Protocol):
    async def run(self, argv: Sequence[str], timeout_seconds: float) -> CommandResult: ...


def no_overrides() -> Mapping[str, str]:
    return {}


@dataclass(frozen=True, slots=True)
class SubprocessCommandRunner:
    overrides: EnvironmentOverrides = field(default=no_overrides)

    async def run(self, argv: Sequence[str], timeout_seconds: float) -> CommandResult:
        process = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env={**os.environ, **self.overrides()},
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout_seconds)
        except TimeoutError:
            process.kill()
            await process.wait()
            return CommandResult(None, b"")
        return CommandResult(process.returncode, stdout)


class LoginProbe(Protocol):
    async def status(self) -> LoginStatus: ...


def unknown_login(detail: str) -> LoginStatus:
    return LoginStatus(backend="claude", state="unknown", method=None, account=None, detail=detail)


def login_status_of(report: AuthStatusWire) -> LoginStatus:
    if not report.logged_in:
        return LoginStatus(backend="claude", state="logged_out", method=None, account=None, detail=LOGIN_HINT)
    method = None if report.auth_method is None else AUTH_METHODS.get(report.auth_method)
    return LoginStatus(backend="claude", state="logged_in", method=method, account=report.email, detail=report.org_name)


class ClaudeLoginProbe:
    def __init__(
        self,
        cli: ClaudeCli,
        runner: CommandRunner | None = None,
        timeout_seconds: float = LOGIN_STATUS_TIMEOUT_SECONDS,
    ) -> None:
        self._cli = cli
        self._runner = runner or SubprocessCommandRunner()
        self._timeout_seconds = timeout_seconds

    async def status(self) -> LoginStatus:
        try:
            result = await self._runner.run((self._cli.path, *LOGIN_STATUS_ARGS), self._timeout_seconds)
        except OSError as error:
            return unknown_login(f"Claude Code CLI at {self._cli.path} cannot be started: {error.strerror or error}")
        report = parse_wire_json(AuthStatusWire, result.stdout)
        if report is None:
            return unknown_login(f"Claude Code CLI at {self._cli.path} did not report a login status.")
        return login_status_of(report)
