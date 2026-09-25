import itertools
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Final

from pydantic import JsonValue

from aqven.series import (
    Assignment,
    AttemptRecord,
    AttemptState,
    CheckPlan,
    Contrast,
    Estimate,
    ExperimentOrigin,
    JudgePlan,
    LaunchPlan,
    MatrixRow,
    MetricCell,
    MetricColumn,
    MetricRole,
    MetricUnit,
    OutcomeClass,
    Recommendation,
    RecommendationReason,
    SeriesAnalysis,
    SeriesId,
    SeriesMatrix,
    SeriesPlanRecord,
    SeriesRecord,
    SeriesSnapshot,
    SeriesStatus,
    SeriesVerdict,
    StatMethod,
    StopCause,
    SubjectKind,
    SubjectRecord,
    ThresholdCell,
    VariantAggregates,
    VariantChange,
    VariantPlanRecord,
    VariantRole,
    attempt_id,
    subject_run_id,
)
from aqven.spec import (
    AgentId,
    CellVerdict,
    DatasetId,
    ExperimentId,
    ExperimentSpec,
    FactorKind,
    FlowId,
    InferenceId,
    MetricDirection,
    MetricKind,
    NodeId,
    NoninferiorQuestion,
    Question,
    SeriesSplit,
    ThresholdQuestion,
    TypeId,
    VariantId,
    VerdictReason,
    VerdictState,
)

NONINFERIOR_SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
THRESHOLD_SERIES: Final = SeriesId("01999f30-1111-7222-8333-944455556666")
SIGNAL_SERIES: Final = SeriesId("01999f31-aaaa-7bbb-8ccc-9dddeeeeffff")
CREATED: Final = datetime(2026, 9, 24, 9, 0, tzinfo=UTC)
FINISHED: Final = datetime(2026, 9, 24, 9, 42, tzinfo=UTC)
CASES: Final = tuple(f"case_{index:02d}" for index in range(12))
REPEATS: Final = 3
DATASET: Final = DatasetId("support_case_cases")
FLOW: Final = FlowId("support_case")
GPT: Final = VariantId("gpt")
MISTRAL: Final = VariantId("mistral")
GPT_MODEL: Final = "openrouter:openai/gpt-oss-20b"
MISTRAL_MODEL: Final = "openrouter:mistralai/mistral-nemo"
REVISE: Final = NodeId("polish__revise")
REVISE_SLOT: Final = NodeId("revise")
VARIANTS: Final = (GPT, MISTRAL)
MODELS: Final = {GPT: GPT_MODEL, MISTRAL: MISTRAL_MODEL}
ATTEMPT_COST: Final = Decimal("0.0035")
JUDGE_COST: Final = Decimal("0.0005")


@dataclass(frozen=True, slots=True)
class FindingCase:
    record: SeriesRecord
    experiment: ExperimentSpec
    attempts: tuple[AttemptRecord, ...]


def experiment(experiment_id: str, question: dict[str, JsonValue], failure_mode: str | None) -> ExperimentSpec:
    document: dict[str, JsonValue] = {
        "apiVersion": "aqven/v1",
        "kind": "Experiment",
        "description": f"{experiment_id} as the fixture describes it",
        "failure_mode": failure_mode,
        "subject": {"flow": FLOW, "from": "polish", "to": "polish"},
        "cases": {"dataset": DATASET},
        "varies": {"what": "agent", "nodes": [REVISE_SLOT]},
        "variants": [{"id": GPT}, {"id": MISTRAL, "nodes": {REVISE_SLOT: "mistral"}}],
        "checks": [
            {"id": "critique", "kind": "continuous", "inference": "critique", "agent": "deepseek"},
        ],
        "question": question,
        "plan": {"cases": len(CASES), "repeats": REPEATS},
    }
    return ExperimentSpec.model_validate(document)


def estimate(value: float, low: float, high: float, method: StatMethod, attempts: int) -> Estimate:
    return Estimate(value=value, low=low, high=high, method=method, p_value=None, cases=len(CASES), attempts=attempts)


def variant_plan(variant: VariantId, role: VariantRole, agent: str, model: str) -> VariantPlanRecord:
    return VariantPlanRecord(
        variant_id=variant,
        role=role,
        changes=variant_changes(variant),
        flow_id=FLOW,
        ir_hash=f"{variant}-ir",
        flow_hash=f"sha256-{variant[0] * 64}",
        input_type=TypeId("CaseRequest"),
        output_type=TypeId("CaseOutcome"),
        assignments=(Assignment(node_id=REVISE, agent_id=AgentId(agent), model=model, overridden=variant == MISTRAL),),
    )


def variant_changes(variant: VariantId) -> tuple[VariantChange, ...]:
    if variant != MISTRAL:
        return ()
    return (VariantChange(node_id=REVISE_SLOT, what=FactorKind.AGENT, value="mistral"),)


def critique_check(validated: bool) -> CheckPlan:
    validated_by = ExperimentId("critique_planted_defects") if validated else None
    judge = JudgePlan(
        flow_id=FlowId("aqven_judge_critique"),
        inference=InferenceId("critique"),
        agent=AgentId("deepseek"),
        input_fields=("reply",),
        validated_by=validated_by,
    )
    return CheckPlan(check_id="critique", kind=MetricKind.CONTINUOUS, evaluator={}, judge=judge)


def launch_plan() -> LaunchPlan:
    return LaunchPlan(
        on=SeriesSplit.HOLDOUT,
        cases=len(CASES),
        repeats=REPEATS,
        variants=2,
        attempts=len(CASES) * REPEATS * 2,
        available=len(CASES),
        half_width=0.02,
        mde=0.03,
        margin=0.05,
        spread=0.25,
        spread_source="prior",
        icc=0.3,
        recommended=Recommendation(cases=12, repeats=3, reason=RecommendationReason.ENOUGH, text="12 cases are enough"),
        below_recommended=False,
        needs_approval=False,
        project_cap_usd=Decimal("1.00"),
        cap_usd=Decimal("0.37"),
    )


def columns(primary: str, direction: MetricDirection, margin: float) -> tuple[MetricColumn, ...]:
    return (
        MetricColumn(
            metric=primary,
            role=MetricRole.PRIMARY,
            direction=direction,
            unit=MetricUnit.SCORE,
            margin=margin,
            relative=False,
        ),
        MetricColumn(
            metric="cost_of_pass",
            role=MetricRole.GUARDRAIL,
            direction=MetricDirection.LOWER_IS_BETTER,
            unit=MetricUnit.USD,
            margin=0.2,
            relative=True,
        ),
    )


def aggregates(variant: VariantId, role: VariantRole, critique: Estimate) -> VariantAggregates:
    attempts = len(CASES) * REPEATS
    success = estimate(0.97, 0.86, 0.99, StatMethod.KISH_WILSON, attempts)
    return VariantAggregates(
        variant_id=variant,
        role=role,
        cases=len(CASES),
        attempts=attempts,
        counted=attempts,
        infra_errors=0,
        spend_usd=Decimal("0.144"),
        pass_k=0.9,
        icc=0.2,
        stability=None,
        metrics={"success_rate": success, "critique": critique},
        runtime_checks={},
        models=(),
    )


def matrix(primary: str, direction: MetricDirection, margin: float) -> SeriesMatrix:
    rows = tuple(
        MatrixRow(
            variant_id=variant,
            role=role,
            cells=(
                MetricCell(
                    metric=primary,
                    value=0.68,
                    low=0.63,
                    high=0.73,
                    verdict=CellVerdict.NONE,
                    method=StatMethod.T_CASE_MEANS,
                    cases=len(CASES),
                ),
            ),
        )
        for variant, role in ((GPT, VariantRole.BASELINE), (MISTRAL, VariantRole.CANDIDATE))
    )
    return SeriesMatrix(columns=columns(primary, direction, margin), rows=rows)


def attempt_row(
    series_id: SeriesId, split: SeriesSplit, case_index: int, repeat: int, variant_index: int
) -> AttemptRecord:
    variant = VARIANTS[variant_index]
    case = CASES[case_index]
    ordinal = (case_index * REPEATS + repeat - 1) * len(VARIANTS) + variant_index
    identity = attempt_id(series_id, variant, case, repeat)
    started = CREATED + timedelta(seconds=ordinal)
    return AttemptRecord(
        attempt_id=identity,
        series_id=series_id,
        ordinal=ordinal,
        variant_id=variant,
        case_name=case,
        split=split,
        repeat=repeat,
        run_id=subject_run_id(identity),
        state=AttemptState.FINISHED,
        outcome=OutcomeClass.OK,
        passed=True,
        cost_usd=ATTEMPT_COST,
        check_cost_usd=JUDGE_COST,
        latency_ms=900,
        models={REVISE: MODELS[variant]},
        started_at=started,
        finished_at=started + timedelta(seconds=2),
    )


def attempts_of(series_id: SeriesId, split: SeriesSplit = SeriesSplit.HOLDOUT) -> tuple[AttemptRecord, ...]:
    keys = itertools.product(range(len(CASES)), range(1, REPEATS + 1), range(len(VARIANTS)))
    return tuple(attempt_row(series_id, split, *key) for key in keys)


def plan(question: Question, validated: bool) -> SeriesPlanRecord:
    return SeriesPlanRecord(
        subject=SubjectRecord(kind=SubjectKind.RANGE, flow_id=FLOW, local_flow=False, start_node=None, end_node=None),
        question=question,
        variants=(
            variant_plan(GPT, VariantRole.BASELINE, "gpt", GPT_MODEL),
            variant_plan(MISTRAL, VariantRole.CANDIDATE, "mistral", MISTRAL_MODEL),
        ),
        checks=(critique_check(validated),),
        judge_ir_hash="judge-ir",
        package="lumen",
        repeats=REPEATS,
        case_count=len(CASES),
        snapshot=SeriesSnapshot(
            experiment_sha256="sha256-" + "e" * 64,
            dataset_sha256="sha256-" + "d" * 64,
            cases_sha256="sha256-" + "c" * 64,
            flows={GPT: "sha256-" + "1" * 64, MISTRAL: "sha256-" + "2" * 64},
            judges={"critique": "sha256-" + "3" * 64},
            code_sha256="sha256-" + "4" * 64,
            engine_version="0.0.2",
        ),
    )


def record_of(
    series_id: SeriesId,
    experiment_id: str,
    question: Question,
    analysis: SeriesAnalysis,
    validated: bool = True,
    finished: datetime = FINISHED,
) -> SeriesRecord:
    return SeriesRecord(
        series_id=series_id,
        origin=ExperimentOrigin(experiment_id=ExperimentId(experiment_id)),
        flow_id=FLOW,
        dataset_id=DATASET,
        on=SeriesSplit.HOLDOUT,
        status=SeriesStatus.DONE,
        plan=plan(question, validated),
        launch=launch_plan(),
        cap_usd=Decimal("0.37"),
        needs_approval=False,
        created_at=CREATED,
        finished_at=finished,
        stop=StopCause.COMPLETED,
        verdict=analysis.verdict,
        analysis=analysis,
    )


NONINFERIOR_TEXT: Final = (
    "mistral vs gpt on critique: -0.019 (95% CI -0.035 to -0.003): not worse by more than the 0.05 margin; "
    "guardrail cost_of_pass holds."
)


def noninferior_case() -> FindingCase:
    question = NoninferiorQuestion(kind="noninferior", baseline=GPT, candidate=MISTRAL, primary="critique", margin=0.05)
    difference = Estimate(
        value=-0.019166666666666666,
        low=-0.035070312345,
        high=-0.003263021987,
        method=StatMethod.PAIRED_T,
        p_value=0.0224821234,
        p_adjusted=0.0224821234,
        cases=len(CASES),
        attempts=len(CASES) * REPEATS * 2,
    )
    guard_difference = estimate(-0.00021, -0.0004, 0.00001, StatMethod.PAIRED_BOOTSTRAP_RATIO, 72)
    verdict = SeriesVerdict(state=VerdictState.CONFIRMED, reason=None, text=NONINFERIOR_TEXT)
    analysis = SeriesAnalysis(
        variants=(
            aggregates(GPT, VariantRole.BASELINE, estimate(0.6825, 0.635409, 0.729591, StatMethod.T_CASE_MEANS, 36)),
            aggregates(MISTRAL, VariantRole.CANDIDATE, estimate(0.66333, 0.62, 0.71, StatMethod.T_CASE_MEANS, 36)),
        ),
        matrix=matrix("critique", MetricDirection.HIGHER_IS_BETTER, 0.05),
        thresholds=(),
        contrasts=(
            Contrast(
                metric="critique",
                role="primary",
                baseline=GPT,
                candidate=MISTRAL,
                direction=MetricDirection.HIGHER_IS_BETTER,
                margin=0.05,
                relative=False,
                margin_abs=0.05,
                difference=difference,
                verdict=CellVerdict.PASS,
            ),
            Contrast(
                metric="cost_of_pass",
                role="guardrail",
                baseline=GPT,
                candidate=MISTRAL,
                direction=MetricDirection.LOWER_IS_BETTER,
                margin=0.2,
                relative=True,
                margin_abs=0.0008,
                difference=guard_difference,
                verdict=CellVerdict.PASS,
            ),
        ),
        verdict=verdict,
        infra_error_share=0.0,
    )
    spec = experiment(
        "reply_noninferior_mistral",
        {"kind": "noninferior", "baseline": GPT, "candidate": MISTRAL, "primary": "critique", "margin": 0.05},
        "reply_quality",
    )
    record = record_of(NONINFERIOR_SERIES, "reply_noninferior_mistral", question, analysis)
    return FindingCase(record=record, experiment=spec, attempts=attempts_of(NONINFERIOR_SERIES))


THRESHOLD_TEXT: Final = (
    "gpt: promises is 0.99 (95% CI 0.98 to 1.00) against above 0.97 with margin 0.01: clears the bound by more "
    "than the margin."
)


THRESHOLD_TEXTS: Final = {
    VerdictState.CONFIRMED: THRESHOLD_TEXT,
    VerdictState.REFUTED: (
        "gpt: promises is 0.97 (95% CI 0.94 to 0.99) against above 0.97 with margin 0.01: stays within the margin "
        "of the bound or on its wrong side."
    ),
}


def threshold_case(series_id: SeriesId = THRESHOLD_SERIES, state: VerdictState = VerdictState.CONFIRMED) -> FindingCase:
    question = ThresholdQuestion(kind="threshold", metric="promises", variant=GPT, above=0.97, margin=0.01)
    cell = ThresholdCell(
        metric="promises",
        variant_id=GPT,
        bound="above",
        threshold=0.97,
        margin=0.01,
        estimate=estimate(0.9861111, 0.98, 0.998, StatMethod.KISH_WILSON, 36),
        verdict=CellVerdict.PASS if state is VerdictState.CONFIRMED else CellVerdict.FAIL,
    )
    verdict = SeriesVerdict(state=state, reason=None, text=THRESHOLD_TEXTS[state])
    analysis = SeriesAnalysis(
        variants=(
            aggregates(GPT, VariantRole.OTHER, estimate(0.6825, 0.63, 0.73, StatMethod.T_CASE_MEANS, 36)),
            aggregates(MISTRAL, VariantRole.OTHER, estimate(0.66, 0.61, 0.71, StatMethod.T_CASE_MEANS, 36)),
        ),
        matrix=matrix("promises", MetricDirection.HIGHER_IS_BETTER, 0.01),
        thresholds=(cell,),
        contrasts=(),
        verdict=verdict,
        infra_error_share=0.0,
    )
    spec = experiment(
        "reply_overpromise_risk",
        {"kind": "threshold", "metric": "promises", "variant": GPT, "above": 0.97, "margin": 0.01},
        "overpromise",
    )
    record = record_of(series_id, "reply_overpromise_risk", question, analysis)
    return FindingCase(record=record, experiment=spec, attempts=attempts_of(series_id))


SIGNAL_TEXT: Final = (
    "Signal only, judge critique is not validated: mistral vs gpt on critique: +0.004 (95% CI -0.01 to 0.02)."
)


def signal_case() -> FindingCase:
    base = noninferior_case()
    verdict = SeriesVerdict(state=VerdictState.SIGNAL, reason=VerdictReason.JUDGE_NOT_VALIDATED, text=SIGNAL_TEXT)
    analysis = base.record.analysis
    assert analysis is not None
    changed = analysis.model_copy(update={"verdict": verdict})
    question = base.record.plan.question
    assert question is not None
    record = record_of(
        SIGNAL_SERIES,
        "judge_free_compare",
        question,
        changed,
        validated=False,
        finished=FINISHED + timedelta(hours=1),
    )
    spec = experiment(
        "judge_free_compare",
        {"kind": "noninferior", "baseline": GPT, "candidate": MISTRAL, "primary": "critique", "margin": 0.05},
        None,
    )
    return FindingCase(record=record, experiment=spec, attempts=attempts_of(SIGNAL_SERIES))
