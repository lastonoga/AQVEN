import json
import os
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from claude_agent_sdk.types import McpServerConfig

MCP_CONFIG_PREFIX: Final = "aqven-mcp-"
MCP_CONFIG_SUFFIX: Final = ".json"
MCP_SERVERS_KEY: Final = "mcpServers"
CONFIG_ENCODING: Final = "utf-8"


@dataclass(frozen=True, slots=True)
class McpConfigFile:
    path: Path

    def locations(self) -> tuple[Path, ...]:
        resolved = self.path.resolve()
        return (self.path,) if resolved == self.path else (self.path, resolved)

    def remove(self) -> None:
        self.path.unlink(missing_ok=True)


def write_mcp_config(servers: Mapping[str, McpServerConfig], directory: Path | None = None) -> McpConfigFile:
    descriptor, name = tempfile.mkstemp(prefix=MCP_CONFIG_PREFIX, suffix=MCP_CONFIG_SUFFIX, dir=directory)
    with os.fdopen(descriptor, "w", encoding=CONFIG_ENCODING) as stream:
        json.dump({MCP_SERVERS_KEY: dict(servers)}, stream)
    return McpConfigFile(Path(name))
