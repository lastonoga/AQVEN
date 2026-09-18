import json
from typing import Final

from openai_codex.generated.v2_all import (
    AgentMessageDeltaNotification,
    AgentMessageThreadItem,
    CommandExecutionOutputDeltaNotification,
    CommandExecutionStatus,
    CommandExecutionThreadItem,
    FileChangeOutputDeltaNotification,
    FileChangeThreadItem,
    ItemCompletedNotification,
    ItemStartedNotification,
    McpToolCallStatus,
    McpToolCallThreadItem,
    PatchApplyStatus,
    ReasoningSummaryTextDeltaNotification,
    ReasoningTextDeltaNotification,
    ThreadItem,
    ThreadTokenUsageUpdatedNotification,
)
from openai_codex.models import Notification
from pydantic import TypeAdapter, ValidationError

from aqven.chat.builders import (
    ChatEventBuilders,
    clip,
    command_ran,
    file_edit,
    reasoning_delta,
    text_delta,
    tool_call_args_delta,
    tool_call_finished,
    tool_call_started,
    usage_reported,
)
from aqven.chat.tool_names import ToolIdentity
from aqven.ports.chat import ChatFileChange, ChatMessageId, ChatToolCallId, ChatToolStatus, ChatUsage
from aqven.runtime.address import JsonObject

COMMAND_PREVIEW_LIMIT: Final[int] = 4000
RESULT_PREVIEW_LIMIT: Final[int] = 2000
JSON_OBJECT: Final[TypeAdapter[JsonObject]] = TypeAdapter(JsonObject)


def tool_input(value: object) -> JsonObject:
    try:
        return JSON_OBJECT.validate_python(value)
    except ValidationError:
        return {}


def file_change(kind: str) -> ChatFileChange:
    if kind == "add":
        return "added"
    if kind == "delete":
        return "deleted"
    return "modified"


def command_status(status: CommandExecutionStatus) -> ChatToolStatus:
    if status == CommandExecutionStatus.completed:
        return "ok"
    if status == CommandExecutionStatus.declined:
        return "denied"
    return "error"


def patch_status(status: PatchApplyStatus) -> ChatToolStatus:
    if status == PatchApplyStatus.completed:
        return "ok"
    if status == PatchApplyStatus.declined:
        return "denied"
    return "error"


class CodexNormalizer:
    def __init__(self, message_id: ChatMessageId, model: str | None) -> None:
        self._message_id = message_id
        self._model = model
        self._started: set[str] = set()
        self._text_items: set[str] = set()
        self._commands: dict[str, str] = {}
        self._outputs: dict[str, str] = {}
        self._file_items: dict[str, FileChangeThreadItem] = {}
        self.last_usage: ChatUsage | None = None

    def ensure_tool(self, item_id: str, identity: ToolIdentity) -> ChatEventBuilders:
        if item_id in self._started:
            return ()
        self._started.add(item_id)
        return (tool_call_started(self._message_id, ChatToolCallId(item_id), identity),)

    def file_approval_details(self, item_id: str) -> JsonObject | None:
        item = self._file_items.get(item_id)
        if item is None or not item.changes:
            return None
        return {
            "changes": [
                {"path": change.path, "change": file_change(change.kind.root.type), "diff": change.diff}
                for change in item.changes
            ]
        }

    def normalize(self, notification: Notification) -> ChatEventBuilders:
        payload = notification.payload
        if isinstance(payload, AgentMessageDeltaNotification):
            self._text_items.add(payload.item_id)
            return (text_delta(self._message_id, 0, payload.delta),) if payload.delta else ()
        if isinstance(payload, ReasoningSummaryTextDeltaNotification | ReasoningTextDeltaNotification):
            return (reasoning_delta(self._message_id, 1, payload.delta),) if payload.delta else ()
        if isinstance(payload, ItemStartedNotification):
            return self._start_item(payload.item)
        if isinstance(payload, CommandExecutionOutputDeltaNotification):
            return self._command_output(payload.item_id, payload.delta)
        if isinstance(payload, FileChangeOutputDeltaNotification):
            return ()
        if isinstance(payload, ItemCompletedNotification):
            return self._complete_item(payload.item)
        if isinstance(payload, ThreadTokenUsageUpdatedNotification):
            last = payload.token_usage.last
            usage = ChatUsage(
                model=self._model,
                tokens_in=last.input_tokens,
                tokens_out=last.output_tokens,
                cache_read_tokens=last.cached_input_tokens,
                cache_write_tokens=last.cache_write_input_tokens or 0,
                cost_usd=None,
            )
            self.last_usage = usage
            return (usage_reported(usage),)
        return ()

    def _start_item(self, item: ThreadItem) -> ChatEventBuilders:
        value = item.root
        if isinstance(value, CommandExecutionThreadItem):
            self._commands[value.id] = value.command
            tool_id = ChatToolCallId(value.id)
            started = self.ensure_tool(value.id, ToolIdentity("Bash", None))
            if not started:
                return ()
            return (
                *started,
                tool_call_args_delta(tool_id, json.dumps({"command": value.command})),
            )
        if isinstance(value, FileChangeThreadItem):
            self._file_items[value.id] = value
            return self.ensure_tool(value.id, ToolIdentity("Edit", None))
        if isinstance(value, McpToolCallThreadItem):
            tool_id = ChatToolCallId(value.id)
            arguments = tool_input(value.arguments)
            started = self.ensure_tool(value.id, ToolIdentity(value.tool, value.server))
            if not started:
                return ()
            return (
                *started,
                tool_call_args_delta(tool_id, json.dumps(arguments)),
            )
        return ()

    def _command_output(self, item_id: str, delta: str) -> ChatEventBuilders:
        if not delta:
            return ()
        output = self._outputs.get(item_id, "") + delta
        self._outputs[item_id] = output
        command = self._commands.get(item_id)
        if command is None:
            return ()
        return (command_ran(ChatToolCallId(item_id), command, None, clip(output, COMMAND_PREVIEW_LIMIT)),)

    def _complete_item(self, item: ThreadItem) -> ChatEventBuilders:
        value = item.root
        if isinstance(value, AgentMessageThreadItem):
            if value.id in self._text_items or not value.text:
                return ()
            self._text_items.add(value.id)
            return (text_delta(self._message_id, 0, value.text),)
        if isinstance(value, CommandExecutionThreadItem):
            tool_id = ChatToolCallId(value.id)
            output = value.aggregated_output if value.aggregated_output is not None else self._outputs.get(value.id, "")
            return (
                *self._start_item(item),
                command_ran(tool_id, value.command, None, clip(output, COMMAND_PREVIEW_LIMIT), value.exit_code),
                tool_call_finished(
                    tool_id,
                    command_status(value.status),
                    {"command": value.command},
                    clip(output, RESULT_PREVIEW_LIMIT),
                ),
            )
        if isinstance(value, FileChangeThreadItem):
            tool_id = ChatToolCallId(value.id)
            changes = tuple(
                file_edit(tool_id, change.path, file_change(change.kind.root.type), change.diff)
                for change in value.changes
            )
            return (
                *self._start_item(item),
                *changes,
                tool_call_finished(tool_id, patch_status(value.status), {}, None),
            )
        if isinstance(value, McpToolCallThreadItem):
            tool_id = ChatToolCallId(value.id)
            status: ChatToolStatus = "ok" if value.status == McpToolCallStatus.completed else "error"
            preview = None if value.result is None else clip(value.result.model_dump_json(), RESULT_PREVIEW_LIMIT)
            return (
                *self._start_item(item),
                tool_call_finished(tool_id, status, tool_input(value.arguments), preview),
            )
        return ()
