import asyncio
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Final

from aqven.chat.agent_plugin import bare_skill, plugin_skill
from aqven.chat.claude_wire import WireModel
from aqven.chat.hook_context import (
    AFTER_TOOL_USE,
    POST_TOOL_USE,
    PRE_COMPACT,
    PRE_TOOL_USE,
    USER_PROMPT_SUBMIT,
    HookMoment,
    SessionMemory,
)
from aqven.chat.hook_inputs import (
    WRITE_PATH_FIELDS,
    ProjectFiles,
    aqven_arguments,
    aqven_tool,
    bash_command,
    first_positional,
    first_record,
    matches,
    option_value,
    written_path,
    written_text,
)
from aqven.chat.project_probes import (
    CheckOutcome,
    ExperimentAgents,
    ProjectCheck,
    PromptPreviews,
    TreeFingerprint,
    tree_fingerprint,
)
from aqven.codegen import GENERATED_TYPES
from aqven.diagnostics import Diagnostic, Severity
from aqven.loader.layout import EXPERIMENT_NOTES, FINDINGS_FILE, PROJECT_FILE
from aqven.series.model import SeriesStatus
from aqven.spec import SeriesSplit

SKILL_TOOL: Final = "Skill"
FILE_TOOLS: Final = frozenset(WRITE_PATH_FIELDS)
SERIES_TOOLS: Final = frozenset({"series_start", "series_get"})
MEDIA_SKILL: Final = "preparing-media-inputs"
SERIES_SKILL: Final = "running-series"
JOURNAL_FILE: Final = "EXPERIMENTS.md"
STATE_FOLDER: Final = ".aqven"
PATH_SKILLS: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    ("flows/**", ("building-flows",)),
    ("experiments/*/nodes/**", ("building-flows", "designing-experiments")),
    ("experiments/*/prompts/**", ("building-flows", "designing-experiments")),
    ("experiments/*/flows/**", ("building-flows", "designing-experiments")),
    ("experiments/*/experiment.y*ml", ("designing-experiments",)),
    ("agents/**", ("choosing-models",)),
    (PROJECT_FILE, ("choosing-models",)),
    ("types/**", ("designing-output-contracts",)),
    ("**/*.inference.y*ml", ("designing-output-contracts",)),
    ("datasets/**", ("building-datasets",)),
    ("scripts/build_*.py", ("building-datasets",)),
    (JOURNAL_FILE, ("reporting-results",)),
)
SKILL_TOPICS: Final[Mapping[str, str]] = {
    "building-flows": "node kinds, the file layout, prompt variants and fragments, and flow_patch",
    "designing-experiments": "the one factor, variants as rows and checks as columns, controls and the question",
    "choosing-models": "provider options, rate limits, fallbacks and live probes",
    "designing-output-contracts": "required fields, refusal as a state and output budgets",
    "building-datasets": "labels, tags, splits and the builder script",
    "reporting-results": "the journal entry and what a report to the owner leads with",
    MEDIA_SKILL: "EXIF orientation, crops and provider pixel limits",
    SERIES_SKILL: "the background wait, the 90% spend pause and how 429 is handled",
}
MEDIA_TYPE: Final = re.compile(r"(?<![A-Za-z0-9_])Image(?:\[\])?(?![A-Za-z0-9_])")
MEDIA_SUFFIXES: Final = frozenset({".yaml", ".yml", ".py"})
DEFINITION_SUFFIXES: Final = frozenset({".yaml", ".yml", ".md", ".py", ".liquid"})
NOTE_FILES: Final = frozenset({JOURNAL_FILE, FINDINGS_FILE, EXPERIMENT_NOTES, "AGENTS.md", "CLAUDE.md", "README.md"})
PREVIEW_PATTERNS: Final = (
    "**/*.prompt.md",
    "**/*.variants/**",
    "**/*.inference.y*ml",
    "fragments/**",
    "types/**",
    "agents/**",
)
REPORTED_LINES: Final = 10
SERIES_VALUED: Final = frozenset({"--on", "--cases", "--repeats", "--cap", "--path"})
MODELS_VALUED: Final = frozenset({"--project", "--provider-options"})
LIVE_FLAG: Final = "--live"
ALL_AGENTS: Final = "*"
CHECK_CLEAN: Final = (
    "aqven check --static passes again after this change. It covers the static rules only: aqven_check also "
    "simulates every flow."
)
FOREGROUND_SERIES: Final = (
    "Run `uv run aqven series` in the background (Bash with run_in_background: true): in the foreground the shell "
    "times out before the verdict, in the background its end wakes you with a new turn. Say that you are waiting "
    "and end the turn."
)
RUNNING_SERIES: Final = (
    "Series {series_id} is running and nothing wakes you when it ends: before you end the turn, follow it with "
    "series_get and wait_seconds: 50, or tell the owner in one line that you stopped watching it. Never poll with "
    "sleep or raw HTTP."
)
COMPACTED: Final = (
    "A compaction happened: re-read EXPERIMENTS.md, FINDINGS.md and the skill of your current step before you go "
    "on. Engine facts from the summary are unverified."
)
HOLDOUT_NOTE: Final = (
    "Before a holdout series of {experiment}, tell the owner in one line what claim it tests, why now and what each "
    "verdict would mean, and make sure the last dev series of it had infra errors below 5%."
)
UNPROBED_AGENTS: Final = (
    "This series compares {agents} with no `uv run aqven models check <agent> --project . --live` in this session: "
    "probe their output modes before you spend on it. When your shell has no provider key, ask the owner to run it."
)
PREVIEW_HEADER: Final = "prompt_preview of the llm nodes this change touched, on sample input:"
PREVIEW_FOOTER: Final = "Read the full prompt_preview of each before you run it."


@dataclass(frozen=True, slots=True)
class RestRoute:
    key: str
    pattern: re.Pattern[str]
    advice: str


HTTP_CLIENT: Final = re.compile(r"\b(?:curl|wget|xh|urllib|urlopen|httpx2?|requests)\b|\bhttps?\b(?!://)")
REST_ROUTES: Final[tuple[RestRoute, ...]] = (
    RestRoute(
        "series_approve",
        re.compile(r"/api/series/[^/\s'\"]+/approve"),
        "Only the owner approves spend, in Studio: report pause.reason and pause.spent_usd and wait.",
    ),
    RestRoute(
        "series",
        re.compile(r"/api/series\b"),
        "Use the aqven MCP tools series_start, series_get with wait_seconds and series_cancel, or "
        "`uv run aqven series` in the background, instead of raw HTTP to /api/series.",
    ),
    RestRoute(
        "prompt_preview",
        re.compile(r"/api/flows/\S*/prompt/preview"),
        "Use the aqven MCP tool prompt_preview, or `uv run aqven prompt preview`, instead of raw HTTP.",
    ),
    RestRoute(
        "runs",
        re.compile(r"/api/runs\b"),
        "Use the aqven MCP tools run_start, run_get, run_list, run_events, run_get_node, run_resume, run_fork and "
        "run_cancel instead of raw HTTP to /api/runs.",
    ),
)


@dataclass(frozen=True, slots=True)
class SeriesLaunch:
    experiment_id: str
    split: str


class SeriesStateWire(WireModel):
    series_id: str
    status: str


class SeriesStartWire(WireModel):
    experiment_id: str
    on: str = SeriesSplit.DEV.value


def skill_reminder(skill: str) -> str:
    return (
        f"Load {plugin_skill(skill)} with the Skill tool before this: it holds {SKILL_TOPICS[skill]}. "
        "This call goes through either way."
    )


def launches_series(moment: HookMoment) -> bool:
    command = bash_command(moment)
    return command is not None and aqven_arguments(command, "series") is not None


def series_skills(moment: HookMoment) -> tuple[str, ...]:
    return (SERIES_SKILL,) if launches_series(moment) or aqven_tool(moment) in SERIES_TOOLS else ()


@dataclass(frozen=True, slots=True)
class SkillTracker:
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        name = moment.tool_input.get("skill")
        if not moment.is_tool(POST_TOOL_USE, SKILL_TOOL) or not isinstance(name, str):
            return None
        memory.loaded_skills.add(bare_skill(name))
        return None


@dataclass(frozen=True, slots=True)
class SkillGuard:
    files: ProjectFiles

    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        if moment.event != PRE_TOOL_USE:
            return None
        wanted = tuple(skill for skill in self.needed(moment) if skill not in memory.loaded_skills)
        fresh = tuple(skill for skill in wanted if memory.first_time(f"skill:{skill}"))
        return "\n".join(skill_reminder(skill) for skill in fresh) or None

    def needed(self, moment: HookMoment) -> tuple[str, ...]:
        found = (*self.path_skills(moment), *self.media_skills(moment), *series_skills(moment))
        return tuple(dict.fromkeys(found))

    def path_skills(self, moment: HookMoment) -> tuple[str, ...]:
        raw = written_path(moment)
        forms = () if raw is None else self.files.forms(raw)
        return tuple(skill for pattern, skills in PATH_SKILLS if matches_any(forms, pattern) for skill in skills)

    def media_skills(self, moment: HookMoment) -> tuple[str, ...]:
        raw = written_path(moment)
        inside = None if raw is None else self.files.inside(raw)
        if inside is None or inside.suffix not in MEDIA_SUFFIXES:
            return ()
        return (MEDIA_SKILL,) if MEDIA_TYPE.search(written_text(moment)) else ()


def matches_any(forms: tuple[PurePosixPath, ...], pattern: str) -> bool:
    return any(form.full_match(pattern) for form in forms)


def defines_project(path: PurePosixPath) -> bool:
    if path.suffix not in DEFINITION_SUFFIXES or path.name in NOTE_FILES:
        return False
    return not path.is_relative_to(STATE_FOLDER) and path.as_posix() != GENERATED_TYPES


def checks_itself(command: str) -> bool:
    return any(aqven_arguments(command, name) is not None for name in ("check", "generate"))


def diagnostic_line(item: Diagnostic) -> str:
    place = item.file if item.line is None else f"{item.file}:{item.line}"
    return f"- {item.code} {place}: {item.message}"


def check_report(outcome: CheckOutcome, memory: SessionMemory) -> str | None:
    if outcome.failure is not None:
        return f"aqven check --static failed after this change: {outcome.failure}. Run aqven_check."
    lines = tuple(dict.fromkeys(diagnostic_line(item) for item in outcome.diagnostics))
    previous, memory.diagnostics = memory.diagnostics, lines
    fresh = tuple(line for line in lines if line not in previous)
    if not lines and previous:
        return CHECK_CLEAN
    if not fresh:
        return None
    errors = sum(1 for item in outcome.diagnostics if item.severity is Severity.ERROR)
    warnings = len(outcome.diagnostics) - errors
    header = f"aqven check --static after this change: {errors} errors and {warnings} warnings in the project. New:"
    more = (f"- {len(fresh) - REPORTED_LINES} more: run aqven_check",) if len(fresh) > REPORTED_LINES else ()
    return "\n".join((header, *fresh[:REPORTED_LINES], *more))


@dataclass(frozen=True, slots=True)
class CheckAfterEdit:
    files: ProjectFiles
    check: ProjectCheck

    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        if not await self.changed(moment, memory):
            return None
        return check_report(await self.check.static(), memory)

    async def changed(self, moment: HookMoment, memory: SessionMemory) -> bool:
        if moment.event == POST_TOOL_USE and moment.tool_name in FILE_TOOLS:
            return self.defines(written_path(moment))
        return await self.shell_changed(moment, memory)

    def defines(self, raw: str | None) -> bool:
        inside = None if raw is None else self.files.inside(raw)
        return inside is not None and defines_project(inside)

    async def shell_changed(self, moment: HookMoment, memory: SessionMemory) -> bool:
        command = bash_command(moment)
        if command is None or checks_itself(command):
            return False
        if moment.event == PRE_TOOL_USE:
            memory.fingerprints[moment.tool_use_id] = await self.fingerprint()
            return False
        before = memory.fingerprints.pop(moment.tool_use_id, None) if moment.event in AFTER_TOOL_USE else None
        return before is not None and before != await self.fingerprint()

    async def fingerprint(self) -> TreeFingerprint:
        return await asyncio.to_thread(tree_fingerprint, self.files.root, defines_project)


def running_series(moment: HookMoment) -> SeriesStateWire | None:
    if moment.event != POST_TOOL_USE or aqven_tool(moment) not in SERIES_TOOLS:
        return None
    state = first_record(SeriesStateWire, moment.tool_response)
    return state if state is not None and state.status == SeriesStatus.RUNNING else None


@dataclass(frozen=True, slots=True)
class SeriesWait:
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        running = running_series(moment)
        if running is not None and memory.first_time(f"series:{running.series_id}"):
            return RUNNING_SERIES.format(series_id=running.series_id)
        foreground = moment.event == PRE_TOOL_USE and launches_series(moment)
        if not foreground or moment.tool_input.get("run_in_background") is True:
            return None
        return FOREGROUND_SERIES if memory.first_time("series:foreground") else None


@dataclass(frozen=True, slots=True)
class RestReminder:
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        command = bash_command(moment) if moment.event == PRE_TOOL_USE else None
        if command is None or HTTP_CLIENT.search(command) is None:
            return None
        route = next((route for route in REST_ROUTES if route.pattern.search(command) is not None), None)
        if route is None or not memory.first_time(f"rest:{route.key}"):
            return None
        return route.advice


@dataclass(frozen=True, slots=True)
class PreviewAfterEdit:
    files: ProjectFiles
    previews: PromptPreviews

    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        if not self.touches_prompt(moment):
            return None
        if moment.event == PRE_TOOL_USE:
            await self.baseline(memory)
            return None
        return await self.changes(memory) if moment.event == POST_TOOL_USE else None

    def touches_prompt(self, moment: HookMoment) -> bool:
        raw = written_path(moment)
        inside = None if raw is None else self.files.inside(raw)
        return inside is not None and matches(inside, PREVIEW_PATTERNS)

    async def baseline(self, memory: SessionMemory) -> None:
        if memory.previews is not None:
            return
        current = await self.previews.previews()
        memory.previews = None if current is None else {preview.node: preview.digest for preview in current}

    async def changes(self, memory: SessionMemory) -> str | None:
        current = await self.previews.previews()
        if current is None:
            return None
        before, memory.previews = memory.previews, {preview.node: preview.digest for preview in current}
        changed = () if before is None else tuple(item for item in current if before.get(item.node) != item.digest)
        if not changed:
            return None
        return "\n".join((PREVIEW_HEADER, *(item.line() for item in changed[:REPORTED_LINES]), PREVIEW_FOOTER))


@dataclass(frozen=True, slots=True)
class CompactionReminder:
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        if moment.event == PRE_COMPACT:
            memory.compacted = True
            return None
        if not memory.compacted or moment.event not in (POST_TOOL_USE, USER_PROMPT_SUBMIT):
            return None
        memory.compacted = False
        return COMPACTED


def live_probe_target(moment: HookMoment) -> str | None:
    command = bash_command(moment) if moment.event in AFTER_TOOL_USE else None
    arguments = None if command is None else aqven_arguments(command, "models", "check")
    if arguments is None or LIVE_FLAG not in arguments:
        return None
    return first_positional(arguments, MODELS_VALUED) or ALL_AGENTS


@dataclass(frozen=True, slots=True)
class ProbeTracker:
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        target = live_probe_target(moment)
        if target == ALL_AGENTS:
            memory.probed_all = True
        if target is not None:
            memory.probed_agents.add(target)
        return None


def shell_launch(moment: HookMoment) -> SeriesLaunch | None:
    command = bash_command(moment)
    arguments = None if command is None else aqven_arguments(command, "series")
    experiment = None if arguments is None else first_positional(arguments, SERIES_VALUED)
    if arguments is None or experiment is None:
        return None
    return SeriesLaunch(experiment, option_value(arguments, "--on") or SeriesSplit.DEV.value)


def tool_launch(moment: HookMoment) -> SeriesLaunch | None:
    if aqven_tool(moment) != "series_start":
        return None
    start = first_record(SeriesStartWire, moment.tool_input)
    return None if start is None else SeriesLaunch(start.experiment_id, start.on)


def series_launch(moment: HookMoment) -> SeriesLaunch | None:
    if moment.event != PRE_TOOL_USE:
        return None
    return tool_launch(moment) or shell_launch(moment)


@dataclass(frozen=True, slots=True)
class SeriesPreflight:
    experiments: ExperimentAgents

    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        launch = series_launch(moment)
        if launch is None:
            return None
        notes = (await self.unprobed(launch, memory), holdout_note(launch, memory))
        return "\n".join(note for note in notes if note) or None

    async def unprobed(self, launch: SeriesLaunch, memory: SessionMemory) -> str | None:
        if memory.probed_all:
            return None
        agents = await self.experiments.factor_agents(launch.experiment_id)
        missing = tuple(agent for agent in agents if agent not in memory.probed_agents)
        if not missing or not memory.first_time(f"probe:{launch.experiment_id}:{','.join(missing)}"):
            return None
        return UNPROBED_AGENTS.format(agents=", ".join(f"`{agent}`" for agent in missing))


def holdout_note(launch: SeriesLaunch, memory: SessionMemory) -> str | None:
    if launch.split != SeriesSplit.HOLDOUT or not memory.first_time(f"holdout:{launch.experiment_id}"):
        return None
    return HOLDOUT_NOTE.format(experiment=launch.experiment_id)
