import difflib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.chat.builders import ChatEventBuilders, clip, command_ran, file_edit
from aqven.chat.claude_wire import (
    BashInputWire,
    EditInputWire,
    MultiEditInputWire,
    WriteInputWire,
    WriteResultWire,
    parse_wire,
)
from aqven.ports.chat import ChatFileChange, ChatToolCallId, ChatToolStatus
from aqven.runtime.address import JsonObject

COMMAND_PREVIEW_LIMIT: Final[int] = 4000
WRITE_CREATED: Final[str] = "create"


@dataclass(frozen=True, slots=True)
class ToolOutcome:
    tool_call_id: ChatToolCallId
    status: ChatToolStatus
    tool_input: JsonObject
    output: str
    result_details: Mapping[str, object] | None
    project_root: Path


type ToolEffect = Callable[[ToolOutcome], ChatEventBuilders]


def project_path(project_root: Path, raw_path: str) -> str:
    path = Path(raw_path)
    if not path.is_absolute():
        return path.as_posix()
    if not path.is_relative_to(project_root):
        return path.as_posix()
    return path.relative_to(project_root).as_posix()


def unified_diff(path: str, before: str, after: str) -> str:
    lines = difflib.unified_diff(
        before.splitlines(keepends=True),
        after.splitlines(keepends=True),
        fromfile=f"a/{path}",
        tofile=f"b/{path}",
    )
    return "".join(lines)


def no_effect(outcome: ToolOutcome) -> ChatEventBuilders:
    return ()


def edit_effect(outcome: ToolOutcome) -> ChatEventBuilders:
    edit = parse_wire(EditInputWire, outcome.tool_input)
    if edit is None or outcome.status != "ok":
        return ()
    path = project_path(outcome.project_root, edit.file_path)
    return (file_edit(outcome.tool_call_id, path, "modified", unified_diff(path, edit.old_string, edit.new_string)),)


def multi_edit_effect(outcome: ToolOutcome) -> ChatEventBuilders:
    edit = parse_wire(MultiEditInputWire, outcome.tool_input)
    if edit is None or outcome.status != "ok":
        return ()
    path = project_path(outcome.project_root, edit.file_path)
    diff = "".join(unified_diff(path, pair.old_string, pair.new_string) for pair in edit.edits)
    return (file_edit(outcome.tool_call_id, path, "modified", diff),)


def write_effect(outcome: ToolOutcome) -> ChatEventBuilders:
    write = parse_wire(WriteInputWire, outcome.tool_input)
    if write is None or outcome.status != "ok":
        return ()
    details = parse_wire(WriteResultWire, outcome.result_details) or WriteResultWire()
    change: ChatFileChange = "added" if details.type == WRITE_CREATED else "modified"
    path = project_path(outcome.project_root, write.file_path)
    diff = unified_diff(path, details.original_file or "", write.content)
    return (file_edit(outcome.tool_call_id, path, change, diff),)


def bash_effect(outcome: ToolOutcome) -> ChatEventBuilders:
    bash = parse_wire(BashInputWire, outcome.tool_input)
    if bash is None:
        return ()
    output = clip(outcome.output, COMMAND_PREVIEW_LIMIT)
    return (command_ran(outcome.tool_call_id, bash.command, bash.description, output),)


CLAUDE_TOOL_EFFECTS: Final[Mapping[str, ToolEffect]] = {
    "Edit": edit_effect,
    "MultiEdit": multi_edit_effect,
    "Write": write_effect,
    "Bash": bash_effect,
}


def claude_tool_effect(raw_name: str) -> ToolEffect:
    return CLAUDE_TOOL_EFFECTS.get(raw_name, no_effect)
