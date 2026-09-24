import argparse
import asyncio
import json
import os
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Literal, TextIO, cast

from pydantic import BaseModel, ConfigDict
from pydantic_ai import ModelSettings
from pydantic_ai.models import Model

from aqven.check.output_modes import MODE_PREFERENCE, AgentModes, ModelModes, agent_modes
from aqven.console.command import EXIT_FAILED, EXIT_OK, PATH_HELP, Command, OutputFormat
from aqven.console.project_env import open_project, project_env_file
from aqven.engine.assembly.models import explain_empty_key
from aqven.engine.llm.probe import ModelBuilder, ModelProbe, ModeProbe, ModeProber
from aqven.engine.llm.shape_probe import ShapeAxisResult, ShapeCase, ShapeProber, ShapeReport
from aqven.loader import LoadedProject, load_project
from aqven.models.providers import CUSTOM_KINDS, custom_options, key_variable
from aqven.runtime.address import JsonObject
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
SHAPES_PROGRAM: Final = "aqven models shapes"
INDENT: Final = "  "
MODE_WIDTH: Final = 10
PROFILE_WIDTH: Final = 13
AXIS_WIDTH: Final = 18
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
    provider_options: JsonObject | None = None


@dataclass(frozen=True, slots=True)
class CheckTarget:
    agent: str | None
    file: str | None
    modes: AgentModes


class TargetNotFound(LookupError):
    def __init__(self, target: str) -> None:
        super().__init__(f"{target} is neither an agent of the project nor a provider:model string")
        self.target = target


class ProviderOptionsInvalid(ValueError):
    def __init__(self, detail: str) -> None:
        super().__init__(f"--provider-options is not valid JSON: {detail}")


def parse_provider_options(raw: str | None) -> JsonObject | None:
    if raw is None:
        return None
    try:
        parsed: object = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ProviderOptionsInvalid(str(error)) from error
    if not isinstance(parsed, dict):
        raise ProviderOptionsInvalid("must be a JSON object")
    return cast(JsonObject, parsed)


def model_settings_of(provider_options: JsonObject | None) -> ModelSettings | None:
    return None if provider_options is None else ModelSettings(extra_body=provider_options)


def live_error_text(error: Exception, root: Path) -> str:
    if not isinstance(error, MissingProviderKey):
        return str(error)
    return explain_empty_key(str(error), error.env_var, os.environ, project_env_file(root).as_posix())


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


async def probe_targets(
    targets: Sequence[CheckTarget], build: ModelBuilder | None, model_settings: ModelSettings | None = None
) -> Mapping[str, ModelProbe]:
    if build is None:
        return {}
    prober = ModeProber(build, model_settings)
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
        settings = model_settings_of(request.provider_options)
        probes = asyncio.run(probe_targets(targets, _builder(loaded.project, request, build), settings))
    except (TargetNotFound, *LIVE_ERRORS) as error:
        print(f"{PROGRAM}: {live_error_text(error, request.root)}", file=sys.stderr)
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
        parser.add_argument(
            "--provider-options",
            default=None,
            help='JSON merged into the request body, e.g. OpenRouter\'s \'{"provider": {"require_parameters": true}}\'',
        )
        parser.add_argument("--json", action="store_true", help="print the report as JSON")

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat.JSON if bool(arguments.json) else OutputFormat.TEXT
        root = open_project(Path(str(arguments.project)), output)
        if root is None:
            return EXIT_FAILED
        try:
            provider_options = parse_provider_options(arguments.provider_options)
        except ProviderOptionsInvalid as error:
            print(f"{PROGRAM}: {error}", file=sys.stderr)
            return EXIT_FAILED
        target = None if arguments.target is None else str(arguments.target)
        request = ModelsCheckRequest(
            root=root, output=output, target=target, live=bool(arguments.live), provider_options=provider_options
        )
        return check_models(request, self.build)


class ShapeCaseRow(BaseModel):
    model_config = ConfigDict(frozen=True)
    level: int
    ok: bool
    structural: bool = True
    code: str | None = None
    message: str | None = None


class ShapeAxisRow(BaseModel):
    model_config = ConfigDict(frozen=True)
    axis: str
    boundary: int | None
    cases: tuple[ShapeCaseRow, ...]


class ShapeModelReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    model: str
    mode: StructuredMode
    axes: tuple[ShapeAxisRow, ...]


class ShapesTargetReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    agent: str | None
    file: str | None
    models: tuple[ShapeModelReport, ...]


class ShapesReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    targets: tuple[ShapesTargetReport, ...]


@dataclass(frozen=True, slots=True)
class ModelsShapesRequest:
    root: Path
    output: OutputFormat
    target: str | None = None
    provider_options: JsonObject | None = None


def _shape_case_row(case: ShapeCase) -> ShapeCaseRow:
    return ShapeCaseRow(level=case.level, ok=case.ok, structural=case.structural, code=case.code, message=case.message)


def shape_axis_row(result: ShapeAxisResult) -> ShapeAxisRow:
    cases = tuple(_shape_case_row(case) for case in result.cases)
    return ShapeAxisRow(axis=result.axis, boundary=result.boundary, cases=cases)


def shape_model_report(report: ShapeReport) -> ShapeModelReport:
    axes = tuple(shape_axis_row(axis) for axis in report.axes)
    return ShapeModelReport(model=report.model, mode=report.mode, axes=axes)


async def probe_shape_targets(
    targets: Sequence[CheckTarget], build: ModelBuilder, model_settings: ModelSettings | None = None
) -> Mapping[tuple[str, StructuredMode], ShapeReport]:
    prober = ShapeProber(build, model_settings)
    pairs: list[tuple[str, StructuredMode]] = sorted(
        {(model.model, target.modes.resolve().mode) for target in targets for model in target.modes.models}
    )
    return {pair: await prober.probe(pair[0], pair[1]) for pair in pairs}


def shapes_target_report(
    target: CheckTarget, reports: Mapping[tuple[str, StructuredMode], ShapeReport]
) -> ShapesTargetReport:
    mode = target.modes.resolve().mode
    keyed: list[tuple[str, StructuredMode]] = [(model.model, mode) for model in target.modes.models]
    models = tuple(shape_model_report(reports[key]) for key in keyed if key in reports)
    return ShapesTargetReport(agent=target.agent, file=target.file, models=models)


def build_shapes_report(
    targets: Sequence[CheckTarget], reports: Mapping[tuple[str, StructuredMode], ShapeReport]
) -> ShapesReport:
    return ShapesReport(targets=tuple(shapes_target_report(target, reports) for target in targets))


def render_shapes_text(report: ShapesReport) -> str:
    return "\n".join(line for target in report.targets for line in _shapes_target_lines(target))


def render_shapes_json(report: ShapesReport) -> str:
    return json.dumps(report.model_dump(mode="json"), ensure_ascii=False, indent=2)


SHAPES_RENDERERS: Final[Mapping[OutputFormat, Callable[[ShapesReport], str]]] = {
    OutputFormat.TEXT: render_shapes_text,
    OutputFormat.JSON: render_shapes_json,
}


def shapes_models(request: ModelsShapesRequest, build: ModelBuilder | None = None, out: TextIO | None = None) -> int:
    loaded = load_project(request.root)
    if loaded.project is None:
        print(f"{SHAPES_PROGRAM}: the project does not load, run aqven check", file=sys.stderr)
        return EXIT_FAILED
    try:
        targets = check_targets(loaded.project, request.target)
        live_build = project_models(loaded.project).build if build is None else build
        settings = model_settings_of(request.provider_options)
        reports = asyncio.run(probe_shape_targets(targets, live_build, settings))
    except (TargetNotFound, *LIVE_ERRORS) as error:
        print(f"{SHAPES_PROGRAM}: {live_error_text(error, request.root)}", file=sys.stderr)
        return EXIT_FAILED
    report = build_shapes_report(targets, reports)
    print(SHAPES_RENDERERS[request.output](report), file=sys.stdout if out is None else out)
    return EXIT_OK


@dataclass(frozen=True, slots=True)
class ModelsShapesCommand:
    help: str = (
        "find each agent model's real structural JSON limits: nesting depth, list length, enum size; "
        "requires --live, every probe is a real, billed API call, there is no free mode"
    )
    build: ModelBuilder | None = field(default=None)

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("target", nargs="?", default=None, help="agent id or provider:model; all agents if empty")
        parser.add_argument("--project", default=".", help=PATH_HELP)
        parser.add_argument("--live", action="store_true", help="confirm real, billed API calls; required to run")
        parser.add_argument(
            "--provider-options",
            default=None,
            help='JSON merged into the request body, e.g. OpenRouter\'s \'{"provider": {"require_parameters": true}}\'',
        )
        parser.add_argument("--json", action="store_true", help="print the report as JSON")

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat.JSON if bool(arguments.json) else OutputFormat.TEXT
        root = open_project(Path(str(arguments.project)), output)
        if root is None:
            return EXIT_FAILED
        if not bool(arguments.live):
            print(f"{SHAPES_PROGRAM}: pass --live to run it — every probe is a real, billed API call", file=sys.stderr)
            return EXIT_FAILED
        try:
            provider_options = parse_provider_options(arguments.provider_options)
        except ProviderOptionsInvalid as error:
            print(f"{SHAPES_PROGRAM}: {error}", file=sys.stderr)
            return EXIT_FAILED
        target = None if arguments.target is None else str(arguments.target)
        request = ModelsShapesRequest(root=root, output=output, target=target, provider_options=provider_options)
        return shapes_models(request, self.build)


def _shapes_target_lines(target: ShapesTargetReport) -> Iterator[str]:
    title = f"agent {target.agent} ({target.file})" if target.agent is not None else f"model {target.models[0].model}"
    yield title
    for model in target.models:
        yield from _shapes_model_lines(model)


FAILURE_LABEL: Final[Mapping[bool, str]] = {True: "breaks at", False: "unclear at (not a confirmed limit)"}


def _shapes_model_lines(model: ShapeModelReport) -> Iterator[str]:
    yield f"{INDENT}model {model.model} (mode: {model.mode})"
    for axis in model.axes:
        boundary = "none" if axis.boundary is None else str(axis.boundary)
        yield f"{INDENT * 2}{axis.axis.ljust(AXIS_WIDTH)}holds up to: {boundary}"
        for case in axis.cases:
            if case.ok:
                continue
            yield f"{INDENT * 3}{FAILURE_LABEL[case.structural]} {case.level}: {case.code} {case.message}"


MODELS_ACTIONS: Final[Mapping[str, Command]] = {"check": ModelsCheckCommand(), "shapes": ModelsShapesCommand()}


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
