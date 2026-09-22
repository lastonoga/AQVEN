from decimal import Decimal
from typing import Annotated, Literal, NewType

from pydantic import AwareDatetime, Field, JsonValue

from aqven.evals.gate import GateReport
from aqven.runtime.address import ResourceModel, RunId
from aqven.spec import AgentId, DatasetId, EvalId, FlowId, InferenceId, MetricKind

EvalRunId = NewType("EvalRunId", str)

type CaseStatus = Literal["ok", "failed"]
type EvalRunStatus = Literal["running", "completed", "failed"]


class ScoreRecord(ResourceModel):
    scorer_id: str
    kind: MetricKind
    value: float
    passed: bool | None = None
    reason: str | None = None
    cost_usd: Decimal = Decimal(0)


class CaseRecord(ResourceModel):
    case_name: str
    run_index: Annotated[int, Field(ge=0)]
    seed: int
    status: CaseStatus
    run_id: RunId | None = None
    output: JsonValue = None
    error: str | None = None
    cost_usd: Decimal = Decimal(0)
    tokens_in: Annotated[int, Field(ge=0)] = 0
    tokens_out: Annotated[int, Field(ge=0)] = 0
    latency_ms: Annotated[int, Field(ge=0)] = 0
    scores: tuple[ScoreRecord, ...] = ()


class ScorerSummary(ResourceModel):
    scorer_id: str
    kind: MetricKind
    n: Annotated[int, Field(ge=0)]
    mean: float
    pass_rate: float | None = None
    minimum: float
    maximum: float


class ScorerDelta(ResourceModel):
    scorer_id: str
    kind: MetricKind
    n: Annotated[int, Field(ge=0)]
    baseline_mean: float
    candidate_mean: float
    delta: float
    wins: Annotated[int, Field(ge=0)]
    losses: Annotated[int, Field(ge=0)]
    ties: Annotated[int, Field(ge=0)]


class EvalRunRecord(ResourceModel):
    eval_run_id: EvalRunId
    eval_id: EvalId
    dataset_id: DatasetId
    inference: InferenceId
    agent: AgentId
    status: EvalRunStatus
    spec_hash: str = ""
    started_at: AwareDatetime
    finished_at: AwareDatetime | None = None
    repeats: Annotated[int, Field(ge=1)] = 1
    seeds: tuple[int, ...] = ()
    cases_total: Annotated[int, Field(ge=0)] = 0
    cases_ok: Annotated[int, Field(ge=0)] = 0
    cases_failed: Annotated[int, Field(ge=0)] = 0
    dropped_cases: tuple[str, ...] = ()
    cost_usd: Decimal = Decimal(0)
    tokens_in: Annotated[int, Field(ge=0)] = 0
    tokens_out: Annotated[int, Field(ge=0)] = 0
    scorers: tuple[ScorerSummary, ...] = ()
    baseline_run_id: EvalRunId | None = None
    deltas: tuple[ScorerDelta, ...] = ()
    gate: GateReport | None = None
    notes: tuple[str, ...] = ()
    error: str | None = None


class EvalSummary(ResourceModel):
    eval_id: EvalId
    path: str
    file_hash: str
    description: str
    inference: InferenceId
    agent: AgentId
    dataset: DatasetId
    scorers: tuple[str, ...]
    has_gate: bool
    has_optimization: bool


class DatasetSummary(ResourceModel):
    dataset_id: DatasetId
    flow_id: FlowId | None = None
    path: str
    file_hash: str
    cases: Annotated[int, Field(ge=0)]
    splits: dict[str, int] = {}
    used_by: tuple[EvalId, ...] = ()
