import json
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final

from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.chat.claude_options import AQVEN_MCP_SERVER
from aqven.chat.claude_wire import BashInputWire, WireModel, parse_wire
from aqven.chat.hook_context import HookMoment
from aqven.chat.server_guard import COMMAND_BREAKS, SHELL_TOOL, command_words
from aqven.chat.tool_names import claude_tool_identity
from aqven.loader.roots import project_workspace

WRITE_PATH_FIELDS: Final[Mapping[str, str]] = {
    "Write": "file_path",
    "Edit": "file_path",
    "MultiEdit": "file_path",
    "NotebookEdit": "notebook_path",
}
WRITE_TEXT_FIELDS: Final[tuple[str, ...]] = ("content", "new_string", "new_source")
AQVEN_EXECUTABLES: Final = frozenset({"aqven", "aqven.exe"})
LAUNCHERS: Final = frozenset({"run", "-m", "uvx", "exec"})
JSON_VALUE: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)
JSON_OBJECT_START: Final = "{"


@dataclass(frozen=True, slots=True)
class ProjectFiles:
    root: Path
    workspace: Path

    @classmethod
    def of(cls, root: Path) -> ProjectFiles:
        return cls(root.resolve(), project_workspace(root))

    def absolute(self, raw: str) -> Path:
        path = Path(raw)
        return path if path.is_absolute() else self.root / path

    def inside(self, raw: str) -> PurePosixPath | None:
        path = self.absolute(raw).resolve()
        if not path.is_relative_to(self.root):
            return None
        return PurePosixPath(path.relative_to(self.root).as_posix())

    def forms(self, raw: str) -> tuple[PurePosixPath, ...]:
        path = self.absolute(raw).resolve()
        bases = (base for base in (self.root, self.workspace) if path.is_relative_to(base))
        return tuple(PurePosixPath(path.relative_to(base).as_posix()) for base in bases)


def matches(path: PurePosixPath, patterns: Iterable[str]) -> bool:
    return any(path.full_match(pattern) for pattern in patterns)


def written_path(moment: HookMoment) -> str | None:
    field = WRITE_PATH_FIELDS.get(moment.tool_name)
    value = None if field is None else moment.tool_input.get(field)
    return value if isinstance(value, str) and value else None


class EditPiece(WireModel):
    new_string: str = ""


class MultiEditWire(WireModel):
    edits: tuple[EditPiece, ...] = ()


def written_text(moment: HookMoment) -> str:
    direct = (value for name in WRITE_TEXT_FIELDS if isinstance(value := moment.tool_input.get(name), str))
    pieces = parse_wire(MultiEditWire, moment.tool_input) or MultiEditWire()
    return "\n".join((*direct, *(piece.new_string for piece in pieces.edits)))


def bash_command(moment: HookMoment) -> str | None:
    if moment.tool_name != SHELL_TOOL:
        return None
    bash = parse_wire(BashInputWire, moment.tool_input)
    return None if bash is None else bash.command


def aqven_tool(moment: HookMoment) -> str | None:
    identity = claude_tool_identity(moment.tool_name)
    return identity.name if identity.mcp_server == AQVEN_MCP_SERVER else None


def launched(words: tuple[str, ...], index: int) -> bool:
    previous = words[index - 1] if index > 0 else None
    return previous is None or previous in LAUNCHERS or previous.startswith("-")


def invokes(words: tuple[str, ...], index: int, subcommand: tuple[str, ...]) -> bool:
    called = words[index + 1 : index + 1 + len(subcommand)]
    executable = PurePosixPath(words[index]).name in AQVEN_EXECUTABLES
    return executable and called == subcommand and launched(words, index)


def subcommand_start(words: tuple[str, ...], subcommand: tuple[str, ...]) -> int | None:
    width = len(subcommand)
    found = next((index for index in range(len(words) - width) if invokes(words, index, subcommand)), None)
    return None if found is None else found + 1 + width


def aqven_arguments(command: str, *subcommand: str) -> tuple[str, ...] | None:
    segments = (command_words(segment) for segment in COMMAND_BREAKS.split(command))
    found = ((words, subcommand_start(words, subcommand)) for words in segments)
    return next((words[start:] for words, start in found if start is not None), None)


def option_value(arguments: tuple[str, ...], name: str) -> str | None:
    inline = next((argument.partition("=")[2] for argument in arguments if argument.startswith(f"{name}=")), None)
    if inline is not None:
        return inline
    index = next((position for position, argument in enumerate(arguments) if argument == name), None)
    if index is None or index + 1 >= len(arguments):
        return None
    return arguments[index + 1]


def first_positional(arguments: tuple[str, ...], valued: frozenset[str]) -> str | None:
    values = {position + 1 for position, argument in enumerate(arguments) if argument in valued}
    return next(
        (
            argument
            for position, argument in enumerate(arguments)
            if position not in values and not argument.startswith("-")
        ),
        None,
    )


def embedded_json(text: str) -> tuple[JsonValue, ...]:
    if not text.lstrip().startswith(JSON_OBJECT_START):
        return ()
    try:
        return (JSON_VALUE.validate_python(json.loads(text)),)
    except ValueError:
        return ()


def children(value: JsonValue) -> tuple[JsonValue, ...]:
    if isinstance(value, dict):
        return tuple(value.values())
    if isinstance(value, list):
        return tuple(value)
    if isinstance(value, str):
        return embedded_json(value)
    return ()


def nested_values(value: JsonValue) -> Iterator[JsonValue]:
    yield value
    yield from (item for child in children(value) for item in nested_values(child))


def response_values(response: object) -> Iterator[JsonValue]:
    try:
        root = JSON_VALUE.validate_python(response)
    except ValidationError:
        return iter(())
    return nested_values(root)


def first_record[W: WireModel](model: type[W], response: object) -> W | None:
    records = (parse_wire(model, value) for value in response_values(response) if isinstance(value, dict))
    return next((record for record in records if record is not None), None)
