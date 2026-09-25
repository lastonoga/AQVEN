from pathlib import Path

from aqven.agent_files.blocks import ManagedBlock
from aqven.agent_files.place import (
    Action,
    AgentPlace,
    AgentTarget,
    Change,
    Drift,
    agent_plugin_root,
    installed_version,
)
from aqven.agent_files.settings import ClaudeSettings, CodexMcpServer, McpServer
from aqven.agent_files.skills import (
    COPIES_FOLDER,
    LINKS_FOLDER,
    MANIFEST_FILE,
    SkillCopies,
    SkillLinks,
    read_manifest,
)

AGENTS_FILE = "AGENTS.md"
CLAUDE_FILE = "CLAUDE.md"


def skill_targets(place: AgentPlace) -> tuple[AgentTarget, ...]:
    previous = read_manifest(place)
    return (SkillCopies(previous), SkillLinks(previous))


def rule_targets() -> tuple[ManagedBlock, ...]:
    return (ManagedBlock(AGENTS_FILE), ManagedBlock(CLAUDE_FILE))


def all_targets(place: AgentPlace) -> tuple[AgentTarget, ...]:
    return (*skill_targets(place), *rule_targets(), ClaudeSettings(), McpServer(), CodexMcpServer())


def sync_agent_files(root: Path, workspace: Path | None = None) -> tuple[Change, ...]:
    place = AgentPlace.of(root, workspace)
    return tuple(change for target in all_targets(place) for change in target.sync(place))


def agent_files_drift(root: Path, workspace: Path | None = None) -> tuple[Drift, ...]:
    place = AgentPlace.of(root, workspace)
    return tuple(drift for target in all_targets(place) for drift in target.drift(place))


__all__ = [
    "AGENTS_FILE",
    "CLAUDE_FILE",
    "COPIES_FOLDER",
    "LINKS_FOLDER",
    "MANIFEST_FILE",
    "Action",
    "AgentPlace",
    "AgentTarget",
    "Change",
    "Drift",
    "ManagedBlock",
    "agent_files_drift",
    "agent_plugin_root",
    "all_targets",
    "installed_version",
    "read_manifest",
    "rule_targets",
    "skill_targets",
    "sync_agent_files",
]
