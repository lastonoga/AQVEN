import json
import os
from pathlib import Path
from typing import Final

from openai_codex.client import CodexConfig

from aqven.ports.chat import ChatPermissionMode

MCP_TOKEN_NAME: Final[str] = "AQVEN_MCP_TOKEN"
PROFILE_NAME: Final[str] = "aqven-studio"
SAFE_PROCESS_ENV: Final[frozenset[str]] = frozenset(
    {"PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM", "CODEX_HOME"}
)
DENIED_PROJECT_PATHS: Final[tuple[str, ...]] = (
    ".env",
    ".env.*",
    "*.env",
    "*.env.*",
    "**/.env",
    "**/.env.*",
    "**/*.env",
    "**/*.env.*",
    ".aqven/server.json",
    "**/.aqven/server.json",
)


def filesystem_profile(mode: ChatPermissionMode) -> str:
    root_access = "read" if mode == "plan" else "write"
    entries = [f'"."="{root_access}"', *(f'{json.dumps(path)}="deny"' for path in DENIED_PROJECT_PATHS)]
    scoped = ",".join(entries)
    return f'{{":root"="deny",":minimal"="read",":workspace_roots"={{{scoped}}}}}'


def codex_config(project_root: Path, mcp_url: str, mcp_token: str, mode: ChatPermissionMode) -> CodexConfig:
    parent = ":read-only" if mode == "plan" else ":workspace"
    overrides = (
        f'default_permissions="{PROFILE_NAME}"',
        f'permissions.{PROFILE_NAME}.extends="{parent}"',
        f"permissions.{PROFILE_NAME}.filesystem={filesystem_profile(mode)}",
        'shell_environment_policy.inherit="none"',
        f"mcp_servers.aqven.url={json.dumps(mcp_url)}",
        "mcp_servers.aqven.required=true",
        f'mcp_servers.aqven.bearer_token_env_var="{MCP_TOKEN_NAME}"',
    )
    environment = {name: value if name in SAFE_PROCESS_ENV else "" for name, value in os.environ.items()}
    environment[MCP_TOKEN_NAME] = mcp_token
    return CodexConfig(
        cwd=str(project_root),
        env=environment,
        config_overrides=overrides,
        client_name="aqven_studio",
        client_title="AQVEN Studio",
    )
