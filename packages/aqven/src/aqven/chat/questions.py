from collections.abc import Mapping
from typing import Final

from aqven.chat.claude_wire import json_object
from aqven.runtime.address import JsonObject

QUESTION_TOOL: Final[str] = "AskUserQuestion"


def answered_input(
    tool_name: str, tool_input: Mapping[str, object], answers: Mapping[str, str] | None
) -> JsonObject | None:
    if tool_name != QUESTION_TOOL or not answers:
        return None
    return json_object({**tool_input, "answers": dict(answers)})
