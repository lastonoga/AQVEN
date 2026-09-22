from dataclasses import dataclass
from typing import Final

CLAUDE_MCP_PREFIX: Final[str] = "mcp__"
CLAUDE_MCP_SEPARATOR: Final[str] = "__"


@dataclass(frozen=True, slots=True)
class ToolIdentity:
    name: str
    mcp_server: str | None


def claude_tool_identity(raw_name: str) -> ToolIdentity:
    if not raw_name.startswith(CLAUDE_MCP_PREFIX):
        return ToolIdentity(raw_name, None)
    server, separator, tool = raw_name.removeprefix(CLAUDE_MCP_PREFIX).partition(CLAUDE_MCP_SEPARATOR)
    if not (separator and server and tool):
        return ToolIdentity(raw_name, None)
    return ToolIdentity(tool, server)
