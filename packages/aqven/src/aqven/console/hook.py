import argparse
import asyncio
import json
import os
import re
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, TextIO

from claude_agent_sdk.types import HookEvent
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter, ValidationError

from aqven.agent_files import AgentPlace
from aqven.app.locations import PROJECT_STATE_FOLDER
from aqven.chat.agent_hooks import studio_agent_hooks
from aqven.chat.agent_plugin import PLUGIN_NAME, SKILL_NAMES
from aqven.chat.hook_context import (
    POST_TOOL_USE,
    POST_TOOL_USE_FAILURE,
    PRE_TOOL_USE,
    USER_PROMPT_SUBMIT,
    HookMoment,
    SessionMemory,
)
from aqven.chat.hook_rules import COMPACTED
from aqven.console.command import EXIT_OK, PATH_HELP, PROGRAM
from aqven.loader import ProjectNotFound, find_project_root

HOOK_PROGRAM: Final = f"{PROGRAM} hook"
HOOKS_FOLDER: Final = "hooks"
MEMORY_SUFFIX: Final = ".json"
SESSION_UNSAFE: Final = re.compile(r"[^A-Za-z0-9_-]")
SESSION_LENGTH: Final = 128
DEFAULT_SESSION: Final = "session"
COMPACT_SOURCE: Final = "compact"
SESSION_START: Final = "SessionStart"
CONTEXT_EVENTS: Final = frozenset(
    {"PreToolUse", "PostToolUse", "PostToolUseFailure", "UserPromptSubmit", SESSION_START}
)
TOOL_EVENTS: Final[Mapping[str, HookEvent]] = {
    "PreToolUse": PRE_TOOL_USE,
    "PostToolUse": POST_TOOL_USE,
    "PostToolUseFailure": POST_TOOL_USE_FAILURE,
    "UserPromptSubmit": USER_PROMPT_SUBMIT,
}
PLUGIN_SKILL: Final = re.compile(rf"\b{PLUGIN_NAME}:({'|'.join(map(re.escape, SKILL_NAMES))})\b")
STUDIO_PROJECT_OPTION: Final = re.compile(r"--project \.(?=[\s`])")
CURRENT_FOLDER: Final = "."
MEMORY: Final[TypeAdapter[SessionMemory]] = TypeAdapter(SessionMemory)


class HookRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    hook_event_name: str
    session_id: str = DEFAULT_SESSION
    tool_name: str = ""
    tool_input: dict[str, JsonValue] = {}
    tool_response: JsonValue = None
    tool_use_id: str = ""
    source: str = ""

    def moment(self) -> HookMoment | None:
        event = TOOL_EVENTS.get(self.hook_event_name)
        if event is None:
            return None
        return HookMoment(
            event,
            self.session_id,
            tool_name=self.tool_name,
            tool_input=self.tool_input,
            tool_response=self.tool_response,
            tool_use_id=self.tool_use_id,
        )


HOOK_REQUEST: Final[TypeAdapter[HookRequest]] = TypeAdapter(HookRequest)


@dataclass(frozen=True, slots=True)
class MemoryFile:
    path: Path

    @classmethod
    def of(cls, root: Path, name: str, session_id: str) -> MemoryFile:
        session = SESSION_UNSAFE.sub("_", session_id)[:SESSION_LENGTH] or DEFAULT_SESSION
        return cls(root / PROJECT_STATE_FOLDER / HOOKS_FOLDER / f"{session}.{name}{MEMORY_SUFFIX}")

    def load(self) -> SessionMemory:
        try:
            return MEMORY.validate_json(self.path.read_bytes())
        except OSError, ValidationError:
            return SessionMemory()

    def save(self, memory: SessionMemory) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f"{self.path.name}.{os.getpid()}")
        temporary.write_bytes(MEMORY.dump_json(memory))
        temporary.replace(self.path)


@dataclass(frozen=True, slots=True)
class CliWording:
    package: str

    def of(self, text: str) -> str:
        bare = PLUGIN_SKILL.sub(r"\1", text)
        return STUDIO_PROJECT_OPTION.sub(f"--project {self.package}", bare)

    @classmethod
    def of_root(cls, root: Path) -> CliWording:
        return cls(AgentPlace.of(root).package)


class CliHook(Protocol):
    def answer(self, request: HookRequest, memory: MemoryFile) -> str: ...


@dataclass(frozen=True, slots=True)
class ReminderHook:
    root: Path

    def answer(self, request: HookRequest, memory: MemoryFile) -> str:
        moment = request.moment()
        if moment is None:
            return ""
        return CliWording.of_root(self.root).of(asyncio.run(self.reminders(moment, memory)))

    async def reminders(self, moment: HookMoment, memory: MemoryFile) -> str:
        hooks = studio_agent_hooks(self.root)
        remembered = memory.load()
        hooks.memories.sessions[moment.session_id] = remembered
        text = await hooks.reminders(moment)
        memory.save(remembered)
        return text


@dataclass(frozen=True, slots=True)
class CompactionHook:
    root: Path

    def answer(self, request: HookRequest, memory: MemoryFile) -> str:
        if request.hook_event_name != SESSION_START or request.source != COMPACT_SOURCE:
            return ""
        return COMPACTED


type HookFactory = Callable[[Path], CliHook]

HOOKS: Final[Mapping[str, HookFactory]] = {"reminders": ReminderHook, "compaction": CompactionHook}


def hook_output(request: HookRequest, text: str) -> str | None:
    if not text or request.hook_event_name not in CONTEXT_EVENTS:
        return None
    output = {"hookSpecificOutput": {"hookEventName": request.hook_event_name, "additionalContext": text}}
    return json.dumps(output, ensure_ascii=False)


def read_request(source: TextIO) -> HookRequest | None:
    try:
        return HOOK_REQUEST.validate_json(source.read())
    except ValidationError as error:
        print(f"{HOOK_PROGRAM}: the hook event on stdin is not valid: {error.error_count()} problems", file=sys.stderr)
        return None


def project_root(path: str) -> Path | None:
    try:
        return find_project_root(Path(path))
    except ProjectNotFound as error:
        print(f"{HOOK_PROGRAM}: {error}", file=sys.stderr)
        return None


def run_hook(name: str, path: str, source: TextIO, out: TextIO) -> int:
    factory = HOOKS.get(name)
    if factory is None:
        print(f"{HOOK_PROGRAM}: unknown hook {name}; known hooks: {', '.join(HOOKS)}", file=sys.stderr)
        return EXIT_OK
    root = project_root(path)
    request = None if root is None else read_request(source)
    if root is None or request is None:
        return EXIT_OK
    text = factory(root).answer(request, MemoryFile.of(root, name, request.session_id))
    output = hook_output(request, text)
    if output is not None:
        print(output, file=out)
    return EXIT_OK


@dataclass(frozen=True, slots=True)
class HookCommand:
    help: str = (
        "answer one Claude Code hook event read from stdin with reminders for the agent; it never blocks a tool "
        f"call; hooks: {', '.join(HOOKS)}"
    )

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("name", metavar="NAME", help=f"the hook to answer: {', '.join(HOOKS)}")
        parser.add_argument("path", nargs="?", default=CURRENT_FOLDER, help=PATH_HELP)

    def execute(self, arguments: argparse.Namespace) -> int:
        return run_hook(str(arguments.name), str(arguments.path), sys.stdin, sys.stdout)
