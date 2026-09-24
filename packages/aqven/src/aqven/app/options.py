import argparse
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, cast

from aqven.app.console_log.levels import ConsoleLevel, add_verbosity_arguments, arguments_level
from aqven.app.environment import (
    AQVEN_HOST,
    AQVEN_OPEN_BROWSER,
    AQVEN_PORT,
    AQVEN_STUDIO,
    DEFAULT_PORT,
    LOOPBACK_HOST,
    RuntimeSettings,
    runtime_settings,
)
from aqven.chat.models import EFFORT_ORDER
from aqven.loader import find_project_root
from aqven.ports.chat import ChatEffort, ChatPermissionMode

STARTUP_TIMEOUT_SECONDS: Final = 30.0
POLL_SECONDS: Final = 0.1

__all__ = [
    "DEFAULT_PORT",
    "LOOPBACK_HOST",
    "POLL_SECONDS",
    "STARTUP_TIMEOUT_SECONDS",
    "ServerOptions",
    "add_server_arguments",
    "server_arguments",
    "server_options",
]


PERMISSION_MODES: Final[tuple[ChatPermissionMode, ...]] = ("default", "accept_edits", "plan", "trust")


@dataclass(frozen=True, slots=True)
class ServerOptions:
    root: Path
    port: int = DEFAULT_PORT
    data_dir: Path | None = None
    open_browser: bool = True
    headless: bool = False
    studio_dist: Path | None = None
    dev_origin: str | None = None
    host: str = LOOPBACK_HOST
    require_auth: bool = False
    chat_allowed_tools: tuple[str, ...] = ()
    chat_model: str | None = None
    chat_effort: ChatEffort | None = None
    chat_permission_mode: ChatPermissionMode = "default"
    startup_timeout_seconds: float = STARTUP_TIMEOUT_SECONDS
    poll_seconds: float = POLL_SECONDS
    console_level: ConsoleLevel = ConsoleLevel.INFO

    @property
    def launches_browser(self) -> bool:
        return self.open_browser and not self.headless


def add_server_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", type=Path, default=None, help="project root; searched upward from cwd by default")
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help=f"port; if it is busy, the next free one is used; {AQVEN_PORT} or {DEFAULT_PORT} by default",
    )
    parser.add_argument("--data-dir", type=Path, default=None, help="Studio data directory instead of the system one")
    parser.add_argument("--no-browser", action="store_true", help=f"do not open the browser; see {AQVEN_OPEN_BROWSER}")
    parser.add_argument(
        "--headless",
        action="store_true",
        help=f"no browser, no Studio static files: API, SSE and MCP only; see {AQVEN_STUDIO}",
    )
    parser.add_argument("--studio-dist", type=Path, default=None, help="built Studio directory for development")
    parser.add_argument("--dev-origin", default=None, help="Vite dev server origin, for example http://localhost:5173")
    parser.add_argument("--host", default=None, help=f"bind address; {AQVEN_HOST} or {LOOPBACK_HOST} by default")
    parser.add_argument("--require-auth", action="store_true", help="require a launch token for local API and MCP")
    parser.add_argument(
        "--chat-allow-tool",
        action="append",
        default=None,
        metavar="RULE",
        help=(
            "auto-approve a chat agent tool without asking in Studio, repeatable; "
            "narrow rules only, for example Read or Grep or 'Bash(rg:*)'"
        ),
    )
    parser.add_argument("--chat-model", default=None, metavar="NAME", help="default model for new chat sessions")
    parser.add_argument(
        "--chat-effort",
        default=None,
        choices=EFFORT_ORDER,
        help="default reasoning effort for new chat sessions",
    )
    parser.add_argument(
        "--chat-permission-mode",
        default=None,
        choices=PERMISSION_MODES,
        help="default approval mode for new chat sessions",
    )
    add_verbosity_arguments(parser)


def _rules(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    items = cast(list[object], value)
    return tuple(rule for item in items if isinstance(item, str) and (rule := item.strip()))


def _effort(value: object) -> ChatEffort | None:
    return value if isinstance(value, str) and value in EFFORT_ORDER else None


def _permission_mode(value: object) -> ChatPermissionMode:
    if isinstance(value, str) and value in PERMISSION_MODES:
        return value
    return "default"


def _path(value: object) -> Path | None:
    return value if isinstance(value, Path) else None


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _number(value: object) -> int | None:
    return value if isinstance(value, int) else None


def server_options(
    arguments: argparse.Namespace,
    cwd: Path,
    *,
    defaults: RuntimeSettings | None = None,
    environ: Mapping[str, str] | None = None,
) -> ServerOptions:
    settings = runtime_settings(environ, defaults)
    level = arguments_level(arguments, os.environ if environ is None else environ)
    port = _number(arguments.port)
    host = _text(arguments.host)
    return ServerOptions(
        root=find_project_root(_path(arguments.root) or cwd),
        port=settings.port if port is None else port,
        data_dir=_path(arguments.data_dir),
        open_browser=False if bool(arguments.no_browser) else settings.open_browser,
        headless=True if bool(arguments.headless) else not settings.studio,
        studio_dist=_path(arguments.studio_dist),
        dev_origin=_text(arguments.dev_origin),
        host=settings.host if host is None else host,
        require_auth=bool(arguments.require_auth),
        chat_allowed_tools=_rules(arguments.chat_allow_tool),
        chat_model=_text(arguments.chat_model),
        chat_effort=_effort(arguments.chat_effort),
        chat_permission_mode=_permission_mode(arguments.chat_permission_mode),
        console_level=level,
    )


def server_arguments(options: ServerOptions) -> tuple[str, ...]:
    data_dir = () if options.data_dir is None else ("--data-dir", str(options.data_dir))
    auth = ("--require-auth",) if options.require_auth else ()
    return ("--root", str(options.root), "--port", str(options.port), *data_dir, *auth)
