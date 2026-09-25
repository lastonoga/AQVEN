import argparse
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.agent_files import Action, AgentPlace, Change, agent_files_drift, agent_plugin_root, sync_agent_files
from aqven.console.command import EXIT_FAILED, EXIT_OK, PATH_HELP, PROGRAM, Command, OutputFormat
from aqven.console.project_env import open_project

ACTION_DESTINATION: Final = "skills_action"
CURRENT_FOLDER: Final = "."
SKILLS_PROGRAM: Final = f"{PROGRAM} skills"


def project_place(path: str) -> AgentPlace | None:
    root = open_project(Path(path), OutputFormat.TEXT)
    return None if root is None else AgentPlace.of(root)


def sync_command(place: AgentPlace) -> str:
    return f"uv run {SKILLS_PROGRAM} sync {place.package}"


def sync_summary(place: AgentPlace, changes: tuple[Change, ...]) -> str:
    kept = sum(1 for change in changes if change.action is Action.KEPT)
    if kept:
        return f"skills: synced with aqven {place.version}; {kept} kept as they are, fix them by hand"
    return f"skills: in sync with aqven {place.version} in {place.workspace}"


@dataclass(frozen=True, slots=True)
class SkillsSyncCommand:
    help: str = (
        "copy the aqven skills into .agents/skills and .claude/skills, write the aqven block of AGENTS.md and "
        "CLAUDE.md, the Claude Code hooks and the aqven MCP server of .mcp.json and .codex/config.toml"
    )

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", nargs="?", default=CURRENT_FOLDER, help=PATH_HELP)

    def execute(self, arguments: argparse.Namespace) -> int:
        place = project_place(str(arguments.path))
        if place is None:
            return EXIT_FAILED
        changes = sync_agent_files(place.root, place.workspace)
        for change in changes:
            print(change.line())
        print(sync_summary(place, changes))
        return EXIT_OK


@dataclass(frozen=True, slots=True)
class SkillsStatusCommand:
    help: str = "list what differs between the skills and agent files of the project and the installed aqven"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", nargs="?", default=CURRENT_FOLDER, help=PATH_HELP)

    def execute(self, arguments: argparse.Namespace) -> int:
        place = project_place(str(arguments.path))
        if place is None:
            return EXIT_FAILED
        drifts = agent_files_drift(place.root, place.workspace)
        if not drifts:
            print(f"skills: in sync with aqven {place.version} in {place.workspace}")
            return EXIT_OK
        for drift in drifts:
            print(drift.line())
        print(f"skills: {len(drifts)} differences from aqven {place.version}; run {sync_command(place)}")
        return EXIT_FAILED


@dataclass(frozen=True, slots=True)
class SkillsPathCommand:
    help: str = "print the folder of the aqven skills plugin, for claude --plugin-dir"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        return None

    def execute(self, arguments: argparse.Namespace) -> int:
        print(agent_plugin_root())
        return EXIT_OK


SKILLS_ACTIONS: Final[Mapping[str, Command]] = {
    "sync": SkillsSyncCommand(),
    "status": SkillsStatusCommand(),
    "path": SkillsPathCommand(),
}


@dataclass(frozen=True, slots=True)
class SkillsCommand:
    help: str = "the aqven skills and agent rules of a project for Claude Code and Codex outside Studio"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        actions = parser.add_subparsers(dest=ACTION_DESTINATION, required=True, metavar="ACTION")
        for name, action in SKILLS_ACTIONS.items():
            action.configure(actions.add_parser(name, help=action.help, description=action.help))

    def execute(self, arguments: argparse.Namespace) -> int:
        return SKILLS_ACTIONS[str(getattr(arguments, ACTION_DESTINATION))].execute(arguments)
