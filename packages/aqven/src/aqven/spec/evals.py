from typing import Literal

from pydantic import Field, JsonValue

from aqven.spec.common import Limits, SpecModel
from aqven.spec.names import AgentId, DatasetId, FlowId, GateAction, InferenceId, MetricKind, NodeId
from aqven.spec.policy import EvaluatorRef


class DatasetCase(SpecModel):
    name: str = Field(min_length=1)
    inputs: JsonValue
    context: dict[str, JsonValue] | None = None
    node_outputs: dict[NodeId, JsonValue] | None = None
    metadata: dict[str, JsonValue] | None = None
    tags: dict[str, str] | None = None
    expected_output: JsonValue = None


class DatasetFile(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Dataset"]
    flow: FlowId | None = None
    cases: list[DatasetCase] = Field(min_length=1)


class ScorerHead(SpecModel):
    id: str
    kind: MetricKind


class ScorerSpec(EvaluatorRef, ScorerHead):
    pass


class GateFamilies(SpecModel):
    primary: list[str] = Field(min_length=1)
    secondary: list[str] | None = None
    safety: list[str] | None = None


class BootstrapSpec(SpecModel):
    method: Literal["BCa"]
    resamples: int = Field(ge=1)
    seed: int = Field(ge=0)


class JudgeAdmission(SpecModel):
    min_weighted_kappa: float = Field(ge=-1, le=1)
    min_krippendorff_alpha: float = Field(ge=-1, le=1)
    calibration_dataset: DatasetId


class GateActions(SpecModel):
    pass_: GateAction = Field(alias="pass")
    warn: GateAction
    block: GateAction
    gate_unavailable: GateAction


class GateSpec(SpecModel):
    baseline: str = Field(min_length=1)
    repeats: int = Field(ge=1)
    min_dataset: int = Field(ge=1)
    min_discordant: int = Field(ge=0)
    families: GateFamilies
    alpha_primary: float = Field(gt=0, lt=1)
    q_secondary: float = Field(gt=0, lt=1)
    alpha_safety: float = Field(gt=0, lt=1)
    ni_margin: float = Field(ge=0)
    bootstrap: BootstrapSpec
    max_dropped_ratio: float = Field(ge=0, le=1)
    judge_admission: JudgeAdmission | None = None
    actions: GateActions


class OptimizationSpec(SpecModel):
    engine: Literal["gepa"]
    objective: str
    train_split: str
    dev_split: str
    reflection_agent: AgentId
    max_metric_calls: int = Field(ge=1)
    max_repairs: int = Field(ge=0, le=3)
    stop_score: float
    limits: Limits | None = None


class EvalSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Eval"]
    description: str = Field(min_length=1)
    inference: InferenceId
    agent: AgentId
    dataset: DatasetId
    scorers: list[ScorerSpec] = Field(min_length=1)
    gate: GateSpec | None = None
    optimization: OptimizationSpec | None = None
