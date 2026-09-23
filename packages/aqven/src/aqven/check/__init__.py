from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path
from typing import Final

from aqven.check.arms import check_arms
from aqven.check.bindings import check_bindings
from aqven.check.bounds import check_bounds
from aqven.check.builders import materialize_builders
from aqven.check.capabilities import check_capabilities
from aqven.check.code import check_code
from aqven.check.context import CheckContext, CheckRule, ResolvedAgent, ResolvedModel, resolve_agents
from aqven.check.control import check_control
from aqven.check.datasets import check_datasets
from aqven.check.display import check_display
from aqven.check.dynamic import check_dynamic
from aqven.check.experiments import check_experiments
from aqven.check.flows import check_flows
from aqven.check.generated import check_generated
from aqven.check.graph import build_graph
from aqven.check.human import check_human
from aqven.check.inferences import check_inferences
from aqven.check.names import check_names
from aqven.check.output_modes import check_output_modes
from aqven.check.policies import check_policies
from aqven.check.prompts import check_prompts
from aqven.check.providers import check_providers
from aqven.check.refs import check_refs
from aqven.check.registry import check_registry
from aqven.check.report import CheckReport
from aqven.check.resolver import CodeFailure, CodeResolver, CodeTarget
from aqven.check.scopes import RefResolver
from aqven.check.secrets import check_secrets
from aqven.check.tool_args import check_tool_args
from aqven.check.types import check_types
from aqven.diagnostics import Diagnostic, sort_diagnostics
from aqven.loader import LoadedFlow, LoadedProject, Position, SourceSpec, YamlPath, load_project, locate
from aqven.spec import FlowSpec, NodeSpec, TypeId, TypeSpec, build_type_models

RULES: Final[tuple[CheckRule, ...]] = (
    check_names,
    check_types,
    check_registry,
    check_providers,
    check_inferences,
    check_refs,
    check_bindings,
    check_prompts,
    check_code,
    check_display,
    check_policies,
    check_bounds,
    check_capabilities,
    check_output_modes,
    check_control,
    check_human,
    check_dynamic,
    check_flows,
    check_secrets,
    check_tool_args,
    check_datasets,
    check_experiments,
    check_generated,
)
PROJECT_OUTPUT_RULES: Final[tuple[CheckRule, ...]] = (check_generated,)
ARM_RULES: Final[tuple[CheckRule, ...]] = tuple(rule for rule in RULES if rule not in PROJECT_OUTPUT_RULES)


def check_project(root: Path) -> CheckReport:
    loaded = load_project(root)
    if loaded.project is None:
        return CheckReport(diagnostics=sort_diagnostics(loaded.diagnostics), project=None)
    code = CodeResolver(root)
    with code.session():
        materialized = materialize_builders(loaded.project, code)
        context = build_context(materialized.project, code)
        found = [item for rule in RULES for item in rule(context)]
        arms = list(check_arms(context, ARM_RULES))
    diagnostics = (*loaded.diagnostics, *materialized.diagnostics, *found, *arms)
    located = _located(diagnostics, _positions(materialized.project))
    return CheckReport(diagnostics=sort_diagnostics(_distinct(located)), project=materialized.project)


def build_context(project: LoadedProject, code: CodeResolver) -> CheckContext:
    types: Mapping[TypeId, TypeSpec] = {type_id: source.spec for type_id, source in project.types.items()}
    type_models = build_type_models(types)
    graph = build_graph(project)
    return CheckContext(
        project=project,
        type_models=type_models,
        code=code,
        graph=graph,
        refs=RefResolver(graph=graph, type_models=type_models),
        agents=resolve_agents(project),
    )


def _positions(project: LoadedProject) -> Mapping[str, Mapping[YamlPath, Position]]:
    sources = (
        project.project,
        *project.types.values(),
        *project.datasets.values(),
        *project.agents.values(),
        *project.tools.values(),
        *project.mcp_servers.values(),
        *(source for inference in project.inferences.values() if (source := inference.source)),
        *(experiment.source for experiment in project.experiments.values()),
        *(source for flow in _all_flows(project) for source in _flow_sources(flow)),
    )
    return {source.path: source.positions for source in sources}


def _all_flows(project: LoadedProject) -> tuple[LoadedFlow, ...]:
    arms = (arm for experiment in project.experiments.values() for arm in experiment.arms.values())
    return (*project.flows.values(), *arms)


def _flow_sources(flow: LoadedFlow) -> tuple[SourceSpec[FlowSpec] | SourceSpec[NodeSpec], ...]:
    return tuple(source for source in (flow.source, *flow.nodes.values()) if source is not None)


def _located(items: Iterable[Diagnostic], positions: Mapping[str, Mapping[YamlPath, Position]]) -> Iterator[Diagnostic]:
    for item in items:
        table = positions.get(item.file)
        position = locate(table, item.path) if item.line is None and table else None
        yield item if position is None else item.model_copy(update={"line": position[0], "column": position[1]})


def _distinct(items: Iterable[Diagnostic]) -> tuple[Diagnostic, ...]:
    return tuple({item.model_dump_json(): item for item in items}.values())


__all__ = [
    "ARM_RULES",
    "RULES",
    "CheckContext",
    "CheckReport",
    "CheckRule",
    "CodeFailure",
    "CodeResolver",
    "CodeTarget",
    "RefResolver",
    "ResolvedAgent",
    "ResolvedModel",
    "build_context",
    "check_project",
]
