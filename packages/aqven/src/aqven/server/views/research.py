import posixpath
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, assert_never

from aqven.check.datasets import selected_cases
from aqven.loader import NODE_ID_SEPARATOR, LoadedExperiment, LoadedFlow, LoadedProject, scoped
from aqven.loader.layout import EXPERIMENT_NOTES
from aqven.ports.engine import MAX_PAGE_LIMIT
from aqven.runtime.address import RequestModel
from aqven.runtime.runs import Page
from aqven.series.model import CheckPlan, MetricColumn, MetricRole, SubjectKind, VariantRole
from aqven.series.ports import SeriesJobs
from aqven.series.presenter import UNKNOWN_MODEL, field_names, question_view
from aqven.series.split import splits_of
from aqven.series.stats.metrics import MetricDefinition, MetricRegistry
from aqven.series.views import (
    AgentRefView,
    ArmStepView,
    ArmView,
    AssignmentView,
    CaseSelectionView,
    CheckSourceView,
    CheckView,
    ExperimentDetailView,
    ExperimentFilesView,
    ExperimentListQuery,
    ExperimentSummaryView,
    LatestSeries,
    QuestionKind,
    SeriesListQuery,
    SeriesSummaryView,
    SubjectView,
    VariantView,
)
from aqven.server.errors import ApiFailure, not_found
from aqven.server.resources import ArmFlowView
from aqven.server.views.common import loaded_project, page_of
from aqven.server.views.flows import loaded_flow_schemas
from aqven.server.views.nodes import flow_node_summaries
from aqven.server.workspace import WorkspaceState
from aqven.spec import (
    AgentId,
    ArmId,
    CompareQuestion,
    DatasetFile,
    DatasetId,
    ExperimentCheck,
    ExperimentId,
    ExperimentSpec,
    FlowId,
    Guardrail,
    LlmNodeSpec,
    LookQuestion,
    MetricDirection,
    NodeId,
    NodeKind,
    NoninferiorQuestion,
    Question,
    SeriesSplit,
    ThresholdQuestion,
    VariantId,
    VariantSpec,
)

SERIES_UNAVAILABLE: Final = "series run on the project server: this app was built without the series service"


class SeriesCancelBody(RequestModel):
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class SeriesLedger:
    latest: LatestSeries | None
    count: int
    spent_usd: Decimal


EMPTY_LEDGER: Final = SeriesLedger(latest=None, count=0, spent_usd=Decimal(0))


def series_jobs(jobs: SeriesJobs | None) -> SeriesJobs:
    if jobs is None:
        raise ApiFailure("NOT_RUNNABLE", SERIES_UNAVAILABLE)
    return jobs


async def experiment_series(jobs: SeriesJobs, experiment_id: ExperimentId) -> tuple[SeriesSummaryView, ...]:
    rows: list[SeriesSummaryView] = []
    cursor: str | None = None
    while True:
        page = await jobs.list(SeriesListQuery(experiment_id=experiment_id, cursor=cursor, limit=MAX_PAGE_LIMIT))
        rows.extend(page.items)
        cursor = page.next_cursor
        if cursor is None:
            return tuple(rows)


def latest_series(rows: Sequence[SeriesSummaryView]) -> LatestSeries | None:
    if not rows:
        return None
    newest = max(rows, key=lambda row: (row.started_at, row.series_id))
    verdict = None if newest.verdict is None else newest.verdict.state
    return LatestSeries(series_id=newest.series_id, on=newest.on, status=newest.status, verdict=verdict)


async def series_ledger(jobs: SeriesJobs | None, experiment_id: ExperimentId) -> SeriesLedger:
    if jobs is None:
        return EMPTY_LEDGER
    rows = await experiment_series(jobs, experiment_id)
    spent = sum((row.spend.usd for row in rows), Decimal(0))
    return SeriesLedger(latest=latest_series(rows), count=len(rows), spent_usd=spent)


def question_kind(question: Question) -> QuestionKind:
    return question.kind


def metric_registry(checks: Sequence[ExperimentCheck]) -> MetricRegistry:
    plans = tuple(CheckPlan(check_id=check.id, kind=check.kind, evaluator={}) for check in checks)
    return MetricRegistry.of(plans, ())


def metric_column(
    definition: MetricDefinition,
    role: MetricRole,
    direction: MetricDirection | None = None,
    margin: float | None = None,
    relative: bool = False,
) -> MetricColumn:
    return MetricColumn(
        metric=definition.name,
        role=role,
        direction=direction or definition.direction,
        unit=definition.unit,
        margin=margin,
        relative=relative,
    )


def guardrail_column(guardrail: Guardrail, registry: MetricRegistry) -> MetricColumn:
    definition = registry.get(guardrail.metric)
    return metric_column(definition, MetricRole.GUARDRAIL, guardrail.direction, guardrail.margin, guardrail.relative)


def lead_columns(question: Question, registry: MetricRegistry) -> tuple[MetricColumn, ...]:
    match question:
        case LookQuestion():
            return ()
        case ThresholdQuestion():
            return (metric_column(registry.get(question.metric), MetricRole.PRIMARY, margin=question.margin),)
        case CompareQuestion() | NoninferiorQuestion():
            primary = registry.get(question.primary)
            lead = metric_column(primary, MetricRole.PRIMARY, question.direction, question.margin)
            return (lead, *(guardrail_column(guardrail, registry) for guardrail in question.guardrails or ()))
        case _:
            assert_never(question)


def metric_columns(question: Question, checks: Sequence[ExperimentCheck]) -> tuple[MetricColumn, ...]:
    registry = metric_registry(checks)
    ordered = (
        *lead_columns(question, registry),
        *(metric_column(definition, MetricRole.CHECK) for definition in registry.checks.values()),
        *(metric_column(definition, MetricRole.BUILTIN) for definition in registry.builtins.values()),
    )
    first: dict[str, MetricColumn] = {}
    for column in ordered:
        first.setdefault(column.metric, column)
    return tuple(first.values())


def pair_of(question: Question) -> tuple[VariantId | None, VariantId | None]:
    match question:
        case CompareQuestion() | NoninferiorQuestion():
            return question.baseline, question.candidate
        case LookQuestion() | ThresholdQuestion():
            return None, None
        case _:
            assert_never(question)


def variant_role(question: Question, variant_id: VariantId) -> VariantRole:
    baseline, candidate = pair_of(question)
    roles: dict[VariantId | None, VariantRole] = {baseline: VariantRole.BASELINE, candidate: VariantRole.CANDIDATE}
    return roles.get(variant_id, VariantRole.OTHER)


def subject_view(spec: ExperimentSpec) -> SubjectView:
    subject = spec.subject
    kinds = {(True, False): SubjectKind.ARM, (True, True): SubjectKind.ARM, (False, True): SubjectKind.RANGE}
    kind = kinds.get((subject.arm is not None, subject.from_ is not None), SubjectKind.FLOW)
    return SubjectView(kind=kind, flow_id=subject.flow, arm_id=subject.arm, from_node=subject.from_, to_node=subject.to)


def agent_ref(project: LoadedProject, agent_id: AgentId) -> AgentRefView:
    agent = project.agents.get(agent_id)
    return AgentRefView(agent_id=agent_id, model=UNKNOWN_MODEL if agent is None else agent.spec.model)


def subject_target(project: LoadedProject, loaded: LoadedExperiment) -> LoadedFlow | None:
    subject = loaded.source.spec.subject
    if subject.arm is not None:
        return loaded.arms.get(subject.arm)
    return None if subject.flow is None else project.flows.get(subject.flow)


def variant_target(project: LoadedProject, loaded: LoadedExperiment, variant: VariantSpec) -> LoadedFlow | None:
    if variant.arm is not None:
        return loaded.arms.get(variant.arm)
    return subject_target(project, loaded)


def range_nodes(spec: ExperimentSpec, flow: LoadedFlow) -> frozenset[str] | None:
    subject = spec.subject
    source = flow.source
    if source is None or subject.from_ is None or subject.to is None:
        return None
    order = source.spec.order
    if subject.from_ not in order or subject.to not in order:
        return None
    return frozenset(order[order.index(subject.from_) : order.index(subject.to) + 1])


def in_scope(node_id: NodeId, scope: frozenset[str] | None) -> bool:
    return scope is None or node_id.split(NODE_ID_SEPARATOR)[0] in scope


def assignments(
    project: LoadedProject, spec: ExperimentSpec, flow: LoadedFlow | None, variant: VariantSpec
) -> tuple[AssignmentView, ...]:
    if flow is None:
        return ()
    scope = range_nodes(spec, flow)
    chosen = variant.agents or {}
    nodes = sorted(
        (node_id, source.spec)
        for node_id, source in flow.nodes.items()
        if isinstance(source.spec, LlmNodeSpec) and in_scope(node_id, scope)
    )
    return tuple(
        AssignmentView(
            node_id=node_id,
            agent=agent_ref(project, chosen.get(node_id, node.agent)),
            overridden=node_id in chosen,
        )
        for node_id, node in nodes
    )


def variant_view(project: LoadedProject, loaded: LoadedExperiment, variant: VariantSpec) -> VariantView:
    spec = loaded.source.spec
    return VariantView(
        variant_id=variant.id,
        arm_id=variant.arm,
        role=variant_role(spec.question, variant.id),
        assignments=assignments(project, spec, variant_target(project, loaded, variant), variant),
    )


def arm_steps(project: LoadedProject, flow: LoadedFlow) -> tuple[ArmStepView, ...]:
    if flow.source is None:
        return ()
    steps = ((node_id, flow.nodes.get(node_id)) for node_id in flow.source.spec.order)
    return tuple(
        ArmStepView(
            node_id=node_id,
            kind=NodeKind(node.spec.node),
            agent=agent_ref(project, node.spec.agent) if isinstance(node.spec, LlmNodeSpec) else None,
            description=node.spec.description,
        )
        for node_id, node in steps
        if node is not None
    )


def arm_views(project: LoadedProject, loaded: LoadedExperiment) -> tuple[ArmView, ...]:
    return tuple(
        ArmView(
            arm_id=arm_id,
            description="" if flow.source is None else flow.source.spec.description,
            steps=arm_steps(project, flow),
        )
        for arm_id, flow in sorted(loaded.arms.items())
    )


def check_source(project: LoadedProject, check: ExperimentCheck) -> CheckSourceView:
    if check.inference is not None and check.agent is not None:
        return CheckSourceView(
            kind="judge",
            inference=check.inference,
            agent=agent_ref(project, check.agent),
            validated_by=check.validated_by,
        )
    if check.run is not None:
        return CheckSourceView(kind="code", ref=check.run, fields=field_names(check.with_ or {}))
    return CheckSourceView(kind="builtin", use=check.use, fields=field_names(check.with_ or {}))


def check_views(project: LoadedProject, spec: ExperimentSpec) -> tuple[CheckView, ...]:
    return tuple(
        CheckView(check_id=check.id, kind=check.kind, source=check_source(project, check))
        for check in spec.checks or ()
    )


def selection_splits(
    package: str, dataset_id: DatasetId, dataset: DatasetFile, indices: Sequence[int]
) -> dict[SeriesSplit, int]:
    names = [dataset.cases[index].name for index in indices]
    counted = Counter(splits_of(package, dataset_id, names).values())
    return {split: counted[split] for split in SeriesSplit}


def case_selection(project: LoadedProject, spec: ExperimentSpec) -> CaseSelectionView:
    selection = spec.cases
    tags = dict(selection.tags or {})
    source = project.datasets.get(selection.dataset)
    if source is None:
        empty = {split: 0 for split in SeriesSplit}
        return CaseSelectionView(
            dataset_id=selection.dataset, flow_id=None, tags=tags, selected=0, total=0, splits=empty
        )
    indices = selected_cases(source.spec, selection.tags)
    package = project.project.spec.package
    return CaseSelectionView(
        dataset_id=selection.dataset,
        flow_id=source.spec.flow,
        tags=tags,
        selected=len(indices),
        total=len(source.spec.cases),
        splits=selection_splits(package, selection.dataset, source.spec, indices),
    )


def experiment_flow(project: LoadedProject, spec: ExperimentSpec) -> FlowId | None:
    if spec.subject.flow is not None:
        return spec.subject.flow
    dataset = project.datasets.get(spec.cases.dataset)
    return None if dataset is None else dataset.spec.flow


def experiment_summary(project: LoadedProject, loaded: LoadedExperiment, ledger: SeriesLedger) -> ExperimentSummaryView:
    spec = loaded.source.spec
    baseline, candidate = pair_of(spec.question)
    return ExperimentSummaryView(
        experiment_id=loaded.experiment_id,
        description=spec.description,
        flow_id=experiment_flow(project, spec),
        subject=subject_view(spec),
        failure_mode=spec.failure_mode,
        question=question_kind(spec.question),
        variants=tuple(variant.id for variant in spec.variants),
        baseline=baseline,
        candidate=candidate,
        latest=ledger.latest,
        series_count=ledger.count,
        spent_usd=ledger.spent_usd,
    )


def experiment_files(loaded: LoadedExperiment) -> ExperimentFilesView:
    notes = None if loaded.notes is None else posixpath.join(loaded.folder, EXPERIMENT_NOTES)
    return ExperimentFilesView(spec=loaded.source.path, notes=notes)


def experiment_detail(project: LoadedProject, loaded: LoadedExperiment, ledger: SeriesLedger) -> ExperimentDetailView:
    spec = loaded.source.spec
    checks = tuple(spec.checks or ())
    summary = experiment_summary(project, loaded, ledger)
    return ExperimentDetailView(
        **summary.model_dump(),
        question_detail=question_view(spec.question),
        arms=arm_views(project, loaded),
        cases=case_selection(project, spec),
        variant_details=tuple(variant_view(project, loaded, variant) for variant in spec.variants),
        checks=check_views(project, spec),
        metrics=metric_columns(spec.question, checks),
        plan=spec.plan,
        notes=loaded.notes,
        files=experiment_files(loaded),
    )


def listed(loaded: LoadedExperiment, project: LoadedProject, query: ExperimentListQuery) -> bool:
    spec = loaded.source.spec
    filters = (
        query.flow_id is None or experiment_flow(project, spec) == query.flow_id,
        query.question is None or spec.question.kind == query.question,
        query.failure_mode is None or spec.failure_mode == query.failure_mode,
    )
    return all(filters)


def loaded_experiment(state: WorkspaceState, experiment_id: str) -> LoadedExperiment:
    loaded = loaded_project(state).experiments.get(ExperimentId(experiment_id))
    if loaded is None:
        raise not_found(f"experiment {experiment_id} is not in the project")
    return loaded


def arm_flow(state: WorkspaceState, experiment_id: str, arm_id: str) -> ArmFlowView:
    loaded = loaded_experiment(state, experiment_id)
    arm = loaded.arms.get(ArmId(arm_id))
    if arm is None:
        raise not_found(f"arm {arm_id} is not in experiment {experiment_id}")
    source = arm.source
    return ArmFlowView(
        experiment_id=loaded.experiment_id,
        arm_id=ArmId(arm_id),
        flow_id=arm.flow_id,
        description=None if source is None else source.spec.description,
        order=() if source is None else tuple(source.spec.order),
        nodes=flow_node_summaries(state, arm, scoped(loaded.experiment_id, arm_id)),
        schemas=loaded_flow_schemas(state, arm),
    )


@dataclass(frozen=True, slots=True)
class ExperimentCatalog:
    jobs: SeriesJobs | None

    async def page(self, state: WorkspaceState, query: ExperimentListQuery) -> Page[ExperimentSummaryView]:
        project = loaded_project(state)
        ids = sorted(key for key, loaded in project.experiments.items() if listed(loaded, project, query))
        chosen = page_of(ids, str, query.cursor, query.limit)
        items = [
            experiment_summary(project, project.experiments[key], await series_ledger(self.jobs, key))
            for key in chosen.items
        ]
        return Page[ExperimentSummaryView](
            items=tuple(items), next_cursor=chosen.next_cursor, total_estimate=chosen.total_estimate
        )

    async def detail(self, state: WorkspaceState, experiment_id: str) -> ExperimentDetailView:
        project = loaded_project(state)
        loaded = loaded_experiment(state, experiment_id)
        return experiment_detail(project, loaded, await series_ledger(self.jobs, loaded.experiment_id))
