from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Final, Protocol

from claude_agent_sdk.types import (
    HookEvent,
    HookInput,
    HookSpecificOutput,
    PostToolUseFailureHookSpecificOutput,
    PostToolUseHookSpecificOutput,
    PreToolUseHookSpecificOutput,
    SyncHookJSONOutput,
    UserPromptSubmitHookSpecificOutput,
)

from aqven.chat.project_probes import TreeFingerprint

PRE_TOOL_USE: Final[HookEvent] = "PreToolUse"
POST_TOOL_USE: Final[HookEvent] = "PostToolUse"
POST_TOOL_USE_FAILURE: Final[HookEvent] = "PostToolUseFailure"
AFTER_TOOL_USE: Final[frozenset[HookEvent]] = frozenset({POST_TOOL_USE, POST_TOOL_USE_FAILURE})
USER_PROMPT_SUBMIT: Final[HookEvent] = "UserPromptSubmit"
PRE_COMPACT: Final[HookEvent] = "PreCompact"


@dataclass(frozen=True, slots=True)
class HookMoment:
    event: HookEvent
    session_id: str
    tool_name: str = ""
    tool_input: Mapping[str, object] = field(default_factory=dict[str, object])
    tool_response: object = None
    tool_use_id: str = ""

    def is_tool(self, event: HookEvent, *names: str) -> bool:
        return self.event == event and self.tool_name in names


@dataclass(slots=True)
class SessionMemory:
    loaded_skills: set[str] = field(default_factory=set[str])
    reminded: set[str] = field(default_factory=set[str])
    probed_agents: set[str] = field(default_factory=set[str])
    probed_all: bool = False
    compacted: bool = False
    diagnostics: tuple[str, ...] = ()
    previews: Mapping[str, str] | None = None
    fingerprints: dict[str, TreeFingerprint] = field(default_factory=dict[str, TreeFingerprint])

    def first_time(self, key: str) -> bool:
        if key in self.reminded:
            return False
        self.reminded.add(key)
        return True


@dataclass(slots=True)
class SessionMemories:
    sessions: dict[str, SessionMemory] = field(default_factory=dict[str, SessionMemory])

    def of(self, session_id: str) -> SessionMemory:
        return self.sessions.setdefault(session_id, SessionMemory())


class ContextRule(Protocol):
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None: ...


def hook_moment(hook_input: HookInput) -> HookMoment | None:
    session_id = hook_input["session_id"]
    if hook_input["hook_event_name"] == "PreToolUse":
        return HookMoment(
            PRE_TOOL_USE,
            session_id,
            tool_name=hook_input["tool_name"],
            tool_input=hook_input["tool_input"],
            tool_use_id=hook_input["tool_use_id"],
        )
    if hook_input["hook_event_name"] == "PostToolUse":
        return HookMoment(
            POST_TOOL_USE,
            session_id,
            tool_name=hook_input["tool_name"],
            tool_input=hook_input["tool_input"],
            tool_response=hook_input["tool_response"],
            tool_use_id=hook_input["tool_use_id"],
        )
    if hook_input["hook_event_name"] == "PostToolUseFailure":
        return HookMoment(
            POST_TOOL_USE_FAILURE,
            session_id,
            tool_name=hook_input["tool_name"],
            tool_input=hook_input["tool_input"],
            tool_use_id=hook_input["tool_use_id"],
        )
    if hook_input["hook_event_name"] == "UserPromptSubmit":
        return HookMoment(USER_PROMPT_SUBMIT, session_id)
    if hook_input["hook_event_name"] == "PreCompact":
        return HookMoment(PRE_COMPACT, session_id)
    return None


CONTEXT_OUTPUTS: Final[Mapping[HookEvent, Callable[[str], HookSpecificOutput]]] = {
    PRE_TOOL_USE: lambda text: PreToolUseHookSpecificOutput(hookEventName="PreToolUse", additionalContext=text),
    POST_TOOL_USE: lambda text: PostToolUseHookSpecificOutput(hookEventName="PostToolUse", additionalContext=text),
    POST_TOOL_USE_FAILURE: lambda text: PostToolUseFailureHookSpecificOutput(
        hookEventName="PostToolUseFailure", additionalContext=text
    ),
    USER_PROMPT_SUBMIT: lambda text: UserPromptSubmitHookSpecificOutput(
        hookEventName="UserPromptSubmit", additionalContext=text
    ),
}


def context_output(event: HookEvent, text: str) -> SyncHookJSONOutput:
    build = CONTEXT_OUTPUTS.get(event)
    if build is None or not text:
        return SyncHookJSONOutput()
    return SyncHookJSONOutput(hookSpecificOutput=build(text))
