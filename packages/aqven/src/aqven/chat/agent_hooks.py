import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from claude_agent_sdk import HookMatcher
from claude_agent_sdk.types import HookContext, HookEvent, HookInput, HookJSONOutput, SyncHookJSONOutput

from aqven.chat.hook_context import (
    POST_TOOL_USE,
    POST_TOOL_USE_FAILURE,
    PRE_COMPACT,
    PRE_TOOL_USE,
    USER_PROMPT_SUBMIT,
    ContextRule,
    HookMoment,
    SessionMemories,
    SessionMemory,
    context_output,
    hook_moment,
)
from aqven.chat.hook_inputs import ProjectFiles
from aqven.chat.hook_rules import (
    CheckAfterEdit,
    CompactionReminder,
    PreviewAfterEdit,
    ProbeTracker,
    RestReminder,
    SeriesPreflight,
    SeriesWait,
    SkillGuard,
    SkillTracker,
)
from aqven.chat.project_probes import CompiledPreviews, LoadedExperimentAgents, SubprocessCheck

HOOK_EVENTS: Final[tuple[HookEvent, ...]] = (
    PRE_TOOL_USE,
    POST_TOOL_USE,
    POST_TOOL_USE_FAILURE,
    USER_PROMPT_SUBMIT,
    PRE_COMPACT,
)
HOOK_TIMEOUT_SECONDS: Final = 90.0
REMINDER_SEPARATOR: Final = "\n\n"
HOOKS_LOGGER: Final = logging.getLogger("aqven.chat.hooks")


async def safe_reminder(rule: ContextRule, moment: HookMoment, memory: SessionMemory) -> str | None:
    try:
        return await rule.remind(moment, memory)
    except Exception as error:
        HOOKS_LOGGER.warning("chat hook %s failed on %s: %s", type(rule).__name__, moment.event, error)
        return None


@dataclass(frozen=True, slots=True)
class AgentHooks:
    rules: tuple[ContextRule, ...]
    memories: SessionMemories = field(default_factory=SessionMemories)

    def hooks(self) -> dict[HookEvent, list[HookMatcher]]:
        return {
            event: [HookMatcher(matcher=None, hooks=[self.callback], timeout=HOOK_TIMEOUT_SECONDS)]
            for event in HOOK_EVENTS
        }

    async def callback(self, hook_input: HookInput, tool_use_id: str | None, context: HookContext) -> HookJSONOutput:
        moment = hook_moment(hook_input)
        if moment is None:
            return SyncHookJSONOutput()
        return context_output(moment.event, await self.reminders(moment))

    async def reminders(self, moment: HookMoment) -> str:
        memory = self.memories.of(moment.session_id)
        found = await asyncio.gather(*(safe_reminder(rule, moment, memory) for rule in self.rules))
        return REMINDER_SEPARATOR.join(text for text in found if text)


def studio_agent_hooks(project_root: Path) -> AgentHooks:
    files = ProjectFiles.of(project_root)
    return AgentHooks(
        rules=(
            SkillTracker(),
            ProbeTracker(),
            SkillGuard(files),
            CheckAfterEdit(files, SubprocessCheck(files.root)),
            SeriesWait(),
            RestReminder(),
            PreviewAfterEdit(files, CompiledPreviews(files.root)),
            CompactionReminder(),
            SeriesPreflight(LoadedExperimentAgents(files.root)),
        )
    )
