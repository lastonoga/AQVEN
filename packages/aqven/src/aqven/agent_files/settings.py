import json
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final

from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter, ValidationError

from aqven.agent_files.place import Action, AgentPlace, Change, Drift, read_text, write_text

type JsonObject = dict[str, JsonValue]

JSON_OBJECT: Final[TypeAdapter[JsonObject]] = TypeAdapter(JsonObject)
CLAUDE_SETTINGS: Final = PurePosixPath(".claude", "settings.json")
CLAUDE_SETTINGS_TEMPLATE: Final = "dot-claude/settings.json"
OLD_HOOK_SCRIPT: Final = PurePosixPath(".claude", "hooks", "aqven_check.py")
MCP_CONFIG: Final = PurePosixPath(".mcp.json")
MCP_TEMPLATE: Final = "dot-mcp.json"
CODEX_CONFIG: Final = PurePosixPath(".codex", "config.toml")
CODEX_TEMPLATE: Final = "dot-codex/config.toml"
HOOKS_KEY: Final = "hooks"
HANDLERS_KEY: Final = "hooks"
COMMAND_KEY: Final = "command"
APPROVED_SERVERS_KEY: Final = "enabledMcpjsonServers"
SERVERS_KEY: Final = "mcpServers"
CODEX_SERVERS_KEY: Final = "mcp_servers"
SERVER_NAME: Final = "aqven"
OWN_COMMANDS: Final = ("aqven hook ", OLD_HOOK_SCRIPT.as_posix())
NOT_AN_OBJECT: Final = "is not a JSON object: fix it by hand, then sync again"


@dataclass(frozen=True, slots=True)
class JsonFile:
    exists: bool
    data: JsonObject | None

    @classmethod
    def read(cls, path: Path) -> JsonFile:
        text = read_text(path)
        if text is None:
            return cls(False, {})
        try:
            return cls(True, JSON_OBJECT.validate_json(text))
        except ValidationError:
            return cls(True, None)


def json_text(data: JsonObject) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def template_object(place: AgentPlace, name: str) -> JsonObject:
    return JSON_OBJECT.validate_json(place.template(name))


def own_handler(handler: JsonValue) -> bool:
    command = handler.get(COMMAND_KEY) if isinstance(handler, dict) else None
    return isinstance(command, str) and any(marker in command for marker in OWN_COMMANDS)


def foreign_group(group: JsonValue) -> JsonValue | None:
    handlers = group.get(HANDLERS_KEY) if isinstance(group, dict) else None
    if not isinstance(group, dict) or not isinstance(handlers, list):
        return group
    kept: list[JsonValue] = [handler for handler in handlers if not own_handler(handler)]
    return {**group, HANDLERS_KEY: kept} if kept else None


def foreign_groups(groups: JsonValue) -> list[JsonValue]:
    listed: list[JsonValue] = groups if isinstance(groups, list) else []
    kept = (foreign_group(group) for group in listed)
    return [group for group in kept if group is not None]


def as_object(value: JsonValue) -> JsonObject:
    return value if isinstance(value, dict) else {}


def as_list(value: JsonValue) -> list[JsonValue]:
    return value if isinstance(value, list) else []


def merged_hooks(current: JsonObject, wanted: JsonObject) -> JsonObject:
    events = dict.fromkeys((*current, *wanted))
    merged = {event: [*foreign_groups(current.get(event)), *as_list(wanted.get(event))] for event in events}
    return {event: groups for event, groups in merged.items() if groups}


def merged_servers(current: JsonValue, wanted: JsonValue) -> list[JsonValue]:
    present = as_list(current)
    return [*present, *(server for server in as_list(wanted) if server not in present)]


def merged_settings(current: JsonObject, wanted: JsonObject) -> JsonObject:
    hooks = merged_hooks(as_object(current.get(HOOKS_KEY)), as_object(wanted.get(HOOKS_KEY)))
    servers = merged_servers(current.get(APPROVED_SERVERS_KEY), wanted.get(APPROVED_SERVERS_KEY))
    return {**current, APPROVED_SERVERS_KEY: servers, HOOKS_KEY: hooks}


@dataclass(frozen=True, slots=True)
class ClaudeSettings:
    def drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        return (*self.settings_drift(place), *self.script_drift(place))

    def script_drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        if not place.path(OLD_HOOK_SCRIPT).is_file():
            return ()
        return (Drift(OLD_HOOK_SCRIPT.as_posix(), "is the old hook script, replaced by aqven hook"),)

    def settings_drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        current = JsonFile.read(place.path(CLAUDE_SETTINGS))
        if current.data is None:
            return (Drift(CLAUDE_SETTINGS.as_posix(), NOT_AN_OBJECT),)
        if not current.exists:
            return (Drift(CLAUDE_SETTINGS.as_posix(), "is missing"),)
        if merged_settings(current.data, template_object(place, CLAUDE_SETTINGS_TEMPLATE)) == current.data:
            return ()
        return (Drift(CLAUDE_SETTINGS.as_posix(), "lacks the aqven hooks or the approval of the aqven MCP server"),)

    def sync(self, place: AgentPlace) -> tuple[Change, ...]:
        return (*self.sync_settings(place), *self.remove_old_script(place))

    def sync_settings(self, place: AgentPlace) -> tuple[Change, ...]:
        if not self.settings_drift(place):
            return ()
        current = JsonFile.read(place.path(CLAUDE_SETTINGS))
        if current.data is None:
            return (Change(Action.KEPT, CLAUDE_SETTINGS.as_posix(), NOT_AN_OBJECT),)
        wanted = merged_settings(current.data, template_object(place, CLAUDE_SETTINGS_TEMPLATE))
        write_text(place.path(CLAUDE_SETTINGS), json_text(wanted))
        return (Change(Action.WROTE, CLAUDE_SETTINGS.as_posix(), "aqven hooks and the aqven MCP server approval"),)

    def remove_old_script(self, place: AgentPlace) -> tuple[Change, ...]:
        script = place.path(OLD_HOOK_SCRIPT)
        if not script.is_file():
            return ()
        script.unlink()
        if not any(script.parent.iterdir()):
            script.parent.rmdir()
        return (Change(Action.REMOVED, OLD_HOOK_SCRIPT.as_posix(), "replaced by aqven hook"),)


@dataclass(frozen=True, slots=True)
class McpServer:
    def wanted(self, place: AgentPlace) -> JsonValue:
        return as_object(template_object(place, MCP_TEMPLATE).get(SERVERS_KEY)).get(SERVER_NAME)

    def problem(self, place: AgentPlace) -> str | None:
        current = JsonFile.read(place.path(MCP_CONFIG))
        if not current.exists:
            return "is missing"
        if current.data is None:
            return NOT_AN_OBJECT
        server = as_object(current.data.get(SERVERS_KEY)).get(SERVER_NAME)
        if server is None:
            return f"has no {SERVER_NAME} server"
        wanted = self.wanted(place)
        return None if server == wanted else f"has another {SERVER_NAME} server than {json.dumps(wanted)}"

    def drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        problem = self.problem(place)
        return () if problem is None else (Drift(MCP_CONFIG.as_posix(), problem),)

    def sync(self, place: AgentPlace) -> tuple[Change, ...]:
        problem = self.problem(place)
        if problem is None:
            return ()
        path = place.path(MCP_CONFIG)
        current = JsonFile.read(path)
        if not current.exists:
            write_text(path, place.template(MCP_TEMPLATE))
            return (Change(Action.WROTE, MCP_CONFIG.as_posix(), "new file"),)
        if current.data is None or SERVER_NAME in as_object(current.data.get(SERVERS_KEY)):
            return (Change(Action.KEPT, MCP_CONFIG.as_posix(), problem),)
        servers = {**as_object(current.data.get(SERVERS_KEY)), SERVER_NAME: self.wanted(place)}
        write_text(path, json_text({**current.data, SERVERS_KEY: servers}))
        return (Change(Action.WROTE, MCP_CONFIG.as_posix(), f"added the {SERVER_NAME} server"),)


class CodexDocument(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    mcp_servers: dict[str, dict[str, object]] = {}


def codex_servers(text: str) -> Mapping[str, Mapping[str, object]] | None:
    try:
        return CodexDocument.model_validate(tomllib.loads(text)).mcp_servers
    except tomllib.TOMLDecodeError, ValidationError:
        return None


@dataclass(frozen=True, slots=True)
class CodexMcpServer:
    def wanted(self, place: AgentPlace) -> Mapping[str, object] | None:
        return (codex_servers(place.template(CODEX_TEMPLATE)) or {}).get(SERVER_NAME)

    def problem(self, place: AgentPlace) -> str | None:
        text = read_text(place.path(CODEX_CONFIG))
        if text is None:
            return "is missing"
        servers = codex_servers(text)
        if servers is None:
            return "is not valid TOML: fix it by hand, then sync again"
        if SERVER_NAME not in servers:
            return f"has no [{CODEX_SERVERS_KEY}.{SERVER_NAME}] table"
        if servers[SERVER_NAME] == self.wanted(place):
            return None
        return f"has another [{CODEX_SERVERS_KEY}.{SERVER_NAME}] table than:\n{place.template(CODEX_TEMPLATE)}"

    def drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        problem = self.problem(place)
        return () if problem is None else (Drift(CODEX_CONFIG.as_posix(), problem),)

    def sync(self, place: AgentPlace) -> tuple[Change, ...]:
        problem = self.problem(place)
        if problem is None:
            return ()
        path = place.path(CODEX_CONFIG)
        text = read_text(path)
        table = place.template(CODEX_TEMPLATE)
        if text is None or not text.strip():
            write_text(path, table)
            return (Change(Action.WROTE, CODEX_CONFIG.as_posix(), "new file"),)
        servers = codex_servers(text)
        if servers is None or SERVER_NAME in servers:
            return (Change(Action.KEPT, CODEX_CONFIG.as_posix(), problem),)
        separator = "\n" if text.endswith("\n") else "\n\n"
        write_text(path, f"{text}{separator}{table}")
        return (Change(Action.WROTE, CODEX_CONFIG.as_posix(), f"added [{CODEX_SERVERS_KEY}.{SERVER_NAME}]"),)
