import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Final

from pydantic_ai.models import override_allow_model_requests

from aqven.check.report import CheckReport
from aqven.check.simulation.cache import (
    FlowEntry,
    SimulationCache,
    aqven_version,
    cache_file,
    code_digest,
    flow_key,
    read_cache,
    write_cache,
)
from aqven.check.simulation.model import SimulatedModel, SimulatedModelFactories, SimulatedModelFactory
from aqven.check.simulation.plan import PassPlanner, SimulationPass
from aqven.check.simulation.report import (
    PROJECT_FILE,
    FlowFiles,
    flow_diagnostics,
    flow_files,
    input_text,
    resolution_failed,
)
from aqven.check.simulation.runner import (
    DEFAULT_PASS_SECONDS,
    FlowResult,
    NetworkBlocked,
    SimulationRunner,
    quiet_banner,
    simulation_engine,
    simulation_plan,
)
from aqven.check.simulation.values import ValueFactory
from aqven.diagnostics import Diagnostic, DiagnosticCode, sort_diagnostics, templated_diagnostic
from aqven.ir import CompiledProject
from aqven.loader import LoadedProject
from aqven.spec import FlowId

ENGINE_FAILED: Final = "SIM_ENGINE"
MESSAGE_LIMIT: Final = 400


@dataclass(frozen=True, slots=True)
class SimulationOptions:
    use_cache: bool = True
    seconds: float = DEFAULT_PASS_SECONDS
    flows: tuple[FlowId, ...] = ()


@dataclass(frozen=True, slots=True)
class FlowOutcome:
    diagnostics: tuple[Diagnostic, ...]
    cacheable: bool


def simulate_project(report: CheckReport, options: SimulationOptions | None = None) -> tuple[Diagnostic, ...]:
    project = report.project
    if project is None or not report.ok:
        return ()
    from aqven.compiler import compile_project

    settings = options or SimulationOptions()
    plan = compile_project(report)
    wanted = settings.flows or tuple(sorted(plan.flows))
    keys = _keys(project.root, plan, wanted)
    stored = read_cache(cache_file(project.root))
    known = _cached(stored, keys) if settings.use_cache else {}
    pending = tuple(flow_id for flow_id in wanted if flow_id not in known)
    fresh = _simulated(project, plan, pending, settings) if pending else {}
    if pending:
        write_cache(cache_file(project.root), _updated(stored, keys, fresh))
    found = {**known, **{flow_id: outcome.diagnostics for flow_id, outcome in fresh.items()}}
    return sort_diagnostics(item for flow_id in wanted for item in found.get(flow_id, ()))


def _keys(root: Path, plan: CompiledProject, wanted: tuple[FlowId, ...]) -> Mapping[FlowId, str]:
    digest = code_digest(root)
    release = aqven_version()
    return {flow_id: flow_key(plan, flow_id, digest, release) for flow_id in wanted}


def _cached(cache: SimulationCache, keys: Mapping[FlowId, str]) -> dict[FlowId, tuple[Diagnostic, ...]]:
    entries = ((flow_id, cache.flows.get(flow_id)) for flow_id in keys)
    return {
        flow_id: entry.diagnostics for flow_id, entry in entries if entry is not None and entry.key == keys[flow_id]
    }


def _updated(
    cache: SimulationCache, keys: Mapping[FlowId, str], fresh: Mapping[FlowId, FlowOutcome]
) -> SimulationCache:
    flows = {**cache.flows}
    for flow_id, outcome in fresh.items():
        if not outcome.cacheable:
            flows.pop(flow_id, None)
            continue
        flows[flow_id] = FlowEntry(key=keys[flow_id], diagnostics=outcome.diagnostics)
    return SimulationCache(flows=flows)


def _simulated(
    project: LoadedProject, plan: CompiledProject, flows: tuple[FlowId, ...], options: SimulationOptions
) -> dict[FlowId, FlowOutcome]:
    try:
        return asyncio.run(_run_flows(project, plan, flows, options))
    except Exception as error:
        return {flows[0]: FlowOutcome((_engine_diagnostic(error),), cacheable=False)}


async def _run_flows(
    project: LoadedProject, plan: CompiledProject, flows: tuple[FlowId, ...], options: SimulationOptions
) -> dict[FlowId, FlowOutcome]:
    with (
        TemporaryDirectory(prefix="aqven-simulation-") as state,
        override_allow_model_requests(False),
        quiet_banner(),
        simulation_engine(project.root, Path(state)) as facade,
    ):
        runner = SimulationRunner(facade=facade, plan=simulation_plan(plan), seconds=options.seconds)
        return {flow_id: await _flow_outcome(runner, project, plan, flow_id) for flow_id in flows}


async def _flow_outcome(
    runner: SimulationRunner, project: LoadedProject, plan: CompiledProject, flow_id: FlowId
) -> FlowOutcome:
    files = flow_files(project, flow_id)
    try:
        result = await runner.flow(flow_id)
    except Exception as error:
        return FlowOutcome((_failed_flow(files, flow_id, error),), cacheable=False)
    diagnostics = flow_diagnostics(plan.flow(flow_id), files, result)
    return FlowOutcome(diagnostics, cacheable=not resolution_failed(result))


def _failed_flow(files: FlowFiles, flow_id: FlowId, error: Exception) -> Diagnostic:
    return templated_diagnostic(
        DiagnosticCode.E_SIM_RUN_FAILED,
        files.flow_file,
        (),
        {
            "flow": flow_id,
            "pass": "base",
            "code": ENGINE_FAILED,
            "message": f"{type(error).__name__}: {error}"[:MESSAGE_LIMIT],
            "input": "",
        },
    )


def _engine_diagnostic(error: Exception) -> Diagnostic:
    return templated_diagnostic(
        DiagnosticCode.E_SIM_RUN_FAILED,
        PROJECT_FILE,
        (),
        {
            "flow": "",
            "pass": "engine",
            "code": ENGINE_FAILED,
            "message": f"{type(error).__name__}: {error}"[:MESSAGE_LIMIT],
            "input": "",
        },
    )


__all__ = [
    "DEFAULT_PASS_SECONDS",
    "FlowFiles",
    "FlowOutcome",
    "FlowResult",
    "NetworkBlocked",
    "PassPlanner",
    "SimulatedModel",
    "SimulatedModelFactories",
    "SimulatedModelFactory",
    "SimulationOptions",
    "SimulationPass",
    "SimulationRunner",
    "ValueFactory",
    "flow_diagnostics",
    "flow_files",
    "input_text",
    "resolution_failed",
    "simulate_project",
    "simulation_engine",
]
