import argparse
import asyncio
import json
import os
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Literal, TextIO

from pydantic import BaseModel, ConfigDict
from pydantic_ai.models import Model

from aqven.check.output_modes import MODE_PREFERENCE, AgentModes, ModelModes, agent_modes
from aqven.console.command import EXIT_FAILED, EXIT_OK, PATH_HELP, Command, OutputFormat
from aqven.console.project_env import open_project
from aqven.engine.llm.probe import ModelBuilder, ModelProbe, ModeProbe, ModeProber
from aqven.loader import LoadedProject, load_project
from aqven.models.providers import CUSTOM_KINDS, custom_options, key_variable
from aqven.spec import AgentId, OutputModeSetting, StructuredMode
from aqven_llm import (
    MissingProviderKey,
    ProviderKeys,
    ProviderMisconfigured,
    ProviderModelFactory,
    ProviderOptions,
    ProviderUnavailable,
    UnknownProvider,
)

ACTION_DESTINATION: Final = "models_action"
MODEL_SEPARATOR: Final = ":"
PROGRAM: Final = "aqven models check"
INDENT: Final = "  "
MODE_WIDTH: Final = 10
PROFILE_WIDTH: Final = 13
LIVE_ERRORS: Final = (MissingProviderKey, ProviderMisconfigured, ProviderUnavailable, UnknownProvider)

type LiveResult = Literal["ok", "failed", "not_run"]


class ModeRow(BaseModel):
    model_config = ConfigDict(frozen=True)
    mode: StructuredMode
    profile_supports: bool
    live: LiveResult = "not_run"
    code: str | None = None
    message: str | None = None
    excerpt: str | None = None


class ModelReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    model: str
    auto_mode: StructuredMode
    auto_source: str
    auto_reason: str
    modes: tuple[ModeRow, ...]
    working: tuple[StructuredMode, ...] | None = None


class TargetReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    agent: str | None
    file: str | None
    declared_mode: OutputModeSetting
    resolved_mode: StructuredMode
    source: str
    reason: str
    models: tuple[ModelReport, ...]
    suggested_mode: StructuredMode | None
    snippet: str | None
    ok: bool


class ModelsReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    live: bool
    ok: bool
    targets: tuple[TargetReport, ...]


@dataclass(frozen=True, slots=True)
class ModelsCheckRequest:
    root: Path
    output: OutputFormat
    target: str | None = None
    live: bool = False


@dataclass(frozen=True, slots=True)
class CheckTarget:
    agent: str | None
    file: str | None
    modes: AgentModes


class TargetNotFound(LookupError):
    def __init__(self, target: str) -> None:
        super().__init__(f"{target} is neither an agent of the project nor a provider:model string")
        self.target = target


@dataclass(frozen=True, slots=True)
class ProjectModels:
    providers: Mapping[str, ProviderOptions]
    custom_keys: Mapping[str, str | None]

    async def build(self, model: str) -> Model:
        key = await ProviderKeys(environ=os.environ, custom=self.custom_keys).key(model)
        return ProviderModelFactory(providers=self.providers).build(model, settings=None, api_key=key)


def project_models(project: LoadedProject) -> ProjectModels:
    specs = project.project.spec.providers
    return ProjectModels(
        providers={str(spec.id): custom_options(spec) for spec in specs},
        custom_keys={str(spec.id): key_variable(spec.api_key) for spec in specs if spec.kind in CUSTOM_KINDS},
    )


def snippet(mode: StructuredMode) -> str:
    return f"output:\n{INDENT}mode: {mode}"


def check_targets(project: LoadedProject, target: str | None) -> tuple[CheckTarget, ...]:
    if target is not None and MODEL_SEPARATOR in target:
        return (CheckTarget(agent=None, file=None, modes=agent_modes(OutputModeSetting.AUTO, (target,))),)
    chosen = sorted(project.agents) if target is None else [AgentId(target)]
    missing = [agent_id for agent_id in chosen if agent_id not in project.agents]
    if missing:
        raise TargetNotFound(missing[0])
    return tuple(_agent_target(project, agent_id) for agent_id in chosen)


def _agent_target(project: LoadedProject, agent_id: AgentId) -> CheckTarget:
    source = project.agents[agent_id]
    spec = source.spec
    modes = agent_modes(spec.output.mode, (spec.model, *(spec.fallback_models or ())))
    return CheckTarget(agent=agent_id, file=source.path, modes=modes)


async def probe_targets(targets: Sequence[CheckTarget], build: ModelBuilder | None) -> Mapping[str, ModelProbe]:
    if build is None:
        return {}
    prober = ModeProber(build)
    models = dict.fromkeys(model.model for target in targets for model in target.modes.models)
    return {model: await prober.probe(model) for model in models}


def model_report(modes: ModelModes, probe: ModelProbe | None) -> ModelReport:
    auto = modes.auto()
    results: Mapping[StructuredMode, ModeProbe] = {} if probe is None else {item.mode: item for item in probe.results}
    return ModelReport(
        model=modes.model,
        auto_mode=auto.mode,
        auto_source=auto.source,
        auto_reason=auto.reason,
        modes=tuple(_mode_row(mode, modes, results.get(mode)) for mode in MODE_PREFERENCE),
        working=None if probe is None else probe.working,
    )


def target_report(target: CheckTarget, probes: Mapping[str, ModelProbe]) -> TargetReport:
    resolution = target.modes.resolve()
    models = tuple(model_report(model, probes.get(model.model)) for model in target.modes.models)
    working = _working(models)
    suggested = resolution.mode if working is None else _suggestion(resolution.mode, working)
    ok = (working is None or resolution.mode in working) and not target.modes.unsupported()
    return TargetReport(
        agent=target.agent,
        file=target.file,
        declared_mode=target.modes.declared,
        resolved_mode=resolution.mode,
        source=resolution.source,
        reason=resolution.reason,
        models=models,
        suggested_mode=suggested,
        snippet=None if suggested is None else snippet(suggested),
        ok=ok,
    )


def build_report(targets: Sequence[CheckTarget], probes: Mapping[str, ModelProbe], live: bool) -> ModelsReport:
    reports = tuple(target_report(target, probes) for target in targets)
    return ModelsReport(live=live, ok=all(report.ok for report in reports), targets=reports)


def render_text(report: ModelsReport) -> str:
    return "\n".join(line for target in report.targets for line in _target_lines(target, report.live))


def render_json(report: ModelsReport) -> str:
    return json.dumps(report.model_dump(mode="json"), ensure_ascii=False, indent=2)


RENDERERS: Final[Mapping[OutputFormat, Callable[[ModelsReport], str]]] = {
    OutputFormat.TEXT: render_text,
    OutputFormat.JSON: render_json,
}


def check_models(request: ModelsCheckRequest, build: ModelBuilder | None = None, out: TextIO | None = None) -> int:
    loaded = load_project(request.root)
    if loaded.project is None:
        print(f"{PROGRAM}: the project does not load, run aqven check", file=sys.stderr)
        return EXIT_FAILED
    try:
        targets = check_targets(loaded.project, request.target)
        probes = asyncio.run(probe_targets(targets, _builder(loaded.project, request, build)))
    except (TargetNotFound, *LIVE_ERRORS) as error:
        print(f"{PROGRAM}: {error}", file=sys.stderr)
        return EXIT_FAILED
    report = build_report(targets, probes, request.live)
    print(RENDERERS[request.output](report), file=sys.stdout if out is None else out)
    return EXIT_OK if report.ok else EXIT_FAILED


@dataclass(frozen=True, slots=True)
class ModelsCheckCommand:
    help: str = "show which output modes an agent or a provider:model supports; --live sends a tiny request per mode"
    build: ModelBuilder | None = field(default=None)

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("target", nargs="?", default=None, help="agent id or provider:model; all agents if empty")
        parser.add_argument("--project", default=".", help=PATH_HELP)
        parser.add_argument("--live", action="store_true", help="send one small request per output mode")
        parser.add_argument("--json", action="store_true", help="print the report as JSON")

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat.JSON if bool(arguments.json) else OutputFormat.TEXT
        root = open_project(Path(str(arguments.project)), output)
        if root is None:
            return EXIT_FAILED
        target = None if arguments.target is None else str(arguments.target)
        request = ModelsCheckRequest(root=root, output=output, target=target, live=bool(arguments.live))
        return check_models(request, self.build)


MODELS_ACTIONS: Final[Mapping[str, Command]] = {"check": ModelsCheckCommand()}


@dataclass(frozen=True, slots=True)
class ModelsCommand:
    help: str = "model providers of the project"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        actions = parser.add_subparsers(dest=ACTION_DESTINATION, required=True, metavar="ACTION")
        for name, action in MODELS_ACTIONS.items():
            action.configure(actions.add_parser(name, help=action.help, description=action.help))

    def execute(self, arguments: argparse.Namespace) -> int:
        return MODELS_ACTIONS[str(getattr(arguments, ACTION_DESTINATION))].execute(arguments)


def _builder(project: LoadedProject, request: ModelsCheckRequest, build: ModelBuilder | None) -> ModelBuilder | None:
    if not request.live:
        return None
    return project_models(project).build if build is None else build


def _mode_row(mode: StructuredMode, modes: ModelModes, probe: ModeProbe | None) -> ModeRow:
    if probe is None:
        return ModeRow(mode=mode, profile_supports=modes.supports(mode))
    return ModeRow(
        mode=mode,
        profile_supports=modes.supports(mode),
        live="ok" if probe.ok else "failed",
        code=probe.code,
        message=probe.message,
        excerpt=probe.excerpt,
    )


def _working(models: Sequence[ModelReport]) -> frozenset[StructuredMode] | None:
    sets = [frozenset(model.working) for model in models if model.working is not None]
    if not sets:
        return None
    return frozenset(mode for mode in MODE_PREFERENCE if all(mode in modes for modes in sets))


def _suggestion(resolved: StructuredMode, working: frozenset[StructuredMode]) -> StructuredMode | None:
    if resolved in working:
        return resolved
    return next((mode for mode in MODE_PREFERENCE if mode in working), None)


def _target_lines(target: TargetReport, live: bool) -> Iterator[str]:
    title = f"agent {target.agent} ({target.file})" if target.agent is not None else f"model {target.models[0].model}"
    yield title
    resolution = f"{target.declared_mode.value} -> {target.resolved_mode}"
    yield f"{INDENT}output.mode: {resolution} ({target.source}: {target.reason})"
    for model in target.models:
        yield from _model_lines(model, live)
    if target.snippet is None:
        yield f"{INDENT}no output mode worked: choose another model"
        return
    yield f"{INDENT}YAML for the agent file:"
    yield from (f"{INDENT * 2}{line}" for line in target.snippet.splitlines())


def _model_lines(model: ModelReport, live: bool) -> Iterator[str]:
    yield f"{INDENT}model {model.model} (auto: {model.auto_mode})"
    live_header = "live" if live else ""
    yield f"{INDENT * 2}{'mode'.ljust(MODE_WIDTH)}{'profile'.ljust(PROFILE_WIDTH)}{live_header}".rstrip()
    for row in model.modes:
        profile = "supported" if row.profile_supports else "unsupported"
        yield f"{INDENT * 2}{row.mode.ljust(MODE_WIDTH)}{profile.ljust(PROFILE_WIDTH)}{_live_text(row)}".rstrip()


def _live_text(row: ModeRow) -> str:
    if row.live != "failed":
        return "" if row.live == "not_run" else row.live
    return f"failed {row.code}: {row.message}"
