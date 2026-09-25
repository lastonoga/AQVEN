from collections import Counter
from collections.abc import Mapping
from typing import Final, get_args

from pydantic import Field

from aqven.check.datasets import selected_cases
from aqven.loader import LoadedFlow, LoadedProject, SourceSpec, local_node_id
from aqven.runtime.address import RequestModel, ResourceModel
from aqven.series.views import AgentRefView, QuestionKind
from aqven.server.errors import not_found
from aqven.server.views.common import loaded_project
from aqven.server.views.evaluator_options import EvaluatorOptionView, evaluator_options
from aqven.server.views.nodes import ordered_nodes
from aqven.server.views.research import agent_ref, selection_splits
from aqven.server.workspace import WorkspaceState
from aqven.spec import (
    AgentId,
    CallNodeSpec,
    DatasetFile,
    DatasetId,
    FlowId,
    InferenceId,
    LlmNodeSpec,
    NodeId,
    NodeKind,
    NodeSpec,
    SeriesMetric,
    SeriesSplit,
)
from aqven.spec.experiments import TagName

QUESTION_KINDS: Final[tuple[QuestionKind, ...]] = get_args(QuestionKind.__value__)


class AuthoringNodeView(ResourceModel):
    node_id: NodeId
    flow_node_id: NodeId
    kind: NodeKind
    description: str
    agent_id: AgentId | None
    inference_id: InferenceId | None
    calls: FlowId | None


class AuthoringFlowView(ResourceModel):
    flow_id: FlowId
    description: str
    input_type: str | None
    output_type: str | None
    nodes: tuple[AuthoringNodeView, ...]


class TagValueView(ResourceModel):
    value: str
    count: int


class AuthoringDatasetView(ResourceModel):
    dataset_id: DatasetId
    flow_id: FlowId | None
    total: int
    splits: dict[SeriesSplit, int]
    tags: dict[str, tuple[TagValueView, ...]]


class AuthoringOptionsView(ResourceModel):
    flows: tuple[AuthoringFlowView, ...]
    agents: tuple[AgentRefView, ...]
    datasets: tuple[AuthoringDatasetView, ...]
    evaluators: tuple[EvaluatorOptionView, ...]
    question_kinds: tuple[QuestionKind, ...]
    metrics: tuple[SeriesMetric, ...]


class CaseCountRequest(RequestModel):
    dataset_id: DatasetId
    tags: dict[TagName, str] = Field(default_factory=dict[TagName, str])


class CaseCountView(ResourceModel):
    selected: int
    total: int
    splits: dict[SeriesSplit, int]


def node_agent(spec: NodeSpec) -> AgentId | None:
    return spec.agent if isinstance(spec, LlmNodeSpec) else None


def node_inference(spec: NodeSpec) -> InferenceId | None:
    return spec.inference if isinstance(spec, LlmNodeSpec) else None


def node_calls(spec: NodeSpec) -> FlowId | None:
    return spec.flow if isinstance(spec, CallNodeSpec) else None


def authoring_node(node_id: NodeId, source: SourceSpec[NodeSpec]) -> AuthoringNodeView:
    spec = source.spec
    return AuthoringNodeView(
        node_id=local_node_id(node_id),
        flow_node_id=node_id,
        kind=NodeKind(spec.node),
        description=spec.description,
        agent_id=node_agent(spec),
        inference_id=node_inference(spec),
        calls=node_calls(spec),
    )


def authoring_flow(flow: LoadedFlow) -> AuthoringFlowView:
    source = flow.source
    return AuthoringFlowView(
        flow_id=flow.flow_id,
        description="" if source is None else source.spec.description,
        input_type=None if source is None else source.spec.input,
        output_type=None if source is None else source.spec.output,
        nodes=tuple(authoring_node(node_id, node) for node_id, node in ordered_nodes(flow)),
    )


def tag_values(dataset: DatasetFile) -> dict[str, tuple[TagValueView, ...]]:
    counted = Counter((name, value) for case in dataset.cases for name, value in (case.tags or {}).items())
    ranked = sorted(counted.items(), key=lambda item: (item[0][0], -item[1], item[0][1]))
    grouped: dict[str, list[TagValueView]] = {}
    for (name, value), count in ranked:
        grouped.setdefault(name, []).append(TagValueView(value=value, count=count))
    return {name: tuple(values) for name, values in grouped.items()}


def authoring_dataset(package: str, dataset_id: DatasetId, dataset: DatasetFile) -> AuthoringDatasetView:
    everything = tuple(range(len(dataset.cases)))
    return AuthoringDatasetView(
        dataset_id=dataset_id,
        flow_id=dataset.flow,
        total=len(dataset.cases),
        splits=selection_splits(package, dataset_id, dataset, everything),
        tags=tag_values(dataset),
    )


def flow_datasets(
    datasets: Mapping[DatasetId, SourceSpec[DatasetFile]], flow_id: FlowId | None
) -> tuple[tuple[DatasetId, DatasetFile], ...]:
    return tuple(
        (dataset_id, source.spec)
        for dataset_id, source in sorted(datasets.items())
        if flow_id is None or source.spec.flow == flow_id
    )


def project_agents(project: LoadedProject) -> tuple[AgentRefView, ...]:
    return tuple(agent_ref(project, agent_id) for agent_id in sorted(project.agents))


def authoring_options(state: WorkspaceState, flow_id: FlowId | None) -> AuthoringOptionsView:
    project = loaded_project(state)
    package = project.project.spec.package
    flows = sorted(project.flows.values(), key=lambda flow: flow.flow_id)
    return AuthoringOptionsView(
        flows=tuple(authoring_flow(flow) for flow in flows),
        agents=project_agents(project),
        datasets=tuple(
            authoring_dataset(package, dataset_id, dataset)
            for dataset_id, dataset in flow_datasets(project.datasets, flow_id)
        ),
        evaluators=evaluator_options(),
        question_kinds=QUESTION_KINDS,
        metrics=tuple(SeriesMetric),
    )


def case_count(state: WorkspaceState, request: CaseCountRequest) -> CaseCountView:
    project = loaded_project(state)
    source = project.datasets.get(request.dataset_id)
    if source is None:
        raise not_found(f"dataset {request.dataset_id} is not in the project")
    indices = selected_cases(source.spec, request.tags)
    package = project.project.spec.package
    return CaseCountView(
        selected=len(indices),
        total=len(source.spec.cases),
        splits=selection_splits(package, request.dataset_id, source.spec, indices),
    )
