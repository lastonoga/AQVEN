from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, Field, model_validator

from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from aqven.runtime.address import RequestModel, ResourceModel, RunId
from aqven.series.model import (
    AttemptId,
    AttemptOutcome,
    Contrast,
    LaunchPlan,
    MetricColumn,
    OutcomeClass,
    SeriesId,
    SeriesMatrix,
    SeriesOrigin,
    SeriesPause,
    SeriesStatus,
    SeriesVerdict,
    SubjectKind,
    ThresholdCell,
    VariantAggregates,
    VariantChange,
    VariantRole,
)
from aqven.series.protocol import MAX_LOOK_CASES, MAX_WAIT_SECONDS
from aqven.spec import (
    AgentId,
    AgentSpec,
    DatasetCase,
    DatasetId,
    ExperimentId,
    ExperimentPlan,
    FactorKind,
    FlowId,
    InferenceId,
    MetricDirection,
    MetricKind,
    NodeId,
    NodeKind,
    SeriesSplit,
    VariantId,
    VerdictState,
)
from aqven.spec.experiments import MAX_REPEATS
from aqven.write.model import Ulid

type QuestionKind = Literal["look", "threshold", "compare", "noninferior"]
type NodeFileRole = Literal["node", "code", "inference", "prompt"]
type ActivitySource = Literal["files", "series"]
type AttentionReason = Literal["spend_cap_pause", "series_invalid", "results_stale", "check_errors"]
type EtaState = Literal["estimating", "running", "paused"]


class LaunchRequest(RequestModel):
    on: SeriesSplit = SeriesSplit.DEV
    cases: int | None = Field(default=None, ge=1)
    repeats: int | None = Field(default=None, ge=1, le=MAX_REPEATS)
    cap_usd: Decimal | None = Field(default=None, gt=0)


class LookTarget(RequestModel):
    flow_id: FlowId
    dataset_id: DatasetId
    case_names: tuple[str, ...] = Field(min_length=1, max_length=MAX_LOOK_CASES)
    start_node: NodeId | None = None
    end_node: NodeId | None = None

    @model_validator(mode="after")
    def _whole_range(self) -> Self:
        if (self.start_node is None) != (self.end_node is None):
            raise ValueError("start_node and end_node must be provided together")
        return self


class SeriesStartRequest(LaunchRequest):
    experiment_id: ExperimentId | None = None
    look: LookTarget | None = None
    client_op_id: Ulid | None = None

    @model_validator(mode="after")
    def _one_origin(self) -> Self:
        if (self.experiment_id is None) == (self.look is None):
            raise ValueError("a series starts from exactly one of experiment_id or look")
        return self


class SubjectView(ResourceModel):
    kind: SubjectKind
    flow_id: FlowId
    local_flow: bool
    from_node: NodeId | None
    to_node: NodeId | None


class LatestSeries(ResourceModel):
    series_id: SeriesId
    on: SeriesSplit
    status: SeriesStatus
    verdict: VerdictState | None


class ExperimentSummaryView(ResourceModel):
    experiment_id: ExperimentId
    description: str
    flow_id: FlowId | None
    subject: SubjectView
    failure_mode: str | None
    question: QuestionKind
    variants: tuple[VariantId, ...]
    baseline: VariantId | None
    candidate: VariantId | None
    latest: LatestSeries | None
    series_count: int
    spent_usd: Decimal
    archived: bool
    created: AwareDatetime | None
    last_activity: AwareDatetime | None
    activity_source: ActivitySource | None
    running: bool
    attention: tuple[AttentionReason, ...]


class AgentRefView(ResourceModel):
    agent_id: AgentId
    model: str


class FactorView(ResourceModel):
    what: FactorKind
    nodes: tuple[NodeId, ...]


class FlowStepView(ResourceModel):
    node_id: NodeId
    kind: NodeKind
    agent: AgentRefView | None
    description: str


class LocalFlowView(ResourceModel):
    flow_id: FlowId
    description: str
    file: str | None
    steps: tuple[FlowStepView, ...]


class NodeFileView(ResourceModel):
    role: NodeFileRole
    path: str


class AlternativeView(ResourceModel):
    alternative_id: NodeId
    kind: NodeKind
    description: str
    file: str
    files: tuple[NodeFileView, ...]


class FactorSlotView(ResourceModel):
    node_id: NodeId
    kind: NodeKind
    written: str | None
    files: tuple[NodeFileView, ...]


class FactorAgentView(ResourceModel):
    agent_id: AgentId
    file: str
    spec: AgentSpec
    instructions: str | None


class ExperimentPromptView(ResourceModel):
    name: str
    file: str


class CaseSelectionView(ResourceModel):
    dataset_id: DatasetId
    flow_id: FlowId | None
    tags: dict[str, str]
    selected: int
    total: int
    splits: dict[SeriesSplit, int]


class AssignmentView(ResourceModel):
    node_id: NodeId
    agent: AgentRefView
    overridden: bool


class VariantView(ResourceModel):
    variant_id: VariantId
    role: VariantRole
    changes: tuple[VariantChange, ...]
    assignments: tuple[AssignmentView, ...]


class CheckSourceView(ResourceModel):
    kind: Literal["builtin", "code", "judge"]
    use: str | None = None
    fields: tuple[str, ...] = ()
    ref: str | None = None
    inference: InferenceId | None = None
    agent: AgentRefView | None = None
    validated_by: ExperimentId | None = None


class CheckView(ResourceModel):
    check_id: str
    kind: MetricKind
    source: CheckSourceView


class GuardrailView(ResourceModel):
    metric: str
    direction: MetricDirection
    margin: float
    relative: bool


class QuestionView(ResourceModel):
    kind: QuestionKind
    metric: str | None = None
    bound: Literal["above", "below"] | None = None
    value: float | None = None
    variant: VariantId | None = None
    baseline: VariantId | None = None
    candidate: VariantId | None = None
    direction: MetricDirection | None = None
    margin: float | None = None
    relative: bool = False
    guardrails: tuple[GuardrailView, ...] = ()


class ExperimentFilesView(ResourceModel):
    spec: str
    notes: str | None


class ExperimentDetailView(ExperimentSummaryView):
    question_detail: QuestionView
    varies: FactorView | None
    slots: tuple[FactorSlotView, ...]
    agents: tuple[FactorAgentView, ...]
    flows: tuple[LocalFlowView, ...]
    alternatives: tuple[AlternativeView, ...]
    prompts: tuple[ExperimentPromptView, ...]
    cases: CaseSelectionView
    variant_details: tuple[VariantView, ...]
    checks: tuple[CheckView, ...]
    metrics: tuple[MetricColumn, ...]
    plan: ExperimentPlan
    notes: str | None
    files: ExperimentFilesView


class SeriesProgress(ResourceModel):
    done: int
    total: int


class SeriesSpend(ResourceModel):
    usd: Decimal
    cap_usd: Decimal
    unpriced_attempts: int = Field(default=0, ge=0)


class SeriesEta(ResourceModel):
    state: EtaState
    attempts_per_minute: float | None
    remaining_seconds: int | None = Field(ge=0)
    finish_at: AwareDatetime | None
    window_seconds: int = Field(ge=0)


class SeriesSummaryView(ResourceModel):
    series_id: SeriesId
    origin: SeriesOrigin
    flow_id: FlowId | None
    dataset_id: DatasetId
    question: QuestionKind
    on: SeriesSplit
    cases: int
    repeats: int
    variants: tuple[VariantId, ...]
    status: SeriesStatus
    progress: SeriesProgress
    spend: SeriesSpend
    verdict: SeriesVerdict | None
    waits: int
    started_at: AwareDatetime
    finished_at: AwareDatetime | None
    pause: SeriesPause | None = None
    eta: SeriesEta | None = None


class SeriesStarted(SeriesSummaryView):
    launch: LaunchPlan


class StabilityRow(ResourceModel):
    variant_id: VariantId
    always: int
    never: int
    flaky: int


class SeriesDetailView(SeriesSummaryView):
    question_detail: QuestionView
    checks: tuple[CheckView, ...]
    matrix: SeriesMatrix
    stability: tuple[StabilityRow, ...]
    contrasts: tuple[Contrast, ...]
    thresholds: tuple[ThresholdCell, ...]
    aggregates: tuple[VariantAggregates, ...]
    launch: LaunchPlan
    needs_approval: bool
    approved_by: str | None
    finding_path: str | None
    error: str | None


class AttemptView(ResourceModel):
    run_id: RunId
    variant_id: VariantId
    repeat: int
    passed: bool
    outcome: AttemptOutcome
    failed_checks: tuple[str, ...]
    usd: Decimal
    latency_ms: int
    error: str | None = None


class VariantTally(ResourceModel):
    variant_id: VariantId
    passed: int
    total: int
    failed_checks: tuple[str, ...]
    usd: Decimal


class SeriesCaseRow(ResourceModel):
    name: str
    split: SeriesSplit
    tags: dict[str, str]
    variants: tuple[VariantTally, ...]
    usd: Decimal
    failing: bool
    divergent: bool
    attempts: tuple[AttemptView, ...]


class SeriesGetRequest(RequestModel):
    series_id: SeriesId
    wait_seconds: int = Field(default=0, ge=0, le=MAX_WAIT_SECONDS)
    include_cases: bool = False


class SeriesGetResult(ResourceModel):
    series: SeriesDetailView
    cases: tuple[SeriesCaseRow, ...] | None
    hidden_cases: int


class SeriesCancelRequest(RequestModel):
    series_id: SeriesId
    reason: str | None = None


class SeriesListQuery(RequestModel):
    experiment_id: ExperimentId | None = None
    flow_id: FlowId | None = None
    status: SeriesStatus | None = None
    cursor: str | None = None
    limit: int = Field(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT)


class SeriesCasesQuery(RequestModel):
    failures: bool = False
    divergent: bool = False


class ExperimentListQuery(RequestModel):
    flow_id: FlowId | None = None
    question: QuestionKind | None = None
    failure_mode: str | None = None
    cursor: str | None = None
    limit: int = Field(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT)


class CaseFromRunRequest(RequestModel):
    run_id: RunId
    name: str | None = Field(default=None, min_length=1)


class CaseDraft(ResourceModel):
    dataset_id: DatasetId
    case: DatasetCase
    yaml: str


class SeriesEventBase(ResourceModel):
    seq: int = Field(ge=1)
    at: AwareDatetime
    series_id: SeriesId


class SeriesStatusEvent(SeriesEventBase):
    type: Literal["series_status"] = "series_status"
    status: SeriesStatus


class AttemptFinishedEvent(SeriesEventBase):
    type: Literal["attempt_finished"] = "attempt_finished"
    attempt_id: AttemptId
    ordinal: int
    variant_id: VariantId
    case_name: str
    repeat: int
    run_id: RunId
    outcome: OutcomeClass
    passed: bool | None
    cost_usd: Decimal
    done: int
    total: int
    spend_usd: Decimal


class SeriesFinishedEvent(SeriesEventBase):
    type: Literal["series_finished"] = "series_finished"
    status: SeriesStatus
    verdict: VerdictState | None


type SeriesEvent = Annotated[
    SeriesStatusEvent | AttemptFinishedEvent | SeriesFinishedEvent, Field(discriminator="type")
]
