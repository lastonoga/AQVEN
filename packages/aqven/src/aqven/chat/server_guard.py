import os
import re
import shlex
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Final
from urllib.parse import urlsplit

SHELL_TOOL: Final = "Bash"
KILL_COMMAND: Final = "kill"
END_OF_OPTIONS: Final = "--"
SIGNAL_OPTIONS: Final = frozenset({"-s", "-n"})
PROCESS_GROUP_TARGET: Final = "0"
SERVER_PROCESS_REASON: Final = (
    "This chat runs inside the AQVEN project server, so the Studio chat agent may not stop, kill or restart that "
    "server or start another aqven dev/serve: the conversation would end with it. No restart is needed to pick up "
    "code changes: the server imports changed project Python files (steps, tools, generated types) again on the "
    "next run. If the server really has to restart, ask the user to do it."
)
KILL_VERBS: Final = re.compile(r"\b(?:kill|pkill|killall|taskkill|killpg)\b|\.terminate\(|\.send_signal\(")
SERVER_LAUNCH: Final = re.compile(r"(?:^|[\s;&|(`])(?:\S*/)?aqven(?:\.exe)?\s+(?:dev|serve|studio)\b")
SERVER_ENDPOINTS: Final = (re.compile(r"/api/health\b"), re.compile(r"\bserver\.json\b"))
PROCESS_SEARCH: Final = re.compile(r"\b(?:pkill|killall|pgrep|pidof)\b(?P<pattern>[^;&|\n)]*)")
SERVER_PROCESS_NAMES: Final = re.compile(r"\b(?:aqven|uvicorn|python[\d.]*|Python|uv)\b")
GROUP_SIGNAL_CALL: Final = re.compile(r"\bkillpg\b")
COMMAND_BREAKS: Final = re.compile(r"\$\(|[;&|\n()`]")

type CommandCheck = Callable[[str], bool]


@dataclass(frozen=True, slots=True)
class ServerProcess:
    pid: int
    port: int | None

    @classmethod
    def current(cls, url: str) -> ServerProcess:
        return cls(pid=os.getpid(), port=urlsplit(url).port)

    def markers(self) -> tuple[re.Pattern[str], ...]:
        port = () if self.port is None else (re.compile(rf"\b{self.port}\b"),)
        return (re.compile(rf"\b{self.pid}\b"), *port, *SERVER_ENDPOINTS)


def command_words(segment: str) -> tuple[str, ...]:
    try:
        return tuple(shlex.split(segment))
    except ValueError:
        return tuple(segment.split())


def is_kill(word: str) -> bool:
    return PurePosixPath(word).name == KILL_COMMAND


def signal_skipped(arguments: tuple[str, ...]) -> tuple[str, ...]:
    head = arguments[0] if arguments else END_OF_OPTIONS
    if head in SIGNAL_OPTIONS:
        return arguments[2:]
    if head == END_OF_OPTIONS or not head.startswith("-"):
        return arguments
    return arguments[1:]


def options_ended(arguments: tuple[str, ...]) -> tuple[str, ...]:
    return arguments[1:] if arguments[:1] == (END_OF_OPTIONS,) else arguments


def kill_targets(segment: str) -> tuple[str, ...]:
    words = command_words(segment)
    position = next((index for index, word in enumerate(words) if is_kill(word)), None)
    if position is None:
        return ()
    return options_ended(signal_skipped(words[position + 1 :]))


def is_group_target(target: str) -> bool:
    return target == PROCESS_GROUP_TARGET or (target.startswith("-") and target[1:].isdigit())


def kills_process_group(command: str) -> bool:
    if GROUP_SIGNAL_CALL.search(command) is not None:
        return True
    targets = (target for segment in COMMAND_BREAKS.split(command) for target in kill_targets(segment))
    return any(is_group_target(target) for target in targets)


def searches_server_process(command: str) -> bool:
    return any(SERVER_PROCESS_NAMES.search(match["pattern"]) for match in PROCESS_SEARCH.finditer(command))


def launches_server(command: str) -> bool:
    return SERVER_LAUNCH.search(command) is not None


@dataclass(frozen=True, slots=True)
class ServerProcessGuard:
    server: ServerProcess | None = None

    def violation(self, tool_name: str, tool_input: Mapping[str, object]) -> str | None:
        if tool_name != SHELL_TOOL:
            return None
        command = tool_input.get("command")
        if not isinstance(command, str) or not self.threatens(command):
            return None
        return SERVER_PROCESS_REASON

    def threatens(self, command: str) -> bool:
        checks: tuple[CommandCheck, ...] = (launches_server, self.kills_server)
        return any(check(command) for check in checks)

    def kills_server(self, command: str) -> bool:
        if KILL_VERBS.search(command) is None:
            return False
        checks: tuple[CommandCheck, ...] = (kills_process_group, searches_server_process, self.names_server)
        return any(check(command) for check in checks)

    def names_server(self, command: str) -> bool:
        markers = SERVER_ENDPOINTS if self.server is None else self.server.markers()
        return any(marker.search(command) is not None for marker in markers)
