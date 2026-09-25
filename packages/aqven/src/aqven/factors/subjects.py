from collections.abc import Iterable, Iterator, Mapping

from aqven.factors.walk import walk
from aqven.loader import LoadedExperiment, LoadedFlow, LoadedProject, local_node_id
from aqven.spec import CallNodeSpec, FlowId, NodeId, NodeSpec


def experiment_flows(project: LoadedProject, experiment: LoadedExperiment) -> Mapping[FlowId, LoadedFlow]:
    return {**project.flows, **experiment.flows}


def resolve_flow(project: LoadedProject, experiment: LoadedExperiment, flow_id: FlowId) -> LoadedFlow | None:
    local = experiment.flows.get(flow_id)
    return local if local is not None else project.flows.get(flow_id)


def subject_flow(project: LoadedProject, experiment: LoadedExperiment) -> LoadedFlow | None:
    return resolve_flow(project, experiment, experiment.source.spec.subject.flow)


def is_local_subject(experiment: LoadedExperiment) -> bool:
    return experiment.source.spec.subject.flow in experiment.flows


def local_nodes(flow: LoadedFlow) -> dict[NodeId, NodeSpec]:
    return {local_node_id(node_id): source.spec for node_id, source in flow.nodes.items()}


def called_flows(flows: Mapping[FlowId, LoadedFlow], roots: Iterable[FlowId]) -> tuple[FlowId, ...]:
    def expand(flow_id: FlowId) -> Iterable[FlowId] | None:
        flow = flows.get(flow_id)
        return None if flow is None else tuple(calls(source.spec for source in flow.nodes.values()))

    return walk(roots, expand)


def calls(specs: Iterable[NodeSpec]) -> Iterator[FlowId]:
    return (spec.flow for spec in specs if isinstance(spec, CallNodeSpec))
