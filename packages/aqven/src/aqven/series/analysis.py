from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Literal, Protocol, assert_never

from aqven.series.ids import stat_seed
from aqven.series.model import (
    AnalysisInput,
    AttemptRecord,
    CheckPlan,
    Contrast,
    DegenerateReason,
    Estimate,
    MatrixRow,
    MetricCell,
    MetricColumn,
    MetricRole,
    SeriesAnalysis,
    SeriesId,
    SeriesMatrix,
    SeriesStatus,
    SeriesVerdict,
    StopCause,
    ThresholdCell,
    VariantAggregates,
    VariantPlanRecord,
)
from aqven.series.protocol import INFRA_ERROR_LIMIT
from aqven.series.stats.metrics import (
    BUILTIN_METRICS,
    CaseAttempts,
    MetricDefinition,
    MetricRegistry,
    counted,
    finished,
    infra_error,
    settled,
)
from aqven.series.stats.multiplicity import adjust, discovered, two_sided
from aqven.series.stats.power import icc_of
from aqven.series.stats.repeats import pass_hat_k, stability_of
from aqven.series.stats.samples import Bound, RateSamples, Samples, StatConfig, expect
from aqven.series.stats.strategies import paired, single
from aqven.series.stats.verdicts import guardrail_verdict, pair_edge, pair_verdict, threshold_verdict
from aqven.series.stats.wording import (
    budget_cut_text,
    cancelled_text,
    dev_signal,
    infra_errors_text,
    inputs_changed_text,
    no_data_text,
    pair_measurement,
    sentence,
    threshold_measurement,
    unvalidated_signal,
)
from aqven.spec import (
    CellVerdict,
    CompareQuestion,
    Guardrail,
    LookQuestion,
    MetricDirection,
    NoninferiorQuestion,
    Question,
    SeriesMetric,
    SeriesSplit,
    ThresholdQuestion,
    VariantId,
    VerdictReason,
    VerdictState,
)

type QuestionKind = Literal["look", "threshold", "compare", "noninferior"]
type Singles = Mapping[tuple[VariantId, str], Estimate]

INPUTS_CHANGED_WHAT: Final = "the working tree no longer matches the snapshot taken at the start"
MULTIPLE_REPEATS: Final = 2
GUARD_REASONS: Final[Mapping[DegenerateReason, VerdictReason]] = {
    DegenerateReason.UNINFORMATIVE: VerdictReason.UNINFORMATIVE,
    DegenerateReason.NO_DISCORDANCE: VerdictReason.NO_DISCORDANCE,
}


@dataclass(frozen=True, slots=True)
class CaseBook:
    case_names: tuple[str, ...]
    by_variant: Mapping[VariantId, tuple[CaseAttempts, ...]]

    @classmethod
    def of(cls, source: AnalysisInput) -> CaseBook:
        grouped: defaultdict[tuple[VariantId, str], list[AttemptRecord]] = defaultdict(list)
        for attempt in source.attempts:
            grouped[(attempt.variant_id, attempt.case_name)].append(attempt)
        extra = dict.fromkeys(
            attempt.case_name for attempt in source.attempts if attempt.case_name not in source.case_names
        )
        names = (*source.case_names, *extra)
        return cls(
            case_names=names,
            by_variant={
                variant.variant_id: tuple(tuple(grouped[(variant.variant_id, name)]) for name in names)
                for variant in source.variants
            },
        )

    def cases(self, variant_id: VariantId) -> tuple[CaseAttempts, ...]:
        return self.by_variant.get(variant_id, ())

    def attempts(self, variant_id: VariantId) -> tuple[AttemptRecord, ...]:
        return tuple(attempt for case in self.cases(variant_id) for attempt in case)


@dataclass(frozen=True, slots=True)
class Estimator:
    series_id: SeriesId
    book: CaseBook

    def selected(self, metric: MetricDefinition, variant_id: VariantId) -> tuple[CaseAttempts, ...]:
        return tuple(metric.select(case) for case in self.book.cases(variant_id))

    def samples(self, metric: MetricDefinition, variant_id: VariantId) -> Samples:
        return metric.samples([case for case in self.selected(metric, variant_id) if case])

    def single(self, metric: MetricDefinition, variant_id: VariantId, bound: Bound | None) -> Estimate:
        cases = [case for case in self.selected(metric, variant_id) if case]
        config = StatConfig(seed=stat_seed(self.series_id, metric.name, variant_id))
        return counted_attempts(single(metric.samples(cases), bound, config), cases)

    def pair(
        self, metric: MetricDefinition, baseline: VariantId, candidate: VariantId, direction: MetricDirection
    ) -> Estimate:
        both = [
            (before, after)
            for before, after in zip(self.selected(metric, baseline), self.selected(metric, candidate), strict=False)
            if before and after
        ]
        befores = [before for before, _ in both]
        afters = [after for _, after in both]
        config = StatConfig(seed=stat_seed(self.series_id, metric.name, baseline, candidate))
        estimate = paired(metric.samples(befores), metric.samples(afters), direction, config)
        return counted_attempts(estimate, [*befores, *afters])


def counted_attempts(estimate: Estimate, cases: Sequence[CaseAttempts]) -> Estimate:
    return estimate.model_copy(update={"attempts": sum(len(case) for case in cases)})


@dataclass(frozen=True, slots=True)
class PrimaryCell:
    estimate: Estimate
    verdict: CellVerdict
    margin: float
    edge: float


class Design(Protocol):
    @property
    def kind(self) -> QuestionKind: ...

    @property
    def primary(self) -> str | None: ...

    @property
    def primary_direction(self) -> MetricDirection | None: ...

    @property
    def margin(self) -> float | None: ...

    @property
    def guardrails(self) -> tuple[Guardrail, ...]: ...

    def thresholds(self, estimator: Estimator, registry: MetricRegistry) -> tuple[ThresholdCell, ...]: ...

    def contrasts(self, estimator: Estimator, registry: MetricRegistry, singles: Singles) -> tuple[Contrast, ...]: ...

    def cell_verdict(
        self, variant_id: VariantId, metric: str, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> CellVerdict: ...

    def primaries(
        self, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> tuple[PrimaryCell, ...]: ...

    def measurement(
        self, registry: MetricRegistry, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> str: ...


@dataclass(frozen=True, slots=True)
class LookDesign:
    kind: QuestionKind = "look"
    primary: str | None = None
    primary_direction: MetricDirection | None = None
    margin: float | None = None
    guardrails: tuple[Guardrail, ...] = ()

    def thresholds(self, estimator: Estimator, registry: MetricRegistry) -> tuple[ThresholdCell, ...]:
        return ()

    def contrasts(self, estimator: Estimator, registry: MetricRegistry, singles: Singles) -> tuple[Contrast, ...]:
        return ()

    def cell_verdict(
        self, variant_id: VariantId, metric: str, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> CellVerdict:
        return CellVerdict.NONE

    def primaries(self, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]) -> tuple[PrimaryCell, ...]:
        return ()

    def measurement(
        self, registry: MetricRegistry, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> str:
        return ""


class QuestionWithoutBound(ValueError):
    def __init__(self, metric: str) -> None:
        super().__init__(f"the threshold question on {metric} sets neither above nor below")


def bound_of(question: ThresholdQuestion) -> Bound:
    if question.above is not None:
        return Bound(side="above", value=question.above, margin=question.margin)
    if question.below is not None:
        return Bound(side="below", value=question.below, margin=question.margin)
    raise QuestionWithoutBound(question.metric)


def gated(verdict: CellVerdict, p_adjusted: float | None) -> CellVerdict:
    if verdict is CellVerdict.PASS and not discovered(p_adjusted):
        return CellVerdict.UNCLEAR
    return verdict


@dataclass(frozen=True, slots=True)
class ThresholdDesign:
    question: ThresholdQuestion
    tested: tuple[VariantId, ...]
    kind: QuestionKind = "threshold"
    primary_direction: MetricDirection | None = None
    guardrails: tuple[Guardrail, ...] = ()

    @property
    def primary(self) -> str | None:
        return self.question.metric

    @property
    def margin(self) -> float | None:
        return self.question.margin

    def thresholds(self, estimator: Estimator, registry: MetricRegistry) -> tuple[ThresholdCell, ...]:
        bound = bound_of(self.question)
        metric = registry.get(self.question.metric)
        estimates = [estimator.single(metric, variant_id, bound) for variant_id in self.tested]
        adjusted = adjust([two_sided(estimate.p_value) for estimate in estimates])
        return tuple(
            ThresholdCell(
                metric=metric.name,
                variant_id=variant_id,
                bound=bound.side,
                threshold=bound.value,
                margin=bound.margin,
                estimate=estimate.model_copy(update={"p_adjusted": p_adjusted}),
                verdict=gated(threshold_verdict(estimate, bound), p_adjusted),
            )
            for variant_id, estimate, p_adjusted in zip(self.tested, estimates, adjusted, strict=True)
        )

    def contrasts(self, estimator: Estimator, registry: MetricRegistry, singles: Singles) -> tuple[Contrast, ...]:
        return ()

    def cell_verdict(
        self, variant_id: VariantId, metric: str, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> CellVerdict:
        found = (cell.verdict for cell in thresholds if cell.variant_id == variant_id and cell.metric == metric)
        return next(found, CellVerdict.NONE)

    def primaries(self, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]) -> tuple[PrimaryCell, ...]:
        edge = bound_of(self.question).edge
        return tuple(PrimaryCell(cell.estimate, cell.verdict, cell.margin, edge) for cell in thresholds)

    def measurement(
        self, registry: MetricRegistry, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> str:
        return threshold_measurement(thresholds, registry.get(self.question.metric).unit)


def relative_margin(guardrail: Guardrail, baseline_value: float | None) -> float | None:
    if not guardrail.relative:
        return guardrail.margin
    if baseline_value is None or baseline_value == 0:
        return None
    return guardrail.margin * abs(baseline_value)


@dataclass(frozen=True, slots=True)
class PairDesign:
    question: CompareQuestion | NoninferiorQuestion

    @property
    def kind(self) -> QuestionKind:
        return self.question.kind

    @property
    def primary(self) -> str | None:
        return self.question.primary

    @property
    def primary_direction(self) -> MetricDirection | None:
        return self.question.direction

    @property
    def margin(self) -> float | None:
        return self.question.margin

    @property
    def guardrails(self) -> tuple[Guardrail, ...]:
        return tuple(self.question.guardrails or ())

    def thresholds(self, estimator: Estimator, registry: MetricRegistry) -> tuple[ThresholdCell, ...]:
        return ()

    def contrasts(self, estimator: Estimator, registry: MetricRegistry, singles: Singles) -> tuple[Contrast, ...]:
        return (self.primary_contrast(estimator, registry), *self.guardrail_contrasts(estimator, registry, singles))

    def primary_contrast(self, estimator: Estimator, registry: MetricRegistry) -> Contrast:
        question = self.question
        metric = registry.get(question.primary)
        direction = question.direction or metric.direction
        difference = estimator.pair(metric, question.baseline, question.candidate, direction)
        (p_adjusted,) = adjust([difference.p_value])
        return Contrast(
            metric=metric.name,
            role="primary",
            baseline=question.baseline,
            candidate=question.candidate,
            direction=direction,
            margin=question.margin,
            relative=False,
            margin_abs=question.margin,
            difference=difference.model_copy(update={"p_adjusted": p_adjusted}),
            verdict=pair_verdict(difference, question.kind, question.margin),
        )

    def guardrail_contrasts(
        self, estimator: Estimator, registry: MetricRegistry, singles: Singles
    ) -> tuple[Contrast, ...]:
        return tuple(self.guardrail_contrast(guardrail, estimator, registry, singles) for guardrail in self.guardrails)

    def guardrail_contrast(
        self, guardrail: Guardrail, estimator: Estimator, registry: MetricRegistry, singles: Singles
    ) -> Contrast:
        question = self.question
        metric = registry.get(guardrail.metric)
        direction = guardrail.direction or metric.direction
        difference = estimator.pair(metric, question.baseline, question.candidate, direction)
        baseline = singles.get((question.baseline, metric.name))
        margin_abs = relative_margin(guardrail, None if baseline is None else baseline.value)
        verdict = CellVerdict.UNCLEAR if margin_abs is None else guardrail_verdict(difference, margin_abs)
        return Contrast(
            metric=metric.name,
            role="guardrail",
            baseline=question.baseline,
            candidate=question.candidate,
            direction=direction,
            margin=guardrail.margin,
            relative=guardrail.relative,
            margin_abs=margin_abs,
            difference=difference,
            verdict=verdict,
        )

    def cell_verdict(
        self, variant_id: VariantId, metric: str, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> CellVerdict:
        contrast = next((contrast for contrast in contrasts if contrast.metric == metric), None)
        if contrast is None:
            return CellVerdict.NONE
        if variant_id == contrast.baseline:
            return CellVerdict.REFERENCE
        if variant_id == contrast.candidate:
            return contrast.verdict
        return CellVerdict.NONE

    def primaries(self, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]) -> tuple[PrimaryCell, ...]:
        margin = self.question.margin
        edge = pair_edge(self.question.kind, margin)
        return tuple(
            PrimaryCell(contrast.difference, contrast.verdict, margin, edge)
            for contrast in contrasts
            if contrast.role == "primary"
        )

    def measurement(
        self, registry: MetricRegistry, thresholds: Sequence[ThresholdCell], contrasts: Sequence[Contrast]
    ) -> str:
        primary = next(contrast for contrast in contrasts if contrast.role == "primary")
        guardrails = [contrast for contrast in contrasts if contrast.role == "guardrail"]
        return pair_measurement(self.question.kind, primary, registry.get(self.question.primary).unit, guardrails)


def design_of(question: Question | None, variants: Sequence[VariantPlanRecord]) -> Design:
    match question:
        case None | LookQuestion():
            return LookDesign()
        case ThresholdQuestion():
            tested = (question.variant,) if question.variant is not None else tuple(v.variant_id for v in variants)
            return ThresholdDesign(question=question, tested=tested)
        case CompareQuestion() | NoninferiorQuestion():
            return PairDesign(question=question)
        case _:
            assert_never(question)


def columns_of(design: Design, registry: MetricRegistry) -> tuple[MetricColumn, ...]:
    primary = () if design.primary is None else (primary_column(design, registry.get(design.primary)),)
    ordered = (
        *primary,
        *(guardrail_column(guardrail, registry) for guardrail in design.guardrails),
        *(plain_column(metric, MetricRole.CHECK) for metric in registry.checks.values()),
        *(plain_column(metric, MetricRole.BUILTIN) for metric in registry.builtins.values()),
    )
    first: dict[str, MetricColumn] = {}
    for column in ordered:
        first.setdefault(column.metric, column)
    return tuple(first.values())


def primary_column(design: Design, metric: MetricDefinition) -> MetricColumn:
    return MetricColumn(
        metric=metric.name,
        role=MetricRole.PRIMARY,
        direction=design.primary_direction or metric.direction,
        unit=metric.unit,
        margin=design.margin,
        relative=False,
    )


def guardrail_column(guardrail: Guardrail, registry: MetricRegistry) -> MetricColumn:
    metric = registry.get(guardrail.metric)
    return MetricColumn(
        metric=metric.name,
        role=MetricRole.GUARDRAIL,
        direction=guardrail.direction or metric.direction,
        unit=metric.unit,
        margin=guardrail.margin,
        relative=guardrail.relative,
    )


def plain_column(metric: MetricDefinition, role: MetricRole) -> MetricColumn:
    return MetricColumn(
        metric=metric.name, role=role, direction=metric.direction, unit=metric.unit, margin=None, relative=False
    )


@dataclass(frozen=True, slots=True)
class Tally:
    done: int
    total: int
    settled: int
    infra_errors: int

    @classmethod
    def of(cls, source: AnalysisInput) -> Tally:
        closed = [attempt for attempt in source.attempts if settled(attempt)]
        return cls(
            done=sum(1 for attempt in source.attempts if finished(attempt)),
            total=len(source.case_names) * source.repeats * len(source.variants),
            settled=len(closed),
            infra_errors=sum(1 for attempt in closed if infra_error(attempt)),
        )

    @property
    def infra_share(self) -> float:
        return self.infra_errors / self.settled if self.settled else 0.0


@dataclass(frozen=True, slots=True)
class VerdictFacts:
    kind: QuestionKind
    split: SeriesSplit
    status: SeriesStatus
    stop: StopCause | None
    inputs_changed: bool
    tally: Tally
    primaries: tuple[PrimaryCell, ...]
    guardrails: tuple[Contrast, ...]
    unvalidated_judge: str | None
    measurement: str


@dataclass(frozen=True, slots=True)
class Decision:
    verdict: SeriesVerdict | None


type VerdictRule = Callable[[VerdictFacts], Decision | None]


def invalid(reason: VerdictReason, text: str) -> Decision:
    return Decision(SeriesVerdict(state=VerdictState.INVALID, reason=reason, text=text))


def signal(reason: VerdictReason, text: str) -> Decision:
    return Decision(SeriesVerdict(state=VerdictState.SIGNAL, reason=reason, text=text))


def look_rule(facts: VerdictFacts) -> Decision | None:
    return Decision(None) if facts.kind == "look" else None


def cancelled_rule(facts: VerdictFacts) -> Decision | None:
    if facts.status is not SeriesStatus.CANCELLED:
        return None
    return invalid(VerdictReason.CANCELLED, cancelled_text(facts.tally.done, facts.tally.total))


def budget_rule(facts: VerdictFacts) -> Decision | None:
    if facts.stop is not StopCause.BUDGET_CUT:
        return None
    return invalid(VerdictReason.BUDGET_CUT, budget_cut_text(facts.tally.done, facts.tally.total))


def inputs_rule(facts: VerdictFacts) -> Decision | None:
    if not facts.inputs_changed:
        return None
    return invalid(VerdictReason.INPUTS_CHANGED, inputs_changed_text(INPUTS_CHANGED_WHAT))


def infra_rule(facts: VerdictFacts) -> Decision | None:
    if facts.tally.infra_share <= INFRA_ERROR_LIMIT:
        return None
    return invalid(VerdictReason.INFRA_ERRORS, infra_errors_text(facts.tally.infra_errors, facts.tally.settled))


def no_data_rule(facts: VerdictFacts) -> Decision | None:
    empty = not facts.primaries or any(cell.estimate.degenerate is DegenerateReason.NO_DATA for cell in facts.primaries)
    return invalid(VerdictReason.NO_DATA, no_data_text()) if empty else None


def dev_rule(facts: VerdictFacts) -> Decision | None:
    if facts.split is not SeriesSplit.DEV:
        return None
    return signal(VerdictReason.DEV_SPLIT, dev_signal(facts.measurement))


def judge_rule(facts: VerdictFacts) -> Decision | None:
    if facts.unvalidated_judge is None:
        return None
    return signal(VerdictReason.JUDGE_NOT_VALIDATED, unvalidated_signal(facts.unvalidated_judge, facts.measurement))


def statistical_state(facts: VerdictFacts) -> VerdictState:
    verdicts = [cell.verdict for cell in facts.primaries] + [contrast.verdict for contrast in facts.guardrails]
    if CellVerdict.FAIL in verdicts:
        return VerdictState.REFUTED
    if all(verdict is CellVerdict.PASS for verdict in verdicts):
        return VerdictState.CONFIRMED
    return VerdictState.INCONCLUSIVE


def guard_reason(estimate: Estimate) -> VerdictReason | None:
    if estimate.degenerate is None:
        return None
    return GUARD_REASONS.get(estimate.degenerate)


def below_mde(cell: PrimaryCell) -> bool:
    low, high = cell.estimate.low, cell.estimate.high
    if low is None or high is None:
        return True
    if cell.margin > 0:
        return (high - low) / 2 > cell.margin
    return low <= cell.edge <= high


def inconclusive_reason(facts: VerdictFacts) -> VerdictReason | None:
    guarded = next((reason for cell in facts.primaries if (reason := guard_reason(cell.estimate)) is not None), None)
    if guarded is not None:
        return guarded
    if any(below_mde(cell) for cell in facts.primaries if cell.verdict is CellVerdict.UNCLEAR):
        return VerdictReason.BELOW_MDE
    return None


def statistics_rule(facts: VerdictFacts) -> Decision | None:
    state = statistical_state(facts)
    reason = inconclusive_reason(facts) if state is VerdictState.INCONCLUSIVE else None
    return Decision(SeriesVerdict(state=state, reason=reason, text=sentence(facts.measurement)))


VERDICT_RULES: Final[tuple[VerdictRule, ...]] = (
    look_rule,
    cancelled_rule,
    budget_rule,
    inputs_rule,
    infra_rule,
    no_data_rule,
    dev_rule,
    judge_rule,
    statistics_rule,
)


def decide(facts: VerdictFacts) -> SeriesVerdict | None:
    decisions = (rule(facts) for rule in VERDICT_RULES)
    decision = next((found for found in decisions if found is not None), None)
    return None if decision is None else decision.verdict


def unvalidated_judge(design: Design, checks: Sequence[CheckPlan]) -> str | None:
    metrics = [design.primary, *(guardrail.metric for guardrail in design.guardrails)]
    judged = {check.check_id: check for check in checks if check.judge is not None and check.judge.validated_by is None}
    return next((metric for metric in metrics if metric is not None and metric in judged), None)


def success_samples(estimator: Estimator, variant_id: VariantId) -> RateSamples:
    return expect(estimator.samples(BUILTIN_METRICS[SeriesMetric.SUCCESS_RATE], variant_id), RateSamples)


def aggregates_of(
    variant: VariantPlanRecord,
    estimator: Estimator,
    registry: MetricRegistry,
    columns: Sequence[MetricColumn],
    singles: Singles,
    repeats: int,
) -> VariantAggregates:
    attempts = [attempt for attempt in estimator.book.attempts(variant.variant_id) if finished(attempt)]
    success = success_samples(estimator, variant.variant_id)
    repeated = repeats >= MULTIPLE_REPEATS
    return VariantAggregates(
        variant_id=variant.variant_id,
        role=variant.role,
        cases=len({attempt.case_name for attempt in attempts}),
        attempts=len(attempts),
        counted=sum(1 for attempt in attempts if counted(attempt)),
        infra_errors=sum(1 for attempt in attempts if infra_error(attempt)),
        spend_usd=sum((attempt.cost_usd + attempt.check_cost_usd for attempt in attempts), Decimal(0)),
        pass_k=pass_hat_k(success, repeats) if repeated else None,
        icc=icc_of(success.outcomes()) if repeated else None,
        stability=stability_of(success) if repeated else None,
        metrics={column.metric: singles[(variant.variant_id, column.metric)] for column in columns},
        runtime_checks={metric.name: estimator.single(metric, variant.variant_id, None) for metric in registry.runtime},
        models=tuple(sorted({model for attempt in attempts for model in attempt.models.values()})),
    )


def matrix_row(
    variant: VariantPlanRecord,
    design: Design,
    columns: Sequence[MetricColumn],
    singles: Singles,
    thresholds: Sequence[ThresholdCell],
    contrasts: Sequence[Contrast],
) -> MatrixRow:
    return MatrixRow(
        variant_id=variant.variant_id,
        role=variant.role,
        cells=tuple(
            metric_cell(
                column.metric,
                singles[(variant.variant_id, column.metric)],
                design.cell_verdict(variant.variant_id, column.metric, thresholds, contrasts),
            )
            for column in columns
        ),
    )


def metric_cell(metric: str, estimate: Estimate, verdict: CellVerdict) -> MetricCell:
    return MetricCell(
        metric=metric,
        value=estimate.value,
        low=estimate.low,
        high=estimate.high,
        verdict=verdict,
        method=estimate.method,
        cases=estimate.cases,
    )


def own_estimate(tested: Singles, estimator: Estimator, metric: MetricDefinition, variant_id: VariantId) -> Estimate:
    found = tested.get((variant_id, metric.name))
    return estimator.single(metric, variant_id, None) if found is None else found


@dataclass(frozen=True, slots=True)
class ScipySeriesAnalyst:
    def analyze(self, source: AnalysisInput) -> SeriesAnalysis:
        registry = MetricRegistry.of(source.checks, source.attempts)
        estimator = Estimator(source.series_id, CaseBook.of(source))
        design = design_of(source.question, source.variants)
        columns = columns_of(design, registry)
        thresholds = design.thresholds(estimator, registry)
        tested = {(cell.variant_id, cell.metric): cell.estimate for cell in thresholds}
        singles = {
            (variant.variant_id, column.metric): own_estimate(
                tested, estimator, registry.get(column.metric), variant.variant_id
            )
            for variant in source.variants
            for column in columns
        }
        contrasts = design.contrasts(estimator, registry, singles)
        tally = Tally.of(source)
        facts = VerdictFacts(
            kind=design.kind,
            split=source.split,
            status=source.status,
            stop=source.stop,
            inputs_changed=source.inputs_changed,
            tally=tally,
            primaries=design.primaries(thresholds, contrasts),
            guardrails=tuple(contrast for contrast in contrasts if contrast.role == "guardrail"),
            unvalidated_judge=unvalidated_judge(design, source.checks),
            measurement=design.measurement(registry, thresholds, contrasts),
        )
        return SeriesAnalysis(
            variants=tuple(
                aggregates_of(variant, estimator, registry, columns, singles, source.repeats)
                for variant in source.variants
            ),
            matrix=SeriesMatrix(
                columns=columns,
                rows=tuple(
                    matrix_row(variant, design, columns, singles, thresholds, contrasts) for variant in source.variants
                ),
            ),
            thresholds=thresholds,
            contrasts=contrasts,
            verdict=decide(facts),
            infra_error_share=tally.infra_share,
        )
