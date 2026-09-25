from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, assert_never

from pydantic import JsonValue, TypeAdapter

from aqven.ir import BuiltinEvaluator, CodeEvaluator, CompiledEvaluator, JudgeEvaluator
from aqven.runtime.address import RunId
from aqven.series.model import (
    COUNTED_OUTCOMES,
    AttemptOutcome,
    AttemptRecord,
    AttemptState,
    CaseSnapshot,
    CheckPlan,
    CheckState,
    OutcomeClass,
    SeriesAnalysis,
    SeriesPause,
    SeriesRecord,
    SeriesStatus,
    SeriesVerdict,
)
from aqven.series.views import (
    AgentRefView,
    AttemptView,
    CheckSourceView,
    CheckView,
    GuardrailView,
    QuestionKind,
    QuestionView,
    SeriesCaseRow,
    SeriesDetailView,
    SeriesEta,
    SeriesProgress,
    SeriesSpend,
    SeriesStarted,
    SeriesSummaryView,
    StabilityRow,
    VariantTally,
)
from aqven.spec import (
    AgentId,
    CompareQuestion,
    Guardrail,
    LookQuestion,
    MetricDirection,
    NoninferiorQuestion,
    Question,
    SeriesMetric,
    ThresholdQuestion,
    VariantId,
)

LOOK_KIND: Final[QuestionKind] = "look"
FIELDS_PARAM: Final = "fields"
FIELD_PARAM: Final = "field"
UNKNOWN_MODEL: Final = "unknown"
ZERO: Final = Decimal(0)
EVALUATOR: Final[TypeAdapter[CompiledEvaluator]] = TypeAdapter(CompiledEvaluator)
ACTIVE_STATUSES: Final = frozenset({SeriesStatus.AWAITING_APPROVAL, SeriesStatus.RUNNING})
DEFAULT_DIRECTIONS: Final[Mapping[str, MetricDirection]] = {
    SeriesMetric.SUCCESS_RATE.value: MetricDirection.HIGHER_IS_BETTER,
    SeriesMetric.COST_USD.value: MetricDirection.LOWER_IS_BETTER,
    SeriesMetric.COST_OF_PASS.value: MetricDirection.LOWER_IS_BETTER,
    SeriesMetric.LATENCY_P50_MS.value: MetricDirection.LOWER_IS_BETTER,
    SeriesMetric.LATENCY_P95_MS.value: MetricDirection.LOWER_IS_BETTER,
    SeriesMetric.SCHEMA_VALID_FIRST_TRY.value: MetricDirection.HIGHER_IS_BETTER,
    SeriesMetric.INFRA_ERROR_RATE.value: MetricDirection.LOWER_IS_BETTER,
}

type AgentModels = Callable[[AgentId], str]


@dataclass(frozen=True, slots=True)
class SeriesProgressFacts:
    done: int
    spend: Decimal
    waits: int
    unpriced: int = 0
    eta: SeriesEta | None = None


def unpriced_attempts(attempts: Sequence[AttemptRecord]) -> int:
    return sum(1 for attempt in attempts if attempt.unpriced_calls > 0)


def question_kind(record: SeriesRecord) -> QuestionKind:
    question = record.plan.question
    return LOOK_KIND if question is None else question.kind


def attempts_total(record: SeriesRecord) -> int:
    plan = record.plan
    return plan.case_count * plan.repeats * len(plan.variants)


def shown_status(record: SeriesRecord, waits: int) -> SeriesStatus:
    if record.status is SeriesStatus.RUNNING and waits > 0:
        return SeriesStatus.WAITING_HUMAN
    return record.status


def waiting_attempts(record: SeriesRecord, attempts: Sequence[AttemptRecord], waiting: frozenset[RunId]) -> int:
    if record.status is not SeriesStatus.RUNNING:
        return 0
    return sum(1 for row in attempts if row.state is AttemptState.RUNNING and row.run_id in waiting)


def shown_pause(record: SeriesRecord) -> SeriesPause | None:
    return record.pause if record.status is SeriesStatus.AWAITING_APPROVAL else None


def summary_view(record: SeriesRecord, facts: SeriesProgressFacts) -> SeriesSummaryView:
    return SeriesSummaryView(
        series_id=record.series_id,
        origin=record.origin,
        flow_id=record.flow_id,
        dataset_id=record.dataset_id,
        question=question_kind(record),
        on=record.on,
        cases=record.plan.case_count,
        repeats=record.plan.repeats,
        variants=tuple(variant.variant_id for variant in record.plan.variants),
        status=shown_status(record, facts.waits),
        progress=SeriesProgress(done=facts.done, total=attempts_total(record)),
        spend=SeriesSpend(usd=facts.spend, cap_usd=record.cap_usd, unpriced_attempts=facts.unpriced),
        verdict=record.verdict,
        waits=facts.waits,
        started_at=record.created_at,
        finished_at=record.finished_at,
        pause=shown_pause(record),
        eta=facts.eta,
    )


def started_view(record: SeriesRecord, facts: SeriesProgressFacts) -> SeriesStarted:
    return SeriesStarted(**summary_view(record, facts).model_dump(), launch=record.launch)


def direction_of(metric: str, declared: MetricDirection | None) -> MetricDirection:
    if declared is not None:
        return declared
    return DEFAULT_DIRECTIONS.get(metric, MetricDirection.HIGHER_IS_BETTER)


def guardrail_view(guardrail: Guardrail) -> GuardrailView:
    return GuardrailView(
        metric=guardrail.metric,
        direction=direction_of(guardrail.metric, guardrail.direction),
        margin=guardrail.margin,
        relative=guardrail.relative,
    )


def question_view(question: Question | None) -> QuestionView:
    match question:
        case None | LookQuestion():
            return QuestionView(kind=LOOK_KIND)
        case ThresholdQuestion():
            bound = "above" if question.above is not None else "below"
            value = question.above if question.above is not None else question.below
            return QuestionView(
                kind=question.kind,
                metric=question.metric,
                bound=bound,
                value=value,
                variant=question.variant,
                direction=direction_of(question.metric, None),
                margin=question.margin,
            )
        case CompareQuestion() | NoninferiorQuestion():
            return QuestionView(
                kind=question.kind,
                metric=question.primary,
                baseline=question.baseline,
                candidate=question.candidate,
                direction=direction_of(question.primary, question.direction),
                margin=question.margin,
                guardrails=tuple(guardrail_view(item) for item in question.guardrails or ()),
            )
        case _:
            assert_never(question)


def field_names(params: Mapping[str, JsonValue]) -> tuple[str, ...]:
    listed = params.get(FIELDS_PARAM)
    single = params.get(FIELD_PARAM)
    names = [item for item in listed if isinstance(item, str)] if isinstance(listed, list) else []
    return (*names, *((single,) if isinstance(single, str) else ()))


def source_view(check: CheckPlan, models: AgentModels) -> CheckSourceView:
    evaluator = EVALUATOR.validate_python(check.evaluator)
    match evaluator:
        case BuiltinEvaluator():
            return CheckSourceView(kind="builtin", use=evaluator.use, fields=field_names(evaluator.params))
        case CodeEvaluator():
            return CheckSourceView(kind="code", ref=evaluator.run, fields=field_names(evaluator.params))
        case JudgeEvaluator():
            agent = AgentRefView(agent_id=evaluator.agent, model=models(evaluator.agent))
            validated_by = None if check.judge is None else check.judge.validated_by
            return CheckSourceView(kind="judge", inference=evaluator.inference, agent=agent, validated_by=validated_by)
        case _:
            assert_never(evaluator)


def check_views(checks: Sequence[CheckPlan], models: AgentModels) -> tuple[CheckView, ...]:
    return tuple(
        CheckView(check_id=check.check_id, kind=check.kind, source=source_view(check, models)) for check in checks
    )


def stability_rows(analysis: SeriesAnalysis) -> tuple[StabilityRow, ...]:
    return tuple(
        StabilityRow(
            variant_id=variant.variant_id,
            always=variant.stability.always,
            never=variant.stability.never,
            flaky=variant.stability.flaky,
        )
        for variant in analysis.variants
        if variant.stability is not None
    )


def shown_verdict(record: SeriesRecord, facts: SeriesProgressFacts, analysis: SeriesAnalysis) -> SeriesVerdict | None:
    if record.status not in ACTIVE_STATUSES:
        return record.verdict
    if facts.done == 0:
        return None
    return analysis.verdict


def detail_view(
    record: SeriesRecord, facts: SeriesProgressFacts, analysis: SeriesAnalysis, models: AgentModels
) -> SeriesDetailView:
    summary = summary_view(record, facts)
    return SeriesDetailView(
        **summary.model_dump(exclude={"verdict"}),
        verdict=shown_verdict(record, facts, analysis),
        question_detail=question_view(record.plan.question),
        checks=check_views(record.plan.checks, models),
        matrix=analysis.matrix,
        stability=stability_rows(analysis),
        contrasts=analysis.contrasts,
        thresholds=analysis.thresholds,
        aggregates=analysis.variants,
        launch=record.launch,
        needs_approval=record.needs_approval,
        approved_by=record.approved_by,
        finding_path=record.finding_path,
        error=record.error,
    )


def finished_outcome(row: AttemptRecord) -> AttemptOutcome:
    if row.outcome is OutcomeClass.OK and row.passed:
        return AttemptOutcome.PASSED
    if row.outcome in COUNTED_OUTCOMES:
        return AttemptOutcome.FAILED
    return AttemptOutcome.ERROR


def attempt_outcome(row: AttemptRecord, waiting: frozenset[RunId], stopped: bool) -> AttemptOutcome:
    if row.state is AttemptState.FINISHED:
        return finished_outcome(row)
    if row.run_id in waiting:
        return AttemptOutcome.WAITING
    return AttemptOutcome.ERROR if stopped else AttemptOutcome.RUNNING


def failed_checks(row: AttemptRecord) -> tuple[str, ...]:
    return tuple(check.check_id for check in row.checks if check.state is CheckState.FAILED)


def attempt_error(row: AttemptRecord) -> str | None:
    if row.error_code is None:
        return row.error_message
    if row.error_message is None:
        return row.error_code
    return f"{row.error_code}: {row.error_message}"


def attempt_view(row: AttemptRecord, outcome: AttemptOutcome) -> AttemptView:
    return AttemptView(
        run_id=row.run_id,
        variant_id=row.variant_id,
        repeat=row.repeat,
        passed=outcome is AttemptOutcome.PASSED,
        outcome=outcome,
        failed_checks=failed_checks(row),
        usd=row.cost_usd + row.check_cost_usd,
        latency_ms=row.latency_ms or 0,
        error=attempt_error(row),
    )


def variant_tally(variant_id: VariantId, views: Sequence[AttemptView]) -> VariantTally:
    own = [view for view in views if view.variant_id == variant_id]
    names = dict.fromkeys(name for view in own for name in view.failed_checks)
    return VariantTally(
        variant_id=variant_id,
        passed=sum(1 for view in own if view.passed),
        total=len(own),
        failed_checks=tuple(names),
        usd=sum((view.usd for view in own), ZERO),
    )


def divergent(tallies: Sequence[VariantTally]) -> bool:
    rates = {tally.passed / tally.total for tally in tallies if tally.total}
    return len(rates) > 1


def failing(views: Sequence[AttemptView]) -> bool:
    return any(view.outcome in {AttemptOutcome.FAILED, AttemptOutcome.ERROR} for view in views)


@dataclass(frozen=True, slots=True)
class CaseBoard:
    record: SeriesRecord
    attempts: tuple[AttemptRecord, ...]
    waiting: frozenset[RunId]

    @property
    def stopped(self) -> bool:
        return self.record.status in {SeriesStatus.CANCELLED, SeriesStatus.FAILED}

    def row(self, case: CaseSnapshot) -> SeriesCaseRow:
        own = [row for row in self.attempts if row.case_name == case.name]
        views = [attempt_view(row, attempt_outcome(row, self.waiting, self.stopped)) for row in own]
        tallies = tuple(variant_tally(variant.variant_id, views) for variant in self.record.plan.variants)
        return SeriesCaseRow(
            name=case.name,
            split=case.split,
            tags=case.tags,
            variants=tallies,
            usd=sum((view.usd for view in views), ZERO),
            failing=failing(views),
            divergent=divergent(tallies),
            attempts=tuple(views),
        )

    def rows(self, cases: Sequence[CaseSnapshot]) -> tuple[SeriesCaseRow, ...]:
        return tuple(self.row(case) for case in cases)
