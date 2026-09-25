import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Final, Protocol

from claude_agent_sdk import HookMatcher
from claude_agent_sdk.types import (
    HookContext,
    HookEvent,
    HookInput,
    HookJSONOutput,
    PreToolUseHookSpecificOutput,
    SyncHookJSONOutput,
)
from dotenv import dotenv_values

from aqven.ports.settings import PROJECT_ENV_FILE, project_env_file

ENV_SUFFIX: Final = PROJECT_ENV_FILE
ENV_VARIANT_PREFIX: Final = f"{PROJECT_ENV_FILE}."
ENV_NAME_PROBES: Final = (PROJECT_ENV_FILE, f"{PROJECT_ENV_FILE}.local", f"app{PROJECT_ENV_FILE}")
ENV_RULE_PATTERNS: Final = (f"**/{PROJECT_ENV_FILE}", f"**/{PROJECT_ENV_FILE}.*", f"**/*{PROJECT_ENV_FILE}")
RULE_ROOTS: Final = ("", "//")
RULE_TOOLS: Final = ("Read", "Edit")
WILDCARDS: Final = frozenset("*?[")
QUOTING: Final = str.maketrans("", "", "'\"\\")
TEXT_SEPARATORS: Final = re.compile(r"""[\s/`=;:,|&<>(){}\[\]$]+""")
PROCESS_ENV_NAME: Final = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
PRE_TOOL_USE: Final[HookEvent] = "PreToolUse"
SECRET_FILE_REASON: Final = (
    "AQVEN keeps provider keys and secrets in .env files, so the Studio chat agent may not read, search or edit them. "
    "Manage keys in Studio settings instead."
)

type InputTexts = Callable[[Mapping[str, object]], tuple[str, ...]]
type Violation = Callable[[str, Mapping[str, object]], str | None]


class ToolRule(Protocol):
    def violation(self, tool_name: str, tool_input: Mapping[str, object]) -> str | None: ...


class HookSource(Protocol):
    def hooks(self) -> dict[HookEvent, list[HookMatcher]]: ...


class ChatGuard(ToolRule, HookSource, Protocol):
    def permission_rules(self, protected_files: Iterable[Path]) -> list[str]: ...


@dataclass(frozen=True, slots=True)
class NoHooks:
    def hooks(self) -> dict[HookEvent, list[HookMatcher]]:
        return {}


def merged_hooks(*sources: Mapping[HookEvent, list[HookMatcher]]) -> dict[HookEvent, list[HookMatcher]]:
    events: dict[HookEvent, None] = dict.fromkeys(event for source in sources for event in source)
    return {event: [matcher for source in sources for matcher in source.get(event, ())] for event in events}


def input_fields(*names: str) -> InputTexts:
    def texts(tool_input: Mapping[str, object]) -> tuple[str, ...]:
        return tuple(value for name in names if isinstance(value := tool_input.get(name), str))

    return texts


def no_texts(tool_input: Mapping[str, object]) -> tuple[str, ...]:
    return ()


GUARDED_TOOLS: Final[Mapping[str, InputTexts]] = {
    "Read": input_fields("file_path"),
    "Write": input_fields("file_path"),
    "Edit": input_fields("file_path"),
    "MultiEdit": input_fields("file_path"),
    "NotebookEdit": input_fields("notebook_path"),
    "Grep": input_fields("path", "glob"),
    "Glob": input_fields("path", "pattern"),
    "Bash": input_fields("command"),
}
GUARDED_TOOL_MATCHER: Final = "|".join(GUARDED_TOOLS)


def unquoted(segment: str) -> str:
    return segment.translate(QUOTING)


def names_env_file(raw_segment: str) -> bool:
    segment = unquoted(raw_segment)
    if not segment:
        return False
    if WILDCARDS.isdisjoint(segment):
        return segment.startswith(ENV_VARIANT_PREFIX) or segment.endswith(ENV_SUFFIX)
    if not any(character.isalnum() for character in segment):
        return False
    return any(fnmatchcase(probe, segment) for probe in ENV_NAME_PROBES)


def rule_path(path: Path) -> str:
    return f"/{path.as_posix()}" if path.is_absolute() else path.as_posix()


def file_rules(paths: Iterable[Path]) -> tuple[str, ...]:
    return tuple(f"{tool}({rule_path(path)})" for path in paths for tool in RULE_TOOLS)


def env_file_rules() -> tuple[str, ...]:
    return tuple(
        f"{tool}({root}{pattern})" for tool in RULE_TOOLS for root in RULE_ROOTS for pattern in ENV_RULE_PATTERNS
    )


def dotenv_names(project_root: Path) -> tuple[str, ...]:
    path = project_env_file(project_root)
    if not path.is_file():
        return ()
    return tuple(name for name in dotenv_values(path, interpolate=False) if PROCESS_ENV_NAME.fullmatch(name))


def scrubbed_environment(project_root: Path) -> dict[str, str]:
    return dict.fromkeys(dotenv_names(project_root), "")


def denied_tool_use(reason: str) -> SyncHookJSONOutput:
    decision = PreToolUseHookSpecificOutput(
        hookEventName="PreToolUse", permissionDecision="deny", permissionDecisionReason=reason
    )
    return SyncHookJSONOutput(hookSpecificOutput=decision)


def refusal(violation: Violation, hook_input: HookInput) -> HookJSONOutput:
    if hook_input["hook_event_name"] != "PreToolUse":
        return SyncHookJSONOutput()
    reason = violation(hook_input["tool_name"], hook_input["tool_input"])
    if reason is None:
        return SyncHookJSONOutput()
    return denied_tool_use(reason)


@dataclass(frozen=True, slots=True)
class SecretFileGuard:
    protected_markers: tuple[str, ...] = ()

    def violation(self, tool_name: str, tool_input: Mapping[str, object]) -> str | None:
        texts = GUARDED_TOOLS.get(tool_name, no_texts)(tool_input)
        if not any(self.touches(text) for text in texts):
            return None
        return SECRET_FILE_REASON

    def touches(self, text: str) -> bool:
        if any(marker in text for marker in self.protected_markers):
            return True
        return any(names_env_file(segment) for segment in TEXT_SEPARATORS.split(text) if segment)

    def permission_rules(self, protected_files: Iterable[Path]) -> list[str]:
        return [*env_file_rules(), *file_rules(protected_files)]

    def hooks(self) -> dict[HookEvent, list[HookMatcher]]:
        return {PRE_TOOL_USE: [HookMatcher(matcher=GUARDED_TOOL_MATCHER, hooks=[self.pre_tool_use])]}

    async def pre_tool_use(
        self, hook_input: HookInput, tool_use_id: str | None, context: HookContext
    ) -> HookJSONOutput:
        return refusal(self.violation, hook_input)


@dataclass(frozen=True, slots=True)
class GuardChain:
    secrets: SecretFileGuard
    rules: tuple[ToolRule, ...] = ()
    reminders: HookSource = field(default_factory=NoHooks)

    def violation(self, tool_name: str, tool_input: Mapping[str, object]) -> str | None:
        reasons = (rule.violation(tool_name, tool_input) for rule in (self.secrets, *self.rules))
        return next((reason for reason in reasons if reason is not None), None)

    def permission_rules(self, protected_files: Iterable[Path]) -> list[str]:
        return self.secrets.permission_rules(protected_files)

    def hooks(self) -> dict[HookEvent, list[HookMatcher]]:
        own: dict[HookEvent, list[HookMatcher]] = {
            PRE_TOOL_USE: [HookMatcher(matcher=GUARDED_TOOL_MATCHER, hooks=[self.pre_tool_use])]
        }
        return merged_hooks(own, self.reminders.hooks())

    async def pre_tool_use(
        self, hook_input: HookInput, tool_use_id: str | None, context: HookContext
    ) -> HookJSONOutput:
        return refusal(self.violation, hook_input)
