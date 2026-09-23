from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from aqven.spec.common import SpecModel
from aqven.spec.names import (
    NAME_PATTERN,
    AgentId,
    ArmId,
    DatasetId,
    ExperimentId,
    FlowId,
    MetricDirection,
    MetricKind,
    NodeId,
    VariantId,
)
from aqven.spec.policy import EvaluatorRef

MAX_REPEATS = 20

type MetricName = Annotated[str, Field(pattern=NAME_PATTERN)]
type TagName = Annotated[str, Field(pattern=NAME_PATTERN)]


class ExperimentSubject(SpecModel):
    """What the experiment runs: a project flow, an arm of this experiment, or a range of top-level nodes.

    Exactly one of ``flow`` and ``arm`` is set. ``from`` and ``to`` narrow the run to a contiguous range of
    top-level nodes; nodes before the range take their outputs from the case ``node_outputs``.
    """

    flow: FlowId | None = None
    arm: ArmId | None = None
    from_: NodeId | None = Field(default=None, alias="from")
    to: NodeId | None = None

    @model_validator(mode="after")
    def _one_target(self) -> Self:
        if (self.flow is None) == (self.arm is None):
            raise ValueError("a subject sets exactly one of flow (a project flow) or arm (an arm of this experiment)")
        if (self.from_ is None) != (self.to is None):
            raise ValueError("a range sets both from and to")
        return self


class CaseSelection(SpecModel):
    """Which cases the experiment runs: a dataset, optionally filtered by case tags.

    A case is selected when every tag listed here has the same value on the case.
    """

    dataset: DatasetId
    tags: dict[TagName, str] | None = None


class VariantSpec(SpecModel):
    """One variant of the subject: agents assigned to LLM nodes, another arm, or the subject as written.

    ``agents`` maps a node id of the subject (or of ``arm``) to an agent id; nodes not listed keep their own agent.
    A variant never names a bare model: an agent carries the model, its settings and the output mode.
    """

    id: VariantId = Field(pattern=NAME_PATTERN)
    arm: ArmId | None = None
    agents: dict[NodeId, AgentId] | None = None


class CheckMetric(SpecModel):
    """The metric a check produces: ``id`` names it in questions, ``kind`` says how its values read."""

    id: str
    kind: MetricKind


class ExperimentCheck(EvaluatorRef, CheckMetric):
    """A detector scored on every attempt: a built-in, a ``module:function`` or a judge inference with its agent.

    ``validated_by`` names the experiment that measured this judge on planted defects; a judge without it
    produces signals, not evidence.
    """

    validated_by: ExperimentId | None = None

    @model_validator(mode="after")
    def _validated_judge(self) -> Self:
        if self.validated_by is not None and self.inference is None:
            raise ValueError("validated_by applies to a judge check (inference with agent) only")
        return self


class Guardrail(SpecModel):
    """A metric that must not get worse than the baseline by more than ``margin``.

    ``relative`` reads ``margin`` as a share of the baseline value, so 0.2 allows the candidate 20 % worse.
    """

    metric: MetricName
    direction: MetricDirection | None = None
    margin: float = Field(ge=0)
    relative: bool = False


class LookQuestion(SpecModel):
    """Run the cases and show them side by side, with no statistical verdict."""

    kind: Literal["look"]


class ThresholdQuestion(SpecModel):
    """Is ``metric`` below or above a value by more than ``margin``, for one variant or each variant.

    Exactly one of ``below`` and ``above`` is set.
    """

    kind: Literal["threshold"]
    metric: MetricName
    variant: VariantId | None = None
    below: float | None = None
    above: float | None = None
    margin: float = Field(default=0.0, ge=0)

    @model_validator(mode="after")
    def _one_bound(self) -> Self:
        if (self.below is None) == (self.above is None):
            raise ValueError("a threshold sets exactly one of below or above")
        return self


class CompareQuestion(SpecModel):
    """Is ``candidate`` better than ``baseline`` on ``primary`` by more than ``margin``, on the same cases."""

    kind: Literal["compare"]
    baseline: VariantId
    candidate: VariantId
    primary: MetricName
    direction: MetricDirection | None = None
    margin: float = Field(default=0.0, ge=0)
    guardrails: list[Guardrail] | None = None

    @model_validator(mode="after")
    def _two_variants(self) -> Self:
        if self.baseline == self.candidate:
            raise ValueError("baseline and candidate are different variants")
        return self


class NoninferiorQuestion(SpecModel):
    """Is ``candidate`` not worse than ``baseline`` on ``primary`` by more than ``margin``, on the same cases."""

    kind: Literal["noninferior"]
    baseline: VariantId
    candidate: VariantId
    primary: MetricName
    direction: MetricDirection | None = None
    margin: float = Field(gt=0)
    guardrails: list[Guardrail] | None = None

    @model_validator(mode="after")
    def _two_variants(self) -> Self:
        if self.baseline == self.candidate:
            raise ValueError("baseline and candidate are different variants")
        return self


type Question = Annotated[
    LookQuestion | ThresholdQuestion | CompareQuestion | NoninferiorQuestion,
    Field(discriminator="kind"),
]


class ExperimentPlan(SpecModel):
    """The default size of a series: how many cases and how many repeats per case.

    These are the author's defaults, not limits: a series may run fewer or more, and the Studio shows the
    recommended size next to them. ``cases`` unset means every selected case.
    """

    cases: int | None = Field(default=None, ge=1)
    repeats: int = Field(default=1, ge=1, le=MAX_REPEATS)


class ExperimentSpec(SpecModel):
    """An experiment: subject × variants × cases × checks × question.

    The question picks the statistic and the verdict. Evals, agent comparisons, regressions, judge validation
    and risky hypotheses are all experiments that differ only in their question and variants.
    """

    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Experiment"]
    description: str = Field(min_length=1)
    failure_mode: str | None = Field(default=None, pattern=NAME_PATTERN)
    subject: ExperimentSubject
    cases: CaseSelection
    variants: list[VariantSpec] = Field(min_length=1)
    checks: list[ExperimentCheck] | None = None
    question: Question
    plan: ExperimentPlan = Field(default_factory=ExperimentPlan)
