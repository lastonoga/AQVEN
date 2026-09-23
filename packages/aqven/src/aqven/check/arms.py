from collections.abc import Iterator, Mapping, Sequence
from dataclasses import replace

from aqven.check.context import CheckContext, CheckRule
from aqven.check.graph import build_graph
from aqven.check.scopes import RefResolver
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import LoadedExperiment, LoadedFlow, within
from aqven.spec import FlowId


def check_arms(context: CheckContext, rules: Sequence[CheckRule]) -> Iterator[Diagnostic]:
    for experiment in context.project.experiments.values():
        yield from _collisions(context, experiment)
        yield from _arm_rules(context, experiment, rules)


def arm_view(context: CheckContext, arms: Mapping[FlowId, LoadedFlow]) -> CheckContext:
    project = replace(context.project, flows={**context.project.flows, **arms}, experiments={}, evals={}, datasets={})
    graph = build_graph(project)
    return replace(
        context, project=project, graph=graph, refs=RefResolver(graph=graph, type_models=context.type_models)
    )


def _collisions(context: CheckContext, experiment: LoadedExperiment) -> Iterator[Diagnostic]:
    for arm_id, arm in experiment.arms.items():
        taken = context.project.flows.get(FlowId(arm_id))
        if taken is None:
            continue
        message = (
            f"arm id {arm_id} is already taken by project flow {taken.folder}: "
            "an arm is checked as a flow of the project, rename the arm folder"
        )
        yield diagnostic(DiagnosticCode.E_ID_DUPLICATE, _flow_file(arm), (), message)


def _arm_rules(context: CheckContext, experiment: LoadedExperiment, rules: Sequence[CheckRule]) -> Iterator[Diagnostic]:
    arms = {
        FlowId(arm_id): arm for arm_id, arm in experiment.arms.items() if FlowId(arm_id) not in context.project.flows
    }
    if not arms:
        return
    view = arm_view(context, arms)
    found = (item for rule in rules for item in rule(view))
    yield from (item for item in found if within(item.file, experiment.folder))


def _flow_file(flow: LoadedFlow) -> str:
    source = flow.source
    return source.path if source is not None else flow.builder_path or flow.folder
