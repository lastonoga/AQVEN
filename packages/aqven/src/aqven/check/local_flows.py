from collections.abc import Iterator, Mapping, Sequence
from dataclasses import replace

from aqven.check.context import CheckContext, CheckRule
from aqven.check.graph import build_graph
from aqven.check.scopes import RefResolver
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.factors import called_flows
from aqven.loader import LoadedExperiment, LoadedFlow, LoadedProject, within
from aqven.spec import FlowId


def check_local_flows(context: CheckContext, rules: Sequence[CheckRule]) -> Iterator[Diagnostic]:
    for experiment in context.project.experiments.values():
        yield from _collisions(context, experiment)
        yield from _local_rules(context, experiment, rules)


def flows_view(context: CheckContext, project: LoadedProject) -> CheckContext:
    graph = build_graph(project)
    return replace(
        context, project=project, graph=graph, refs=RefResolver(graph=graph, type_models=context.type_models)
    )


def experiment_view(context: CheckContext, experiment: LoadedExperiment) -> CheckContext:
    local = own_flows(context, experiment)
    if not local:
        return context
    return flows_view(context, _with_flows(context.project, {**context.project.flows, **local}))


def own_flows(context: CheckContext, experiment: LoadedExperiment) -> Mapping[FlowId, LoadedFlow]:
    return {flow_id: flow for flow_id, flow in experiment.flows.items() if flow_id not in context.project.flows}


def flow_file(flow: LoadedFlow) -> str:
    source = flow.source
    return source.path if source is not None else flow.builder_path or flow.folder


def _with_flows(project: LoadedProject, flows: Mapping[FlowId, LoadedFlow]) -> LoadedProject:
    return replace(project, flows=flows, experiments={}, datasets={})


def _collisions(context: CheckContext, experiment: LoadedExperiment) -> Iterator[Diagnostic]:
    for flow_id, flow in experiment.flows.items():
        taken = context.project.flows.get(flow_id)
        if taken is None:
            continue
        message = (
            f"local flow id {flow_id} is already taken by project flow {taken.folder}: "
            "a local flow is checked and called next to the project flows, rename its folder"
        )
        yield diagnostic(DiagnosticCode.E_ID_DUPLICATE, flow_file(flow), (), message)


def _local_rules(
    context: CheckContext, experiment: LoadedExperiment, rules: Sequence[CheckRule]
) -> Iterator[Diagnostic]:
    local = own_flows(context, experiment)
    if not local:
        return
    flows = {**context.project.flows, **local}
    reached = called_flows(flows, local)
    view = flows_view(context, _with_flows(context.project, {flow_id: flows[flow_id] for flow_id in reached}))
    found = (item for rule in rules for item in rule(view))
    yield from (item for item in found if within(item.file, experiment.folder))
