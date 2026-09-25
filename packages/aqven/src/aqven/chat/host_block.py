from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit

from aqven.chat.agent_plugin import PLUGIN_NAME
from aqven.ports.chat import AgentBackendKind

SERIES_PAGE: Final = "research/series/<series_id>"
RUN_PAGE: Final = "runs/<run_id>"


@dataclass(frozen=True, slots=True)
class HostFacts:
    project_root: Path
    server_url: str

    @classmethod
    def of(cls, project_root: str | Path, mcp_url: str) -> HostFacts:
        return cls(Path(project_root), server_url_of(mcp_url))

    @property
    def package(self) -> str:
        return self.project_root.name

    def page(self, path: str) -> str:
        return f"{self.server_url}/{path}"


def server_url_of(mcp_url: str) -> str:
    parts = urlsplit(mcp_url)
    return f"{parts.scheme}://{parts.netloc}"


def opening_lines(facts: HostFacts) -> tuple[str, ...]:
    return (
        f"You are the agent of AQVEN Studio chat for project {facts.package} at {facts.project_root}.",
        f"- The project server is already running at {facts.server_url}; it reloads changed project Python on the "
        "next run. Never start, stop or restart it.",
        f"- Commands run in {facts.project_root}: where a skill or AGENTS.md writes `<package>` as a path, use `.`.",
    )


def closing_lines(facts: HostFacts) -> tuple[str, ...]:
    return (
        f"- A series paused near its cap continues only when the owner presses Continue at "
        f"{facts.page(SERIES_PAGE)}. A run is at {facts.page(RUN_PAGE)}.",
    )


def claude_lines(facts: HostFacts) -> tuple[str, ...]:
    return (
        f"- Provider keys live in Studio settings or {facts.package}/.env. This chat cannot read .env and its shell "
        "does not see those keys: the aqven MCP tools and `uv run aqven series` run inside the server and use them. "
        "`uv run aqven models check --live` and `models shapes --live` run in your shell: when they report a missing "
        "key, ask the owner to run them in his terminal.",
        "- A background command that ends wakes you with a new turn: start a series with `uv run aqven series "
        "<experiment_id>` in the background (Bash with run_in_background: true), say that you are waiting, and end "
        "the turn.",
        f"- AQVEN skills are loaded as plugin {PLUGIN_NAME} ({PLUGIN_NAME}:<skill>): before you write a file of a kind "
        "a skill covers, load that skill with the Skill tool; the map in AGENTS.md, when the project has it, names "
        "them.",
    )


def codex_lines(facts: HostFacts) -> tuple[str, ...]:
    return (
        f"- Provider keys live in Studio settings or {facts.package}/.env. This chat cannot read .env or "
        ".aqven/server.json and its shell does not see those keys: start and read series with the aqven MCP tools "
        "series_start, series_get and series_cancel, which run inside the server and use them.",
        "- Nothing wakes you when a series ends: follow it with series_get and wait_seconds: 50 until it settles, "
        "and never poll with sleep.",
        f"- AQVEN skills are listed as {PLUGIN_NAME}:<skill>: before you write a file of a kind a skill covers, "
        "read that skill's SKILL.md; the map in AGENTS.md, when the project has it, names them.",
    )


type HostLines = Callable[[HostFacts], tuple[str, ...]]

HOST_LINES: Final[Mapping[AgentBackendKind, HostLines]] = {"claude": claude_lines, "codex": codex_lines}


def host_block(host: AgentBackendKind, facts: HostFacts) -> str:
    return "\n".join((*opening_lines(facts), *HOST_LINES[host](facts), *closing_lines(facts)))
