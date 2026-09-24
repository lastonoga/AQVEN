import asyncio
import math
import statistics
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_CEILING, Decimal
from typing import Final, Literal, Protocol

from aqven.ir import CompiledProject
from aqven.ports.engine import ExecutionQuery, RunListQuery
from aqven.runtime.address import RunId
from aqven.runtime.executions import NodeExecution
from aqven.runtime.runs import Page, RunSummary
from aqven.series.bound import BoundPlan, TokenBound, attempt_bound
from aqven.series.model import (
    COUNTED_OUTCOMES,
    AttemptRecord,
    AttemptState,
    CheckPlan,
    CheckState,
    EstimateReason,
    MetricShape,
    OutcomeClass,
    Recommendation,
    SeriesEstimate,
    SeriesStatus,
    VariantPlanRecord,
)
from aqven.series.ports import ModelPrices, SeriesStore
from aqven.series.protocol import ATTEMPT_SLOTS, CAP_HEADROOM
from aqven.series.stats.power import MarginRequired, half_width, icc_of, mde, recommended_cases, spread_of
from aqven.series.views import SeriesListQuery
from aqven.spec import (
    CompareQuestion,
    ExperimentId,
    FlowId,
    MetricKind,
    NodeKind,
    NoninferiorQuestion,
    Question,
    SeriesMetric,
    SeriesSplit,
    ThresholdQuestion,
    VariantId,
)
from aqven_llm import TokenPrice

HISTORY_LIMIT: Final = 200
PRICE_RUNS: Final = 20
COMPLETED: Final = "completed"
MILLISECONDS: Final = 1000
QUERY: Final = ExecutionQuery()
DEFAULT_ICC: Final = 0.3
RATE_PAIR_SPREAD: Final = 0.5
MEAN_CHECK_SPREAD: Final = 0.25
PRIOR_FLOOR: Final = 0.05
PRIOR_CEILING: Final = 0.95
JUDGE_TOKENS_IN: Final = 2000
JUDGE_TOKENS_OUT: Final = 300
CENT: Final = Decimal("0.01")
MILLISECONDS_PER_MINUTE: Final = 60000
HOLDOUT_REUSED: Final = "holdout_reused"
PRICE_UNKNOWN: Final = "price_unknown:{model}"
HISTORY_SERIES_LIMIT: Final = 200
PASS: Final = 1.0
FAIL: Final = 0.0
DECIDED_STATES: Final = frozenset({CheckState.PASSED, CheckState.FAILED})

type UsdSource = Literal["history", "prices", "bound", "unknown"]
type SpreadSource = Literal["history", "prior", "none"]
type AttemptValue = Callable[[AttemptRecord], float | None]

SOURCE_PRECEDENCE: Final[tuple[UsdSource, ...]] = ("unknown", "bound", "prices", "history")


@dataclass(frozen=True, slots=True)
class NodeSample:
    tokens_in: float
    tokens_out: float
    cost_usd: Decimal


@dataclass(frozen=True, slots=True)
class FlowSample:
    nodes: Mapping[str, NodeSample]
    duration_ms: float | None


class RunSampler(Protocol):
    async def sample(self, flow_id: str) -> FlowSample | None: ...


class RunCatalog(Protocol):
    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]: ...

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]: ...


def node_sample(executions: Sequence[NodeExecution]) -> NodeSample:
    return NodeSample(
        tokens_in=statistics.fmean(item.tokens_in for item in executions),
        tokens_out=statistics.fmean(item.tokens_out for item in executions),
        cost_usd=sum((item.cost_usd for item in executions), Decimal(0)) / len(executions),
    )


def run_duration(run: RunSummary) -> float | None:
    if run.finished_at is None:
        return None
    return (run.finished_at - run.started_at).total_seconds() * MILLISECONDS


def by_node(executions: Sequence[NodeExecution]) -> dict[str, list[NodeExecution]]:
    grouped: dict[str, list[NodeExecution]] = {}
    for execution in executions:
        grouped.setdefault(execution.address.node_id, []).append(execution)
    return grouped


@dataclass(frozen=True, slots=True)
class CatalogRunSampler:
    catalog: RunCatalog
    runs: int = PRICE_RUNS

    async def sample(self, flow_id: str) -> FlowSample | None:
        query = RunListQuery(flow_id=FlowId(flow_id), status=COMPLETED, limit=self.runs)
        page = await self.catalog.list_runs(query)
        if not page.items:
            return None
        executions = [item for run in page.items for item in await self.catalog.list_executions(run.run_id, QUERY)]
        grouped = by_node([item for item in executions if item.kind is NodeKind.LLM])
        durations = [found for run in page.items if (found := run_duration(run)) is not None]
        nodes = {node_id: node_sample(executions) for node_id, executions in grouped.items()}
        return FlowSample(nodes=nodes, duration_ms=statistics.median(durations) if durations else None)


@dataclass(frozen=True, slots=True)
class PricedAttempt:
    usd: Decimal | None
    source: UsdSource
    unknown_models: tuple[str, ...] = ()


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
class EstimatePlan:
    experiment_id: ExperimentId | None
    question: Question
    on: SeriesSplit
    cases: int
    repeats: int
    available: int
    planned_cases: int | None
    variants: tuple[VariantPlanRecord, ...]
    checks: tuple[CheckPlan, ...]
    base: CompiledProject
    cases_sha256: str
    warnings: tuple[str, ...] = ()
    bound: BoundPlan | None = None

    @property
    def attempts(self) -> int:
        return self.cases * self.repeats * len(self.variants)


@dataclass(frozen=True, slots=True)
class CapDecision:
    needs_approval: bool
    cap_usd: Decimal


@dataclass(frozen=True, slots=True)
class EstimateOutcome:
    estimate: SeriesEstimate
    per_attempt_usd: Decimal | None


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


def threshold_target(question: ThresholdQuestion, plan: EstimatePlan) -> MetricTarget:
    shape, value = metric_of(question.metric, plan.checks)
    tested = tuple(variant.variant_id for variant in plan.variants if question.variant in (None, variant.variant_id))
    bound = question.above if question.above is not None else question.below
    return MetricTarget(question.metric, shape, value, question.kind, question.margin, bound, tested, None)


def pair_target(question: CompareQuestion | NoninferiorQuestion, plan: EstimatePlan) -> MetricTarget:
    shape, value = metric_of(question.primary, plan.checks)
    tested = (question.candidate,)
    return MetricTarget(question.primary, shape, value, question.kind, question.margin, None, tested, question.baseline)


def look_target(plan: EstimatePlan) -> MetricTarget:
    return MetricTarget(None, None, None, "look", None, None, (), None)


def target_of(plan: EstimatePlan) -> MetricTarget:
    question = plan.question
    if isinstance(question, ThresholdQuestion):
        return threshold_target(question, plan)
    if isinstance(question, CompareQuestion | NoninferiorQuestion):
        return pair_target(question, plan)
    return look_target(plan)


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


def fallback_cases(plan: EstimatePlan) -> int:
    return plan.planned_cases or plan.available


def recommendation(plan: EstimatePlan, target: MetricTarget, spread: Spread) -> Recommendation:
    repeats = plan.repeats
    if target.kind == "look":
        text = f"a look runs {plural(plan.cases, 'case')} {times(repeats)} each and gives no verdict"
        return Recommendation(cases=plan.cases, repeats=repeats, reason=EstimateReason.LOOK, text=text)
    margin = target.margin or 0.0
    if margin <= 0:
        text = "the question has no margin, so no number of cases can be recommended"
        return Recommendation(cases=fallback_cases(plan), repeats=repeats, reason=EstimateReason.NO_MARGIN, text=text)
    if spread.value is None:
        text = f"no history or prior spread for {target.metric}: run the planned cases and read the interval"
        return Recommendation(cases=fallback_cases(plan), repeats=repeats, reason=EstimateReason.NO_HISTORY, text=text)
    try:
        needed = recommended_cases(spread.value, margin, repeats, spread.icc)
    except MarginRequired:
        return Recommendation(cases=fallback_cases(plan), repeats=repeats, reason=EstimateReason.NO_MARGIN, text="")
    return sized_recommendation(plan, spread, margin, needed)


def sized_recommendation(plan: EstimatePlan, spread: Spread, margin: float, needed: int) -> Recommendation:
    width = half_width(spread.value or 0.0, plan.cases, plan.repeats, spread.icc)
    if needed > plan.available:
        text = (
            f"about {needed} cases are needed for a half-width within the {margin} margin, "
            f"but only {plan.available} are available"
        )
        return Recommendation(cases=needed, repeats=plan.repeats, reason=EstimateReason.SHORT_OF_CASES, text=text)
    if needed > plan.cases:
        text = (
            f"at {plan.cases} cases the expected half-width is ±{width:.2f}, wider than the {margin} margin; "
            f"about {needed} cases are needed"
        )
        return Recommendation(cases=needed, repeats=plan.repeats, reason=EstimateReason.WIDE, text=text)
    text = f"at {plan.cases} cases the expected half-width is ±{width:.2f}, within the {margin} margin"
    return Recommendation(cases=needed, repeats=plan.repeats, reason=EstimateReason.ENOUGH, text=text)


def ceil_cents(amount: Decimal) -> Decimal:
    return max(CENT, (amount / CENT).to_integral_value(rounding=ROUND_CEILING) * CENT)


def cap_decision(usd: Decimal | None, request_cap: Decimal | None, project_cap: Decimal) -> CapDecision:
    if request_cap is not None:
        needs = usd is None or usd > project_cap or request_cap > project_cap
        return CapDecision(needs_approval=needs, cap_usd=request_cap)
    if usd is None:
        return CapDecision(needs_approval=True, cap_usd=project_cap)
    padded = ceil_cents(usd * CAP_HEADROOM)
    if usd <= project_cap:
        return CapDecision(needs_approval=False, cap_usd=min(padded, project_cap))
    return CapDecision(needs_approval=True, cap_usd=padded)


def minutes_for(attempts: int, latency_ms: float | None, workers: int | None) -> int | None:
    if latency_ms is None:
        return None
    lanes = min(ATTEMPT_SLOTS, workers or ATTEMPT_SLOTS)
    return max(1, math.ceil(attempts * latency_ms / lanes / MILLISECONDS_PER_MINUTE))


def history_latency(history: Mapping[VariantId, tuple[AttemptRecord, ...]]) -> float | None:
    values = [
        attempt.latency_ms
        for attempts in history.values()
        for attempt in attempts
        if attempt.latency_ms and counted(attempt)
    ]
    return float(statistics.median(values)) if values else None


def mean_decimal(values: Sequence[Decimal]) -> Decimal | None:
    if not values:
        return None
    return sum(values, Decimal(0)) / len(values)


@dataclass(frozen=True, slots=True)
class VariantFacts:
    variant: VariantPlanRecord
    history: Sequence[AttemptRecord] = ()
    sample: FlowSample | None = None
    bound: tuple[TokenBound, ...] | None = None


def priced_attempt(attempt: AttemptRecord) -> bool:
    return counted(attempt) and attempt.unpriced_calls == 0


def recorded_usd(history: Sequence[AttemptRecord]) -> Decimal | None:
    return mean_decimal([attempt.cost_usd + attempt.check_cost_usd for attempt in history if priced_attempt(attempt)])


def sampled_nodes(variant: VariantPlanRecord, sample: FlowSample | None) -> tuple[tuple[str, NodeSample], ...]:
    if sample is None:
        return ()
    return tuple(
        (item.model, sample.nodes[item.node_id]) for item in variant.assignments if item.node_id in sample.nodes
    )


def priced_models(facts: VariantFacts, judges: Sequence[str]) -> tuple[str, ...]:
    if recorded_usd(facts.history) is not None:
        return ()
    if sampled_nodes(facts.variant, facts.sample):
        return (*(item.model for item in facts.variant.assignments), *judges)
    return tuple(bound.model for bound in facts.bound or ())


UNKNOWN_PRICE: Final = PricedAttempt(usd=None, source="unknown")


@dataclass(frozen=True, slots=True)
class VariantPricer:
    table: Mapping[str, TokenPrice]
    judges: tuple[str, ...]

    def price(self, facts: VariantFacts) -> PricedAttempt:
        rules = (self.recorded, self.sampled, self.bounded)
        found = (rule(facts) for rule in rules)
        return next((priced for priced in found if priced is not None), UNKNOWN_PRICE)

    def recorded(self, facts: VariantFacts) -> PricedAttempt | None:
        usd = recorded_usd(facts.history)
        return None if usd is None else PricedAttempt(usd=usd, source="history")

    def sampled(self, facts: VariantFacts) -> PricedAttempt | None:
        nodes = sampled_nodes(facts.variant, facts.sample)
        if not nodes:
            return None
        priced = [(model, self._cost(model, node.tokens_in, node.tokens_out), node.cost_usd) for model, node in nodes]
        unknown = tuple(model for model, price, _ in priced if price is None)
        subject = sum((price if price is not None else recorded for _, price, recorded in priced), Decimal(0))
        return PricedAttempt(usd=subject + self._typical_judges(), source="prices", unknown_models=unknown)

    def bounded(self, facts: VariantFacts) -> PricedAttempt | None:
        if facts.bound is None:
            return None
        unknown = tuple(dict.fromkeys(bound.model for bound in facts.bound if bound.model not in self.table))
        if unknown:
            return PricedAttempt(usd=None, source="unknown", unknown_models=unknown)
        costs = (self.table[bound.model].cost(bound.tokens_in, bound.tokens_out) * bound.calls for bound in facts.bound)
        return PricedAttempt(usd=sum(costs, Decimal(0)), source="bound")

    def _cost(self, model: str, tokens_in: float, tokens_out: float) -> Decimal | None:
        price = self.table.get(model)
        return None if price is None else price.cost(round(tokens_in), round(tokens_out))

    def _typical_judges(self) -> Decimal:
        costs = (self._cost(model, JUDGE_TOKENS_IN, JUDGE_TOKENS_OUT) for model in self.judges)
        return sum((cost for cost in costs if cost is not None), Decimal(0))


@dataclass(slots=True)
class CachedSampler:
    sampler: RunSampler | None
    samples: dict[str, FlowSample | None] = field(default_factory=dict[str, FlowSample | None])

    async def sample(self, flow_id: str) -> FlowSample | None:
        if self.sampler is None:
            return None
        if flow_id not in self.samples:
            self.samples[flow_id] = await self.sampler.sample(flow_id)
        return self.samples[flow_id]


def judge_models(plan: EstimatePlan) -> tuple[str, ...]:
    return tuple(plan.base.agent(check.judge.agent).primary.model for check in plan.checks if check.judge is not None)


async def bound_of(plan: BoundPlan | None, variant: VariantPlanRecord) -> tuple[TokenBound, ...] | None:
    if plan is None:
        return None
    return await asyncio.to_thread(attempt_bound, plan, variant)


def usd_source(priced: Sequence[PricedAttempt]) -> UsdSource:
    sources: set[UsdSource] = {"unknown" if item.usd is None else item.source for item in priced}
    if not sources:
        return "unknown"
    return min(sources, key=SOURCE_PRECEDENCE.index)


def total_usd(priced: Sequence[PricedAttempt], plan: EstimatePlan) -> Decimal | None:
    if any(item.usd is None for item in priced):
        return None
    per_variant = sum((item.usd or Decimal(0) for item in priced), Decimal(0))
    return per_variant * plan.cases * plan.repeats


def per_attempt(priced: Sequence[PricedAttempt]) -> Decimal | None:
    known = [item.usd for item in priced if item.usd is not None]
    if len(known) != len(priced) or not known:
        return None
    return max(known)


def unknown_warnings(priced: Sequence[PricedAttempt]) -> tuple[str, ...]:
    models = sorted({model for item in priced for model in item.unknown_models})
    return tuple(PRICE_UNKNOWN.format(model=model) for model in models)


@dataclass(frozen=True, slots=True)
class SeriesEstimator:
    store: SeriesStore
    prices: ModelPrices
    sampler: RunSampler | None = None

    async def estimate(
        self, plan: EstimatePlan, request_cap: Decimal | None, project_cap: Decimal, workers: int | None
    ) -> EstimateOutcome:
        history = await self._history(plan)
        samples = CachedSampler(self.sampler)
        facts = [await self._facts(plan, variant, history, samples) for variant in plan.variants]
        pricer = await self._pricer(plan, facts)
        priced = [pricer.price(item) for item in facts]
        usd = total_usd(priced, plan)
        target = target_of(plan)
        spread = spread_for(target, history, plan.repeats)
        chosen = recommendation(plan, target, spread)
        decision = cap_decision(usd, request_cap, project_cap)
        latency = history_latency(history) or await self._duration(samples, plan)
        warnings = (*plan.warnings, *await self._reused(plan), *unknown_warnings(priced))
        estimate = SeriesEstimate(
            on=plan.on,
            cases=plan.cases,
            repeats=plan.repeats,
            variants=len(plan.variants),
            attempts=plan.attempts,
            available=plan.available,
            usd=usd,
            usd_source=usd_source(priced),
            minutes=minutes_for(plan.attempts, latency, workers),
            half_width=None if spread.value is None else half_width(spread.value, plan.cases, plan.repeats, spread.icc),
            mde=None if spread.value is None else mde(spread.value, plan.cases, plan.repeats, spread.icc),
            margin=target.margin,
            spread=spread.value,
            spread_source=spread.source,
            icc=spread.icc,
            recommended=chosen,
            below_recommended=plan.cases < chosen.cases,
            needs_approval=decision.needs_approval,
            project_cap_usd=project_cap,
            cap_usd=decision.cap_usd,
            warnings=tuple(dict.fromkeys(warnings)),
        )
        return EstimateOutcome(estimate=estimate, per_attempt_usd=per_attempt(priced))

    async def _history(self, plan: EstimatePlan) -> dict[VariantId, tuple[AttemptRecord, ...]]:
        experiment_id = plan.experiment_id
        if experiment_id is None:
            return {}
        return {
            variant.variant_id: await self.store.history(experiment_id, variant.variant_id, HISTORY_LIMIT)
            for variant in plan.variants
        }

    async def _facts(
        self,
        plan: EstimatePlan,
        variant: VariantPlanRecord,
        history: Mapping[VariantId, tuple[AttemptRecord, ...]],
        samples: CachedSampler,
    ) -> VariantFacts:
        recorded = history.get(variant.variant_id, ())
        if recorded_usd(recorded) is not None:
            return VariantFacts(variant=variant, history=recorded)
        sample = await samples.sample(variant.flow_id)
        if sampled_nodes(variant, sample):
            return VariantFacts(variant=variant, history=recorded, sample=sample)
        return VariantFacts(variant=variant, history=recorded, sample=sample, bound=await bound_of(plan.bound, variant))

    async def _pricer(self, plan: EstimatePlan, facts: Sequence[VariantFacts]) -> VariantPricer:
        judges = judge_models(plan)
        models = tuple(dict.fromkeys(model for item in facts for model in priced_models(item, judges)))
        table: Mapping[str, TokenPrice] = await self.prices.prices(models) if models else {}
        return VariantPricer(table=table, judges=judges)

    async def _duration(self, samples: CachedSampler, plan: EstimatePlan) -> float | None:
        found = [await samples.sample(variant.flow_id) for variant in plan.variants]
        durations = [sample.duration_ms for sample in found if sample is not None and sample.duration_ms is not None]
        return statistics.median(durations) if durations else None

    async def _reused(self, plan: EstimatePlan) -> tuple[str, ...]:
        if plan.on is not SeriesSplit.HOLDOUT or plan.experiment_id is None:
            return ()
        query = SeriesListQuery(experiment_id=plan.experiment_id, status=SeriesStatus.DONE)
        earlier = await self.store.search(query, HISTORY_SERIES_LIMIT)
        reused = any(
            record.on is SeriesSplit.HOLDOUT and record.plan.snapshot.cases_sha256 == plan.cases_sha256
            for record in earlier
        )
        return (HOLDOUT_REUSED,) if reused else ()
