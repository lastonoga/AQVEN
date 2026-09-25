from decimal import Decimal
from typing import Final, Literal, Self

from pydantic import AwareDatetime, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from aqven.spec.common import SpecModel
from aqven.spec.names import (
    AgentId,
    CellVerdict,
    DatasetId,
    ExperimentId,
    FactorKind,
    InferenceId,
    MetricDirection,
    NodeId,
    VariantId,
    VerdictReason,
    VerdictState,
)

UUID_PATTERN: Final = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
SHA256_PATTERN: Final = r"^sha256-[0-9a-f]{64}$"


class FindingEstimate(SpecModel):
    """A point estimate with its 95 % interval, as the series computed it on the holdout cases.

    ``method`` names the interval (``wilson``, ``paired_t`` and so on); ``p_adjusted`` is the Benjamini–Hochberg
    value over the primary cells of the series. ``cases`` and ``attempts`` count the data behind the estimate.
    """

    value: float | None
    low: float | None
    high: float | None
    method: str | None
    p_value: float | None = None
    p_adjusted: float | None = None
    cases: int = Field(ge=0)
    attempts: int = Field(ge=0)


class FindingCell(SpecModel):
    """One decided cell of the question: a metric of a variant against a bound or against the baseline.

    A threshold cell sets ``bound`` and ``threshold``; a pair cell sets ``baseline`` and reads ``estimate`` as the
    difference candidate minus baseline, signed so that a positive value is better. ``margin`` is the tolerance
    declared in the experiment before the data, as a share of the baseline value when ``relative`` is true.
    """

    metric: str
    role: Literal["primary", "guardrail"]
    variant: VariantId
    baseline: VariantId | None = None
    direction: MetricDirection
    bound: Literal["above", "below"] | None = None
    threshold: float | None = None
    margin: float
    relative: bool = False
    estimate: FindingEstimate
    verdict: CellVerdict


class FindingChange(SpecModel):
    """One value of the experiment factor the variant set: ``what`` kind of edit on node ``node_id``.

    ``value`` reads by ``what``: an agent id (``agent``), a prompt name of the experiment ``prompts/`` folder
    (``prompt``), an alternative id of its ``nodes/`` folder (``use``) or a flow id (``flow``).
    """

    node_id: NodeId
    what: FactorKind
    value: str


class FindingVariant(SpecModel):
    """A variant as it ran: the factor values it set, the agents on its nodes, the models and the hash of its flow.

    ``changes`` lists the factor values of the variant, empty for the subject as written. ``agents`` names the agent
    that answered on every llm node, changed or not. ``models`` lists the models recorded on the attempts, which may
    differ from the declared ones when a model profile routes the call. ``metrics`` holds the variant's own estimate
    of every metric of the series. ``arm`` is read only in findings written before ADR-0056, which have no
    ``changes``; a new finding never writes it.
    """

    id: VariantId
    arm: SkipJsonSchema[str | None] = None
    changes: list[FindingChange] | None = None
    agents: dict[NodeId, AgentId]
    models: list[str]
    flow_hash: str
    metrics: dict[str, FindingEstimate]

    @model_validator(mode="after")
    def _one_form(self) -> Self:
        if self.arm is not None and self.changes is not None:
            raise ValueError("arm belongs to findings written before ADR-0056, which have no changes")
        return self


class FindingJudge(SpecModel):
    """A judge check behind the finding: its inference, its agent and the experiment that validated it.

    A judge without ``validated_by`` produces a signal, not a finding.
    """

    check: str
    inference: InferenceId
    agent: AgentId
    validated_by: ExperimentId | None = None


class FindingScope(SpecModel):
    """What the finding covers: the holdout cases of one dataset, their count, the repeats and the time span.

    ``holdout_looks`` counts the finished holdout series of this experiment on the same cases, this one included;
    ``case_names_sha256`` identifies the exact set of cases.
    """

    split: Literal["holdout"]
    dataset: DatasetId
    tags: dict[str, str] | None = None
    cases: int = Field(ge=1)
    repeats: int = Field(ge=1)
    attempts: int = Field(ge=1)
    infra_errors: int = Field(ge=0)
    holdout_looks: int = Field(ge=1)
    case_names_sha256: str
    started_at: AwareDatetime
    finished_at: AwareDatetime
    engine_version: str


class FindingInputs(SpecModel):
    """Hashes of everything the series ran on: the experiment file, the dataset, the cases, the code and the judges.

    A later series with different hashes measured something else, so the finding does not speak for it.
    """

    experiment_sha256: str
    dataset_sha256: str
    cases_sha256: str
    code_sha256: str
    judges: dict[str, str] = Field(default_factory=dict[str, str])


class FindingSpec(SpecModel):
    """A finding: the verdict of one series of an experiment on holdout cases, written once and never edited.

    The server writes it to ``experiments/<experiment>/findings/<series>.yaml`` when the series finishes and
    regenerates ``FINDINGS.md`` from all findings. ``statement`` is the sentence to quote; ``self_sha256`` is the
    hash of the rest of the document, so ``aqven check`` notices a hand edit.
    """

    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Finding"]
    experiment: ExperimentId
    series: str = Field(pattern=UUID_PATTERN)
    description: str
    failure_mode: str | None = None
    question: Literal["threshold", "compare", "noninferior"]
    state: VerdictState
    reason: VerdictReason | None = None
    statement: str
    cells: list[FindingCell] = Field(min_length=1)
    variants: list[FindingVariant] = Field(min_length=1)
    judges: list[FindingJudge] = Field(default_factory=list[FindingJudge])
    scope: FindingScope
    inputs: FindingInputs
    spend_usd: Decimal
    self_sha256: str = Field(pattern=SHA256_PATTERN)
