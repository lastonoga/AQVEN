from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Final, Literal, NewType

from pydantic import AwareDatetime, BaseModel, Field, JsonValue

from aqven.engine.checking.model import CheckState
from aqven.engine.request import RECORD_CONFIG
from aqven.runtime.address import JsonObject, ResourceModel, RunId
from aqven.spec import (
    AgentId,
    ArmId,
    CellVerdict,
    DatasetId,
    ExperimentId,
    FlowId,
    InferenceId,
    MetricDirection,
    MetricKind,
    NodeId,
    Question,
    SeriesSplit,
    TypeId,
    VariantId,
    VerdictReason,
    VerdictState,
)
from aqven.spec.experiments import MAX_REPEATS

SeriesId = NewType("SeriesId", str)
AttemptId = NewType("AttemptId", str)


class SeriesStatus(StrEnum):
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    WAITING_HUMAN = "waiting_human"
    DONE = "done"
    CANCELLED = "cancelled"
    FAILED = "failed"


STORED_STATUSES: Final = frozenset(status for status in SeriesStatus if status is not SeriesStatus.WAITING_HUMAN)
TERMINAL_STATUSES: Final = frozenset({SeriesStatus.DONE, SeriesStatus.CANCELLED, SeriesStatus.FAILED})
SETTLED_STATUSES: Final = TERMINAL_STATUSES | {SeriesStatus.AWAITING_APPROVAL, SeriesStatus.WAITING_HUMAN}


class OutcomeClass(StrEnum):
    OK = "ok"
    MODEL_FAIL = "model_fail"
    SCHEMA_INVALID = "schema_invalid"
    REFUSAL = "refusal"
    INFRA_ERROR = "infra_error"
    BUDGET_CUT = "budget_cut"
    CANCELLED = "cancelled"


COUNTED_OUTCOMES: Final = frozenset(
    {OutcomeClass.OK, OutcomeClass.MODEL_FAIL, OutcomeClass.SCHEMA_INVALID, OutcomeClass.REFUSAL}
)


class AttemptState(StrEnum):
    RUNNING = "running"
    FINISHED = "finished"


class AttemptOutcome(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    WAITING = "waiting"
    RUNNING = "running"


class SubjectKind(StrEnum):
    FLOW = "flow"
    RANGE = "range"
    ARM = "arm"


class VariantRole(StrEnum):
    BASELINE = "baseline"
    CANDIDATE = "candidate"
    OTHER = "other"


class MetricShape(StrEnum):
    RATE = "rate"
    MEAN = "mean"
    RATIO = "ratio"
    QUANTILE = "quantile"


class MetricRole(StrEnum):
    PRIMARY = "primary"
    GUARDRAIL = "guardrail"
    CHECK = "check"
    BUILTIN = "builtin"


class MetricUnit(StrEnum):
    RATE = "rate"
    SCORE = "score"
    ORDINAL = "ordinal"
    USD = "usd"
    MS = "ms"


class StatMethod(StrEnum):
    WILSON = "wilson"
    KISH_WILSON = "kish_wilson"
    BETA_BINOMIAL = "beta_binomial"
    T_CASE_MEANS = "t_case_means"
    BCA_CASE_MEANS = "bca_case_means"
    BOOTSTRAP_RATIO = "bootstrap_ratio"
    BOOTSTRAP_QUANTILE = "bootstrap_quantile"
    EXACT_SIGN = "exact_sign"
    PAIRED_T = "paired_t"
    PAIRED_BCA = "paired_bca"
    PAIRED_BOOTSTRAP_RATIO = "paired_bootstrap_ratio"
    PAIRED_BOOTSTRAP_QUANTILE = "paired_bootstrap_quantile"


class DegenerateReason(StrEnum):
    NO_DATA = "no_data"
    TOO_FEW_CASES = "too_few_cases"
    TOO_FEW_ATTEMPTS = "too_few_attempts"
    NO_DISCORDANCE = "no_discordance"
    UNINFORMATIVE = "uninformative"
    NUMERIC = "numeric"


class EstimateReason(StrEnum):
    LOOK = "look"
    WIDE = "wide"
    ENOUGH = "enough"
    NO_MARGIN = "no_margin"
    NO_HISTORY = "no_history"
    SHORT_OF_CASES = "short_of_cases"


class StopCause(StrEnum):
    COMPLETED = "completed"
    BUDGET_CUT = "budget_cut"


class RecordModel(BaseModel):
    model_config = RECORD_CONFIG


class Recommendation(ResourceModel):
    cases: int
    repeats: int
    reason: EstimateReason
    text: str


class SeriesEstimate(ResourceModel):
    on: SeriesSplit
    cases: int
    repeats: int
    variants: int
    attempts: int
    available: int
    usd: Decimal | None
    usd_source: Literal["history", "prices", "unknown"]
    minutes: int | None
    half_width: float | None
    mde: float | None
    margin: float | None
    spread: float | None
    spread_source: Literal["history", "prior", "none"]
    icc: float
    recommended: Recommendation
    below_recommended: bool
    needs_approval: bool
    project_cap_usd: Decimal
    cap_usd: Decimal
    warnings: tuple[str, ...] = ()


class Estimate(ResourceModel):
    value: float | None
    low: float | None
    high: float | None
    method: StatMethod | None
    p_value: float | None = None
    p_adjusted: float | None = None
    cases: int = Field(ge=0)
    attempts: int = Field(ge=0)
    degenerate: DegenerateReason | None = None


class Stability(ResourceModel):
    always: int = Field(ge=0)
    never: int = Field(ge=0)
    flaky: int = Field(ge=0)


class VariantAggregates(ResourceModel):
    variant_id: VariantId
    role: VariantRole
    cases: int
    attempts: int
    counted: int
    infra_errors: int
    spend_usd: Decimal
    pass_k: float | None
    icc: float | None
    stability: Stability | None
    metrics: dict[str, Estimate]
    runtime_checks: dict[str, Estimate]
    models: tuple[str, ...]


class MetricColumn(ResourceModel):
    metric: str
    role: MetricRole
    direction: MetricDirection
    unit: MetricUnit
    margin: float | None
    relative: bool


class MetricCell(ResourceModel):
    metric: str
    value: float | None
    low: float | None
    high: float | None
    verdict: CellVerdict
    method: StatMethod | None
    cases: int


class MatrixRow(ResourceModel):
    variant_id: VariantId
    role: VariantRole
    cells: tuple[MetricCell, ...]


class SeriesMatrix(ResourceModel):
    columns: tuple[MetricColumn, ...]
    rows: tuple[MatrixRow, ...]


class ThresholdCell(ResourceModel):
    metric: str
    variant_id: VariantId
    bound: Literal["above", "below"]
    threshold: float
    margin: float
    estimate: Estimate
    verdict: CellVerdict


class Contrast(ResourceModel):
    metric: str
    role: Literal["primary", "guardrail"]
    baseline: VariantId
    candidate: VariantId
    direction: MetricDirection
    margin: float
    relative: bool
    margin_abs: float | None
    difference: Estimate
    verdict: CellVerdict


class SeriesVerdict(ResourceModel):
    state: VerdictState
    reason: VerdictReason | None
    text: str


class SeriesAnalysis(ResourceModel):
    variants: tuple[VariantAggregates, ...]
    matrix: SeriesMatrix
    thresholds: tuple[ThresholdCell, ...]
    contrasts: tuple[Contrast, ...]
    verdict: SeriesVerdict | None
    infra_error_share: float


class CaseSnapshot(RecordModel):
    case_index: int = Field(ge=0)
    name: str
    split: SeriesSplit
    tags: dict[str, str] = Field(default_factory=dict[str, str])
    inputs: JsonValue
    context: dict[str, JsonValue] | None = None
    node_outputs: dict[NodeId, JsonValue] = Field(default_factory=dict[NodeId, JsonValue])
    expected_output: JsonValue = None


class SubjectRecord(RecordModel):
    kind: SubjectKind
    flow_id: FlowId | None
    arm_id: ArmId | None
    start_node: NodeId | None
    end_node: NodeId | None


class Assignment(RecordModel):
    node_id: NodeId
    agent_id: AgentId
    model: str
    overridden: bool


class VariantPlanRecord(RecordModel):
    variant_id: VariantId
    role: VariantRole
    arm_id: ArmId | None
    flow_id: FlowId
    ir_hash: str
    flow_hash: str
    input_type: TypeId
    output_type: TypeId | None
    assignments: tuple[Assignment, ...]


class JudgePlan(RecordModel):
    flow_id: FlowId
    inference: InferenceId
    agent: AgentId
    input_fields: tuple[str, ...]
    validated_by: ExperimentId | None


class CheckPlan(RecordModel):
    check_id: str
    kind: MetricKind
    evaluator: JsonObject
    threshold: float | None = None
    judge: JudgePlan | None = None
    only_with_expected: bool = False


class SeriesSnapshot(RecordModel):
    experiment_sha256: str | None
    dataset_sha256: str
    cases_sha256: str
    flows: dict[VariantId, str]
    judges: dict[str, str]
    code_sha256: str
    engine_version: str


class SeriesPlanRecord(RecordModel):
    subject: SubjectRecord
    question: Question | None
    variants: tuple[VariantPlanRecord, ...] = Field(min_length=1)
    checks: tuple[CheckPlan, ...]
    judge_ir_hash: str | None
    package: str
    repeats: int = Field(ge=1, le=MAX_REPEATS)
    case_count: int = Field(ge=1)
    per_attempt_usd: Decimal | None
    snapshot: SeriesSnapshot


class ExperimentOrigin(RecordModel):
    kind: Literal["experiment"] = "experiment"
    experiment_id: ExperimentId


class LookOrigin(RecordModel):
    kind: Literal["look"] = "look"
    flow_id: FlowId
    dataset_id: DatasetId
    case_names: tuple[str, ...]
    start_node: NodeId | None = None
    end_node: NodeId | None = None


type SeriesOrigin = Annotated[ExperimentOrigin | LookOrigin, Field(discriminator="kind")]


class SeriesRecord(RecordModel):
    series_id: SeriesId
    origin: SeriesOrigin
    flow_id: FlowId | None
    dataset_id: DatasetId
    on: SeriesSplit
    status: SeriesStatus
    plan: SeriesPlanRecord
    estimate: SeriesEstimate
    cap_usd: Decimal
    needs_approval: bool
    created_at: AwareDatetime
    approved_by: str | None = None
    approved_at: AwareDatetime | None = None
    finished_at: AwareDatetime | None = None
    stop: StopCause | None = None
    verdict: SeriesVerdict | None = None
    analysis: SeriesAnalysis | None = None
    finding_path: str | None = None
    error: str | None = None


class SeriesChange(RecordModel):
    status: SeriesStatus | None = None
    approved_by: str | None = None
    approved_at: AwareDatetime | None = None
    finished_at: AwareDatetime | None = None
    stop: StopCause | None = None
    verdict: SeriesVerdict | None = None
    analysis: SeriesAnalysis | None = None
    finding_path: str | None = None
    error: str | None = None


class CheckValue(RecordModel):
    check_id: str
    kind: MetricKind
    state: CheckState
    value: float | None
    reason: str | None = None
    cost_usd: Decimal = Decimal(0)
    judge_run_id: RunId | None = None


class RuntimeCheckTry(RecordModel):
    check: str
    failed_first_try: bool


class AttemptRecord(RecordModel):
    attempt_id: AttemptId
    series_id: SeriesId
    ordinal: int = Field(ge=0)
    variant_id: VariantId
    case_name: str
    split: SeriesSplit
    repeat: int = Field(ge=1)
    run_id: RunId
    state: AttemptState
    outcome: OutcomeClass | None = None
    passed: bool | None = None
    error_code: str | None = None
    error_message: str | None = None
    first_failed_node: str | None = None
    checks: tuple[CheckValue, ...] = ()
    runtime_checks: tuple[RuntimeCheckTry, ...] = ()
    schema_valid_first_try: bool | None = None
    cost_usd: Decimal = Decimal(0)
    check_cost_usd: Decimal = Decimal(0)
    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    latency_ms: int | None = None
    wait_ms: int = Field(default=0, ge=0)
    models: dict[str, str] = Field(default_factory=dict[str, str])
    started_at: AwareDatetime
    finished_at: AwareDatetime | None = None


@dataclass(frozen=True, slots=True)
class AnalysisInput:
    series_id: SeriesId
    question: Question | None
    split: SeriesSplit
    status: SeriesStatus
    stop: StopCause | None
    inputs_changed: bool
    variants: tuple[VariantPlanRecord, ...]
    checks: tuple[CheckPlan, ...]
    repeats: int
    case_names: tuple[str, ...]
    attempts: tuple[AttemptRecord, ...]
