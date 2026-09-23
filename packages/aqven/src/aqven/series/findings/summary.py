import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from datetime import datetime
from decimal import Decimal
from typing import Final, Literal, assert_never

from aqven.loader import file_hash
from aqven.series.model import (
    AttemptRecord,
    AttemptState,
    CheckPlan,
    Contrast,
    Estimate,
    ExperimentOrigin,
    LookOrigin,
    OutcomeClass,
    SeriesAnalysis,
    SeriesRecord,
    SeriesSnapshot,
    SeriesVerdict,
    ThresholdCell,
    VariantAggregates,
    VariantPlanRecord,
)
from aqven.spec import (
    API_VERSION,
    CompareQuestion,
    ExperimentId,
    ExperimentSpec,
    FindingCell,
    FindingEstimate,
    FindingInputs,
    FindingJudge,
    FindingScope,
    FindingSpec,
    FindingVariant,
    LookQuestion,
    MetricDirection,
    NoninferiorQuestion,
    Question,
    SeriesSplit,
    ThresholdQuestion,
)

type FindingQuestion = Literal["threshold", "compare", "noninferior"]

FINDING_KIND: Final = "Finding"
HASH_PREFIX: Final = "sha256-"
DRAFT_HASH: Final = f"{HASH_PREFIX}{'0' * 64}"
DIGITS: Final = 6
FIRST_LOOK: Final = 1
SPEND_QUANTUM: Final = Decimal("0.000001")
SELF_HASH_FIELD: Final = "self_sha256"
BOUND_DIRECTIONS: Final[Mapping[Literal["above", "below"], MetricDirection]] = {
    "above": MetricDirection.HIGHER_IS_BETTER,
    "below": MetricDirection.LOWER_IS_BETTER,
}


class FindingError(RuntimeError):
    def __init__(self, series_id: str, reason: str) -> None:
        super().__init__(f"series {series_id}: {reason}")
        self.series_id = series_id
        self.reason = reason


class FindingUnavailable(FindingError):
    pass


def finding_of(record: SeriesRecord, experiment: ExperimentSpec, attempts: Sequence[AttemptRecord]) -> FindingSpec:
    return finding_at_look(record, experiment, attempts, FIRST_LOOK)


def finding_at_look(
    record: SeriesRecord, experiment: ExperimentSpec, attempts: Sequence[AttemptRecord], looks: int
) -> FindingSpec:
    analysis = _analysis(record)
    verdict = _verdict(record)
    finished = tuple(attempt for attempt in attempts if attempt.state is AttemptState.FINISHED)
    draft = FindingSpec(
        apiVersion=API_VERSION,
        kind=FINDING_KIND,
        experiment=_experiment_id(record),
        series=record.series_id,
        description=experiment.description,
        failure_mode=experiment.failure_mode,
        question=_question(record),
        state=verdict.state,
        reason=verdict.reason,
        statement=verdict.text,
        cells=[*_threshold_cells(analysis), *_contrast_cells(analysis)],
        variants=[_variant(variant, analysis, finished) for variant in record.plan.variants],
        judges=[judge for judge in (_judge(check) for check in record.plan.checks) if judge is not None],
        scope=_scope(record, experiment, finished, looks),
        inputs=_inputs(record),
        spend_usd=spend_of(finished),
        self_sha256=DRAFT_HASH,
    )
    return draft.model_copy(update={SELF_HASH_FIELD: finding_hash(draft)})


def finding_hash(spec: FindingSpec) -> str:
    body = spec.model_dump(mode="json", by_alias=True, exclude={SELF_HASH_FIELD})
    text = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return f"{HASH_PREFIX}{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def case_names_hash(names: Sequence[str]) -> str:
    return file_hash(json.dumps(sorted(set(names)), separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def spend_of(attempts: Sequence[AttemptRecord]) -> Decimal:
    total = sum((attempt.cost_usd + attempt.check_cost_usd for attempt in attempts), Decimal(0))
    return plain_decimal(total)


def plain_decimal(value: Decimal) -> Decimal:
    return Decimal(format(value.quantize(SPEND_QUANTUM).normalize(), "f"))


def rounded(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, DIGITS)


def rounded_value(value: float) -> float:
    return round(value, DIGITS) if math.isfinite(value) else 0.0


def finding_estimate(estimate: Estimate) -> FindingEstimate:
    return FindingEstimate(
        value=rounded(estimate.value),
        low=rounded(estimate.low),
        high=rounded(estimate.high),
        method=None if estimate.method is None else estimate.method.value,
        p_value=rounded(estimate.p_value),
        p_adjusted=rounded(estimate.p_adjusted),
        cases=estimate.cases,
        attempts=estimate.attempts,
    )


def _analysis(record: SeriesRecord) -> SeriesAnalysis:
    if record.analysis is None:
        raise FindingUnavailable(record.series_id, "the series has no analysis")
    return record.analysis


def _verdict(record: SeriesRecord) -> SeriesVerdict:
    verdict = record.verdict
    if verdict is None:
        raise FindingUnavailable(record.series_id, "the series has no verdict")
    return verdict


def _experiment_id(record: SeriesRecord) -> ExperimentId:
    origin = record.origin
    match origin:
        case ExperimentOrigin():
            return origin.experiment_id
        case LookOrigin():
            raise FindingUnavailable(record.series_id, "a look over named cases writes no finding")
        case _:
            assert_never(origin)


def _question(record: SeriesRecord) -> FindingQuestion:
    question: Question | None = record.plan.question
    match question:
        case None | LookQuestion():
            raise FindingUnavailable(record.series_id, "a look question writes no finding")
        case ThresholdQuestion() | CompareQuestion() | NoninferiorQuestion():
            return question.kind
        case _:
            assert_never(question)


def _column_direction(analysis: SeriesAnalysis, metric: str) -> MetricDirection | None:
    return next((column.direction for column in analysis.matrix.columns if column.metric == metric), None)


def _threshold_cell(analysis: SeriesAnalysis, cell: ThresholdCell) -> FindingCell:
    return FindingCell(
        metric=cell.metric,
        role="primary",
        variant=cell.variant_id,
        direction=_column_direction(analysis, cell.metric) or BOUND_DIRECTIONS[cell.bound],
        bound=cell.bound,
        threshold=rounded_value(cell.threshold),
        margin=rounded_value(cell.margin),
        estimate=finding_estimate(cell.estimate),
        verdict=cell.verdict,
    )


def _threshold_cells(analysis: SeriesAnalysis) -> tuple[FindingCell, ...]:
    return tuple(_threshold_cell(analysis, cell) for cell in analysis.thresholds)


def _contrast_cell(contrast: Contrast) -> FindingCell:
    return FindingCell(
        metric=contrast.metric,
        role=contrast.role,
        variant=contrast.candidate,
        baseline=contrast.baseline,
        direction=contrast.direction,
        margin=rounded_value(contrast.margin),
        relative=contrast.relative,
        estimate=finding_estimate(contrast.difference),
        verdict=contrast.verdict,
    )


def _contrast_cells(analysis: SeriesAnalysis) -> tuple[FindingCell, ...]:
    return tuple(_contrast_cell(contrast) for contrast in analysis.contrasts)


def _aggregates(analysis: SeriesAnalysis, variant: VariantPlanRecord) -> VariantAggregates | None:
    return next((item for item in analysis.variants if item.variant_id == variant.variant_id), None)


def _models(variant: VariantPlanRecord, attempts: Sequence[AttemptRecord]) -> list[str]:
    recorded = {
        model for attempt in attempts if attempt.variant_id == variant.variant_id for model in attempt.models.values()
    }
    declared = {assignment.model for assignment in variant.assignments}
    return sorted(recorded or declared)


def _variant(variant: VariantPlanRecord, analysis: SeriesAnalysis, attempts: Sequence[AttemptRecord]) -> FindingVariant:
    aggregates = _aggregates(analysis, variant)
    metrics = {} if aggregates is None else aggregates.metrics
    return FindingVariant(
        id=variant.variant_id,
        arm=variant.arm_id,
        agents={assignment.node_id: assignment.agent_id for assignment in variant.assignments},
        models=_models(variant, attempts),
        flow_hash=variant.flow_hash,
        metrics={name: finding_estimate(estimate) for name, estimate in sorted(metrics.items())},
    )


def _judge(check: CheckPlan) -> FindingJudge | None:
    judge = check.judge
    if judge is None:
        return None
    return FindingJudge(
        check=check.check_id, inference=judge.inference, agent=judge.agent, validated_by=judge.validated_by
    )


def _started_at(record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> datetime:
    return min((attempt.started_at for attempt in attempts), default=record.created_at)


def _finished_at(record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> datetime:
    if record.finished_at is not None:
        return record.finished_at
    moments = (attempt.finished_at for attempt in attempts if attempt.finished_at is not None)
    return max(moments, default=record.created_at)


def _scope(
    record: SeriesRecord, experiment: ExperimentSpec, attempts: Sequence[AttemptRecord], looks: int
) -> FindingScope:
    if record.on is not SeriesSplit.HOLDOUT:
        raise FindingUnavailable(record.series_id, "only a series on holdout cases writes a finding")
    return FindingScope(
        split="holdout",
        dataset=record.dataset_id,
        tags=experiment.cases.tags,
        cases=record.plan.case_count,
        repeats=record.plan.repeats,
        attempts=len(attempts),
        infra_errors=sum(1 for attempt in attempts if attempt.outcome is OutcomeClass.INFRA_ERROR),
        holdout_looks=looks,
        case_names_sha256=case_names_hash([attempt.case_name for attempt in attempts]),
        started_at=_started_at(record, attempts),
        finished_at=_finished_at(record, attempts),
        engine_version=record.plan.snapshot.engine_version,
    )


def _inputs(record: SeriesRecord) -> FindingInputs:
    snapshot: SeriesSnapshot = record.plan.snapshot
    if snapshot.experiment_sha256 is None:
        raise FindingUnavailable(record.series_id, "the series snapshot has no experiment hash")
    return FindingInputs(
        experiment_sha256=snapshot.experiment_sha256,
        dataset_sha256=snapshot.dataset_sha256,
        cases_sha256=snapshot.cases_sha256,
        code_sha256=snapshot.code_sha256,
        judges=dict(sorted(snapshot.judges.items())),
    )
