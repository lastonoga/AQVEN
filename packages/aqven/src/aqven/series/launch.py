import math
import statistics
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Literal

from aqven.series.model import (
    COUNTED_OUTCOMES,
    AttemptRecord,
    AttemptState,
    CheckPlan,
    CheckState,
    LaunchPlan,
    MetricShape,
    OutcomeClass,
    Recommendation,
    RecommendationReason,
    SeriesStatus,
    VariantPlanRecord,
)
from aqven.series.ports import SeriesStore
from aqven.series.settings import ProjectCap
from aqven.series.stats.power import MarginRequired, half_width, icc_of, mde, recommended_cases, spread_of
from aqven.series.views import SeriesListQuery
from aqven.spec import (
    CompareQuestion,
    ExperimentId,
    MetricKind,
    NoninferiorQuestion,
    Question,
    SeriesMetric,
    SeriesSplit,
    ThresholdQuestion,
    VariantId,
)

HISTORY_LIMIT: Final = 200
DEFAULT_ICC: Final = 0.3
RATE_PAIR_SPREAD: Final = 0.5
MEAN_CHECK_SPREAD: Final = 0.25
PRIOR_FLOOR: Final = 0.05
PRIOR_CEILING: Final = 0.95
HOLDOUT_REUSED: Final = "holdout_reused"
HISTORY_SERIES_LIMIT: Final = 200
PASS: Final = 1.0
FAIL: Final = 0.0
DECIDED_STATES: Final = frozenset({CheckState.PASSED, CheckState.FAILED})

type SpreadSource = Literal["history", "prior", "none"]
type AttemptValue = Callable[[AttemptRecord], float | None]


@dataclass(frozen=True, slots=True)
class MetricTarget:
    metric: str | None
    shape: MetricShape | None
    value: AttemptValue | None
    kind: str
    margin: float | None
    bound: float | None
    tested: tuple[VariantId, ...]
    baseline: VariantId | None


@dataclass(frozen=True, slots=True)
class Spread:
    value: float | None
    source: SpreadSource
    icc: float


@dataclass(frozen=True, slots=True)
class LaunchInputs:
    experiment_id: ExperimentId | None
    question: Question
    on: SeriesSplit
    cases: int
    repeats: int
    available: int
    planned_cases: int | None
    variants: tuple[VariantPlanRecord, ...]
    checks: tuple[CheckPlan, ...]
    cases_sha256: str
    warnings: tuple[str, ...] = ()

    @property
    def attempts(self) -> int:
        return self.cases * self.repeats * len(self.variants)


@dataclass(frozen=True, slots=True)
class CapDecision:
    needs_approval: bool
    cap_usd: Decimal


def counted(attempt: AttemptRecord) -> bool:
    return attempt.state is AttemptState.FINISHED and attempt.outcome in COUNTED_OUTCOMES


def success_value(attempt: AttemptRecord) -> float | None:
    if not counted(attempt) or attempt.passed is None:
        return None
    return PASS if attempt.passed else FAIL


def schema_value(attempt: AttemptRecord) -> float | None:
    if not counted(attempt) or attempt.schema_valid_first_try is None:
        return None
    return PASS if attempt.schema_valid_first_try else FAIL


def infra_value(attempt: AttemptRecord) -> float | None:
    if attempt.state is not AttemptState.FINISHED or attempt.outcome is OutcomeClass.CANCELLED:
        return None
    return PASS if attempt.outcome is OutcomeClass.INFRA_ERROR else FAIL


def cost_value(attempt: AttemptRecord) -> float | None:
    return float(attempt.cost_usd) if counted(attempt) else None


def latency_value(attempt: AttemptRecord) -> float | None:
    return float(attempt.latency_ms) if counted(attempt) and attempt.latency_ms is not None else None


SERIES_METRICS: Final[Mapping[str, tuple[MetricShape, AttemptValue]]] = {
    SeriesMetric.SUCCESS_RATE.value: (MetricShape.RATE, success_value),
    SeriesMetric.COST_USD.value: (MetricShape.MEAN, cost_value),
    SeriesMetric.COST_OF_PASS.value: (MetricShape.RATIO, cost_value),
    SeriesMetric.LATENCY_P50_MS.value: (MetricShape.QUANTILE, latency_value),
    SeriesMetric.LATENCY_P95_MS.value: (MetricShape.QUANTILE, latency_value),
    SeriesMetric.SCHEMA_VALID_FIRST_TRY.value: (MetricShape.RATE, schema_value),
    SeriesMetric.INFRA_ERROR_RATE.value: (MetricShape.RATE, infra_value),
}
CHECK_SHAPES: Final[Mapping[MetricKind, MetricShape]] = {
    MetricKind.BINARY: MetricShape.RATE,
    MetricKind.CONTINUOUS: MetricShape.MEAN,
    MetricKind.ORDINAL: MetricShape.MEAN,
}
SPREAD_FREE_METRICS: Final = frozenset({SeriesMetric.COST_USD.value})


def check_reader(check_id: str) -> AttemptValue:
    def read(attempt: AttemptRecord) -> float | None:
        found = next((value for value in attempt.checks if value.check_id == check_id), None)
        if found is None or found.value is None or found.state not in DECIDED_STATES:
            return None
        return found.value

    return read


def metric_of(metric: str, checks: Sequence[CheckPlan]) -> tuple[MetricShape | None, AttemptValue | None]:
    builtin = SERIES_METRICS.get(metric)
    if builtin is not None:
        return builtin
    check = next((item for item in checks if item.check_id == metric), None)
    if check is None:
        return None, None
    return CHECK_SHAPES[check.kind], check_reader(metric)


def threshold_target(question: ThresholdQuestion, inputs: LaunchInputs) -> MetricTarget:
    shape, value = metric_of(question.metric, inputs.checks)
    tested = tuple(variant.variant_id for variant in inputs.variants if question.variant in (None, variant.variant_id))
    bound = question.above if question.above is not None else question.below
    return MetricTarget(question.metric, shape, value, question.kind, question.margin, bound, tested, None)


def pair_target(question: CompareQuestion | NoninferiorQuestion, inputs: LaunchInputs) -> MetricTarget:
    shape, value = metric_of(question.primary, inputs.checks)
    tested = (question.candidate,)
    return MetricTarget(question.primary, shape, value, question.kind, question.margin, None, tested, question.baseline)


def look_target(inputs: LaunchInputs) -> MetricTarget:
    return MetricTarget(None, None, None, "look", None, None, (), None)


def target_of(inputs: LaunchInputs) -> MetricTarget:
    question = inputs.question
    if isinstance(question, ThresholdQuestion):
        return threshold_target(question, inputs)
    if isinstance(question, CompareQuestion | NoninferiorQuestion):
        return pair_target(question, inputs)
    return look_target(inputs)


def by_case(attempts: Iterable[AttemptRecord], value: AttemptValue) -> dict[str, list[float]]:
    grouped: dict[str, list[float]] = {}
    for attempt in attempts:
        found = value(attempt)
        if found is not None:
            grouped.setdefault(attempt.case_name, []).append(found)
    return grouped


def case_means(grouped: Mapping[str, Sequence[float]]) -> dict[str, float]:
    return {name: statistics.fmean(values) for name, values in grouped.items() if values}


def prior_spread(target: MetricTarget) -> float | None:
    if target.shape is MetricShape.RATE and target.bound is not None:
        share = min(PRIOR_CEILING, max(PRIOR_FLOOR, target.bound))
        return math.sqrt(share * (1 - share))
    if target.shape is MetricShape.RATE and target.baseline is not None:
        return RATE_PAIR_SPREAD
    if target.shape is MetricShape.MEAN and target.metric not in SPREAD_FREE_METRICS:
        return MEAN_CHECK_SPREAD
    return None


def history_spread(target: MetricTarget, history: Mapping[VariantId, tuple[AttemptRecord, ...]]) -> float | None:
    value = target.value
    if value is None or not target.tested:
        return None
    candidate = case_means(by_case(history.get(target.tested[0], ()), value))
    if target.baseline is None:
        return spread_of(list(candidate.values()))
    baseline = case_means(by_case(history.get(target.baseline, ()), value))
    return spread_of([candidate[name] - baseline[name] for name in candidate if name in baseline])


def history_icc(target: MetricTarget, history: Mapping[VariantId, tuple[AttemptRecord, ...]], repeats: int) -> float:
    value = target.value
    if repeats <= 1 or value is None or not target.tested:
        return DEFAULT_ICC
    found = icc_of(list(by_case(history.get(target.tested[0], ()), value).values()))
    return DEFAULT_ICC if found is None else found


def spread_for(target: MetricTarget, history: Mapping[VariantId, tuple[AttemptRecord, ...]], repeats: int) -> Spread:
    icc = history_icc(target, history, repeats)
    if target.shape in {MetricShape.RATIO, MetricShape.QUANTILE, None} or target.metric in SPREAD_FREE_METRICS:
        return Spread(None, "none", icc)
    observed = history_spread(target, history)
    if observed is not None and observed > 0:
        return Spread(observed, "history", icc)
    prior = prior_spread(target)
    if prior is not None:
        return Spread(prior, "prior", icc)
    return Spread(None, "none", icc)


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def times(count: int) -> str:
    return "once" if count == 1 else f"{count} times"


def fallback_cases(inputs: LaunchInputs) -> int:
    return inputs.planned_cases or inputs.available


def recommendation(inputs: LaunchInputs, target: MetricTarget, spread: Spread) -> Recommendation:
    repeats = inputs.repeats
    if target.kind == "look":
        text = f"a look runs {plural(inputs.cases, 'case')} {times(repeats)} each and gives no verdict"
        return Recommendation(cases=inputs.cases, repeats=repeats, reason=RecommendationReason.LOOK, text=text)
    margin = target.margin or 0.0
    if margin <= 0:
        text = "the question has no margin, so no number of cases can be recommended"
        reason = RecommendationReason.NO_MARGIN
        return Recommendation(cases=fallback_cases(inputs), repeats=repeats, reason=reason, text=text)
    if spread.value is None:
        text = f"no history or prior spread for {target.metric}: run the planned cases and read the interval"
        reason = RecommendationReason.NO_HISTORY
        return Recommendation(cases=fallback_cases(inputs), repeats=repeats, reason=reason, text=text)
    try:
        needed = recommended_cases(spread.value, margin, repeats, spread.icc)
    except MarginRequired:
        reason = RecommendationReason.NO_MARGIN
        return Recommendation(cases=fallback_cases(inputs), repeats=repeats, reason=reason, text="")
    return sized_recommendation(inputs, spread, margin, needed)


def sized_recommendation(inputs: LaunchInputs, spread: Spread, margin: float, needed: int) -> Recommendation:
    width = half_width(spread.value or 0.0, inputs.cases, inputs.repeats, spread.icc)
    if needed > inputs.available:
        text = (
            f"about {needed} cases are needed for a half-width within the {margin} margin, "
            f"but only {inputs.available} are available"
        )
        reason = RecommendationReason.SHORT_OF_CASES
        return Recommendation(cases=needed, repeats=inputs.repeats, reason=reason, text=text)
    if needed > inputs.cases:
        text = (
            f"at {inputs.cases} cases the expected half-width is ±{width:.2f}, wider than the {margin} margin; "
            f"about {needed} cases are needed"
        )
        return Recommendation(cases=needed, repeats=inputs.repeats, reason=RecommendationReason.WIDE, text=text)
    text = f"at {inputs.cases} cases the expected half-width is ±{width:.2f}, within the {margin} margin"
    return Recommendation(cases=needed, repeats=inputs.repeats, reason=RecommendationReason.ENOUGH, text=text)


def cap_decision(request_cap: Decimal | None, project_cap: Decimal) -> CapDecision:
    if request_cap is None:
        return CapDecision(needs_approval=False, cap_usd=project_cap)
    return CapDecision(needs_approval=request_cap > project_cap, cap_usd=request_cap)


@dataclass(frozen=True, slots=True)
class LaunchPlanBuilder:
    store: SeriesStore

    async def build(self, inputs: LaunchInputs, request_cap: Decimal | None, project_cap: ProjectCap) -> LaunchPlan:
        history = await self._history(inputs)
        target = target_of(inputs)
        spread = spread_for(target, history, inputs.repeats)
        chosen = recommendation(inputs, target, spread)
        decision = cap_decision(request_cap, project_cap.usd)
        warnings = (*inputs.warnings, *await self._reused(inputs))
        return LaunchPlan(
            on=inputs.on,
            cases=inputs.cases,
            repeats=inputs.repeats,
            variants=len(inputs.variants),
            attempts=inputs.attempts,
            available=inputs.available,
            half_width=None
            if spread.value is None
            else half_width(spread.value, inputs.cases, inputs.repeats, spread.icc),
            mde=None if spread.value is None else mde(spread.value, inputs.cases, inputs.repeats, spread.icc),
            margin=target.margin,
            spread=spread.value,
            spread_source=spread.source,
            icc=spread.icc,
            recommended=chosen,
            below_recommended=inputs.cases < chosen.cases,
            needs_approval=decision.needs_approval,
            project_cap_usd=project_cap.usd,
            project_cap_source=project_cap.source,
            cap_usd=decision.cap_usd,
            warnings=tuple(dict.fromkeys(warnings)),
        )

    async def _history(self, inputs: LaunchInputs) -> dict[VariantId, tuple[AttemptRecord, ...]]:
        experiment_id = inputs.experiment_id
        if experiment_id is None:
            return {}
        return {
            variant.variant_id: await self.store.history(experiment_id, variant.variant_id, HISTORY_LIMIT)
            for variant in inputs.variants
        }

    async def _reused(self, inputs: LaunchInputs) -> tuple[str, ...]:
        if inputs.on is not SeriesSplit.HOLDOUT or inputs.experiment_id is None:
            return ()
        query = SeriesListQuery(experiment_id=inputs.experiment_id, status=SeriesStatus.DONE)
        earlier = await self.store.search(query, HISTORY_SERIES_LIMIT)
        reused = any(
            record.on is SeriesSplit.HOLDOUT and record.plan.snapshot.cases_sha256 == inputs.cases_sha256
            for record in earlier
        )
        return (HOLDOUT_REUSED,) if reused else ()
