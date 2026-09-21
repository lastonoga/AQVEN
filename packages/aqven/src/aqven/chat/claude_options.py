from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from claude_agent_sdk import CanUseTool, ClaudeAgentOptions, PermissionMode
from claude_agent_sdk.types import McpHttpServerConfig, SystemPromptPreset, ThinkingConfigEnabled
from pydantic import SecretStr

from aqven.chat.approvals import DEFAULT_APPROVAL_TIMEOUT_SECONDS
from aqven.chat.env_guard import SecretFileGuard, scrubbed_environment
from aqven.chat.journal import StoredChatSession
from aqven.chat.mcp_config import MCP_CONFIG_PREFIX, McpConfigFile, write_mcp_config
from aqven.chat.models import thinking_budget
from aqven.chat.project_rules import project_rules
from aqven.ports.chat import ChatPermissionMode

AQVEN_MCP_SERVER: Final[str] = "aqven"
CLIENT_APP_ENV: Final[str] = "CLAUDE_AGENT_SDK_CLIENT_APP"
DEFAULT_CLIENT_APP: Final[str] = "aqven-studio"
DEFAULT_THINKING_BUDGET_TOKENS: Final[int] = 8000
TRUSTED_MODE: Final[PermissionMode] = "bypassPermissions"
PERMISSION_MODES: Final[Mapping[ChatPermissionMode, PermissionMode]] = {
    "default": "default",
    "accept_edits": "acceptEdits",
    "plan": "plan",
}


@dataclass(frozen=True, slots=True)
class ClaudeChatSettings:
    mcp_token: SecretStr
    cli_path: str | None
    approval_timeout_seconds: float = DEFAULT_APPROVAL_TIMEOUT_SECONDS
    thinking_budget_tokens: int = DEFAULT_THINKING_BUDGET_TOKENS
    client_app: str = DEFAULT_CLIENT_APP
    mcp_config_directory: Path | None = None
    allowed_tools: tuple[str, ...] = ()
    trust_project: bool = False


@dataclass(frozen=True, slots=True)
class ClaudeLaunch:
    options: ClaudeAgentOptions
    mcp_config: McpConfigFile


def claude_system_prompt(project_root: Path) -> SystemPromptPreset:
    rules = project_rules(project_root)
    if not rules:
        return SystemPromptPreset(type="preset", preset="claude_code")
    return SystemPromptPreset(type="preset", preset="claude_code", append=rules)


def aqven_mcp_server(url: str, token: SecretStr) -> McpHttpServerConfig:
    return McpHttpServerConfig(
        type="http",
        url=url,
        headers={"Authorization": f"Bearer {token.get_secret_value()}"},
    )


def default_guard() -> SecretFileGuard:
    return SecretFileGuard(protected_markers=(MCP_CONFIG_PREFIX,))


@dataclass(frozen=True, slots=True)
class ClaudeOptionsFactory:
    settings: ClaudeChatSettings
    guard: SecretFileGuard = field(default_factory=default_guard)

    def permission_mode(self, chosen: ChatPermissionMode) -> PermissionMode:
        if self.settings.trust_project:
            return TRUSTED_MODE
        return PERMISSION_MODES[chosen]

    def build(self, stored: StoredChatSession, can_use_tool: CanUseTool) -> ClaudeLaunch:
        project_root = Path(stored.session.project_root)
        server = aqven_mcp_server(stored.mcp_url, self.settings.mcp_token)
        config = write_mcp_config({AQVEN_MCP_SERVER: server}, self.settings.mcp_config_directory)
        options = ClaudeAgentOptions(
            cwd=project_root,
            cli_path=self.settings.cli_path,
            model=stored.session.model,
            permission_mode=self.permission_mode(stored.session.permission_mode),
            system_prompt=claude_system_prompt(project_root),
            mcp_servers=config.path,
            strict_mcp_config=True,
            setting_sources=[],
            allowed_tools=list(self.settings.allowed_tools),
            disallowed_tools=self.guard.permission_rules(config.locations()),
            hooks=self.guard.hooks(),
            can_use_tool=can_use_tool,
            include_partial_messages=True,
            thinking=ThinkingConfigEnabled(
                type="enabled", budget_tokens=thinking_budget(stored.session.effort), display="summarized"
            ),
            resume=stored.backend_session_id,
            env={**scrubbed_environment(project_root), CLIENT_APP_ENV: self.settings.client_app},
        )
        return ClaudeLaunch(options, config)
