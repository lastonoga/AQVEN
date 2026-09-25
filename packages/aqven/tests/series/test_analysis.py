from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest

from aqven.series.analysis import ScipySeriesAnalyst
from aqven.series.ids import attempt_id, subject_run_id
from aqven.series.model import (
    AnalysisInput,
    AttemptRecord,
    AttemptState,
    CheckPlan,
    CheckState,
    CheckValue,
    JudgePlan,
    MetricRole,
    OutcomeClass,
    RuntimeCheckTry,
    SeriesAnalysis,
    SeriesId,
    SeriesStatus,
    Stability,
    StatMethod,
    StopCause,
    VariantPlanRecord,
    VariantRole,
)
from aqven.spec import (
    AgentId,
    CellVerdict,
    CompareQuestion,
    ExperimentId,
    FlowId,
    Guardrail,
    InferenceId,
    LookQuestion,
    MetricDirection,
    MetricKind,
    NoninferiorQuestion,
    Question,
    SeriesSplit,
    ThresholdQuestion,
    TypeId,
    VariantId,
    VerdictReason,
    VerdictState,
)

SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
STARTED: Final = datetime(2026, 9, 23, 12, tzinfo=UTC)
GPT: Final = VariantId("gpt")
MISTRAL: Final = VariantId("mistral")
BASELINE_SCORES: Final = (0.62, 0.71, 0.55, 0.80, 0.68, 0.74, 0.59, 0.66, 0.77, 0.70, 0.64, 0.73)
CANDIDATE_SCORES: Final = (0.60, 0.73, 0.50, 0.79, 0.66, 0.70, 0.61, 0.60, 0.76, 0.69, 0.60, 0.72)
ANALYST: Final = ScipySeriesAnalyst()


def variant(variant_id: VariantId, role: VariantRole = VariantRole.OTHER) -> VariantPlanRecord:
    return VariantPlanRecord(
        variant_id=variant_id,
        role=role,
        changes=(),
        flow_id=FlowId("reply"),
        ir_hash="sha256-plan",
        flow_hash="sha256-flow",
        input_type=TypeId("CaseRequest"),
        output_type=None,
        assignments=(),
    )


def check_plan(check_id: str, kind: MetricKind, *, judge: bool = False, validated: bool = True) -> CheckPlan:
    plan = JudgePlan(
        flow_id=FlowId(f"aqven_judge_{check_id}"),
        inference=InferenceId(check_id),
        agent=AgentId("deepseek"),
        input_fields=("reply",),
        validated_by=ExperimentId("planted_defects") if validated else None,
    )
    return CheckPlan(check_id=check_id, kind=kind, evaluator={"kind": "judge"}, judge=plan if judge else None)


def attempt(
    variant_id: VariantId,
    case: str,
    repeat: int = 1,
    *,
    outcome: OutcomeClass = OutcomeClass.OK,
    passed: bool | None = True,
    checks: Sequence[CheckValue] = (),
    runtime: Sequence[RuntimeCheckTry] = (),
    cost: str = "0.001",
    latency: int | None = 1200,
    state: AttemptState = AttemptState.FINISHED,
    models: dict[str, str] | None = None,
) -> AttemptRecord:
    found = attempt_id(SERIES, variant_id, case, repeat)
    return AttemptRecord(
        attempt_id=found,
        series_id=SERIES,
        ordinal=0,
        variant_id=variant_id,
        case_name=case,
        split=SeriesSplit.HOLDOUT,
        repeat=repeat,
        run_id=subject_run_id(found),
        state=state,
        outcome=outcome if state is AttemptState.FINISHED else None,
        passed=passed,
        checks=tuple(checks),
        runtime_checks=tuple(runtime),
        schema_valid_first_try=True,
        cost_usd=Decimal(cost),
        check_cost_usd=Decimal("0.0005"),
        latency_ms=latency,
        models=models or {"reply": f"openrouter:{variant_id}"},
        started_at=STARTED,
        finished_at=STARTED if state is AttemptState.FINISHED else None,
    )


def score(check_id: str, value: float) -> CheckValue:
    return CheckValue(check_id=check_id, kind=MetricKind.CONTINUOUS, state=CheckState.PASSED, value=value)


def binary(check_id: str, passed: bool) -> CheckValue:
    state = CheckState.PASSED if passed else CheckState.FAILED
    return CheckValue(check_id=check_id, kind=MetricKind.BINARY, state=state, value=1.0 if passed else 0.0)


def source(
    question: Question | None,
    attempts: Sequence[AttemptRecord],
    *,
    variants: Sequence[VariantPlanRecord] = (variant(GPT),),
    checks: Sequence[CheckPlan] = (),
    split: SeriesSplit = SeriesSplit.HOLDOUT,
    repeats: int = 1,
) -> AnalysisInput:
    names = tuple(dict.fromkeys(record.case_name for record in attempts))
    return AnalysisInput(
        series_id=SERIES,
        question=question,
        split=split,
        status=SeriesStatus.DONE,
        stop=StopCause.COMPLETED,
        inputs_changed=False,
        variants=tuple(variants),
        checks=tuple(checks),
        repeats=repeats,
        case_names=names,
        attempts=tuple(attempts),
    )


def rate_attempts(variant_id: VariantId, successes: int, size: int, check: str = "promises") -> list[AttemptRecord]:
    return [
        attempt(variant_id, f"case_{index:03d}", checks=[binary(check, index < successes)]) for index in range(size)
    ]


def threshold(
    metric: str = "promises", above: float = 0.80, margin: float = 0.02, only: VariantId | None = None
) -> ThresholdQuestion:
    return ThresholdQuestion(kind="threshold", metric=metric, above=above, margin=margin, variant=only)


def noninferior_source(split: SeriesSplit = SeriesSplit.HOLDOUT, *, validated: bool = True) -> AnalysisInput:
    question = NoninferiorQuestion(
        kind="noninferior",
        baseline=GPT,
        candidate=MISTRAL,
        primary="critique",
        margin=0.05,
        guardrails=[Guardrail(metric="cost_of_pass", margin=0.2, relative=True)],
    )
    attempts = [
        attempt(name, f"case_{index:02d}", checks=[score("critique", value)])
        for name, scores in ((GPT, BASELINE_SCORES), (MISTRAL, CANDIDATE_SCORES))
        for index, value in enumerate(scores)
    ]
    return source(
        question,
        attempts,
        variants=(variant(GPT, VariantRole.BASELINE), variant(MISTRAL, VariantRole.CANDIDATE)),
        checks=(check_plan("critique", MetricKind.CONTINUOUS, judge=True, validated=validated),),
        split=split,
    )


def verdict_of(analysis: SeriesAnalysis) -> tuple[VerdictState, VerdictReason | None]:
    assert analysis.verdict is not None
    return analysis.verdict.state, analysis.verdict.reason


def test_noninferior_confirmed_statement_matches_the_finding_example() -> None:
    analysis = ANALYST.analyze(noninferior_source())

    primary, guardrail = analysis.contrasts
    assert primary.difference.method is StatMethod.PAIRED_T
    assert primary.difference.value == pytest.approx(-0.019167, abs=1e-6)
    assert primary.difference.p_value == pytest.approx(0.022482, abs=1e-6)
    assert primary.difference.p_adjusted == pytest.approx(0.022482, abs=1e-6)
    assert (primary.verdict, guardrail.verdict) == (CellVerdict.PASS, CellVerdict.PASS)
    assert guardrail.margin_abs == pytest.approx(0.2 * 0.001)
    assert analysis.verdict is not None
    assert analysis.verdict.state is VerdictState.CONFIRMED
    assert analysis.verdict.text == (
        "mistral vs gpt on critique: -0.019 (95% CI -0.035 to -0.003): "
        "not worse by more than the 0.05 margin; guardrail cost_of_pass holds."
    )


def test_matrix_columns_follow_the_studio_order() -> None:
    analysis = ANALYST.analyze(noninferior_source())

    columns = [(column.metric, column.role) for column in analysis.matrix.columns]
    assert columns == [
        ("critique", MetricRole.PRIMARY),
        ("cost_of_pass", MetricRole.GUARDRAIL),
        ("success_rate", MetricRole.BUILTIN),
        ("cost_usd", MetricRole.BUILTIN),
        ("latency_p50_ms", MetricRole.BUILTIN),
        ("latency_p95_ms", MetricRole.BUILTIN),
        ("schema_valid_first_try", MetricRole.BUILTIN),
        ("infra_error_rate", MetricRole.BUILTIN),
    ]
    guardrail = analysis.matrix.columns[1]
    assert (guardrail.margin, guardrail.relative, guardrail.direction) == (0.2, True, MetricDirection.LOWER_IS_BETTER)


def test_pair_cells_mark_the_reference_and_the_candidate() -> None:
    analysis = ANALYST.analyze(noninferior_source())

    baseline, candidate = analysis.matrix.rows
    assert [cell.verdict for cell in baseline.cells[:3]] == [
        CellVerdict.REFERENCE,
        CellVerdict.REFERENCE,
        CellVerdict.NONE,
    ]
    assert [cell.verdict for cell in candidate.cells[:3]] == [CellVerdict.PASS, CellVerdict.PASS, CellVerdict.NONE]
    assert baseline.cells[0].value == pytest.approx(0.6825)
    assert baseline.cells[0].method is StatMethod.T_CASE_MEANS


def test_dev_series_only_signals() -> None:
    analysis = ANALYST.analyze(noninferior_source(SeriesSplit.DEV))

    assert verdict_of(analysis) == (VerdictState.SIGNAL, VerdictReason.DEV_SPLIT)
    assert analysis.verdict is not None
    assert analysis.verdict.text.startswith("Signal on dev, not a finding: mistral vs gpt on critique: -0.019")


def test_unvalidated_judge_only_signals() -> None:
    analysis = ANALYST.analyze(noninferior_source(validated=False))

    assert verdict_of(analysis) == (VerdictState.SIGNAL, VerdictReason.JUDGE_NOT_VALIDATED)
    assert analysis.verdict is not None
    assert analysis.verdict.text.startswith("Signal only, judge critique is not validated: mistral vs gpt")


def test_dev_rule_comes_before_the_judge_rule() -> None:
    analysis = ANALYST.analyze(noninferior_source(SeriesSplit.DEV, validated=False))

    assert verdict_of(analysis) == (VerdictState.SIGNAL, VerdictReason.DEV_SPLIT)


def test_look_has_no_verdict_and_no_cell_verdicts() -> None:
    attempts = rate_attempts(GPT, 8, 10)

    analysis = ANALYST.analyze(
        source(LookQuestion(kind="look"), attempts, checks=(check_plan("promises", MetricKind.BINARY),))
    )

    assert analysis.verdict is None
    assert {cell.verdict for row in analysis.matrix.rows for cell in row.cells} == {CellVerdict.NONE}
    assert analysis.matrix.columns[0].role is MetricRole.CHECK
    assert ANALYST.analyze(source(None, attempts)).verdict is None


def test_look_verdict_stays_empty_even_when_cancelled() -> None:
    base = source(LookQuestion(kind="look"), rate_attempts(GPT, 8, 10))

    assert ANALYST.analyze(replace(base, status=SeriesStatus.CANCELLED)).verdict is None


def test_threshold_confirmed_refuted_and_inconclusive() -> None:
    checks = (check_plan("promises", MetricKind.BINARY),)

    confirmed = ANALYST.analyze(source(threshold(), rate_attempts(GPT, 90, 100), checks=checks))
    refuted = ANALYST.analyze(source(threshold(), rate_attempts(GPT, 18, 30), checks=checks))
    unclear = ANALYST.analyze(source(threshold(), rate_attempts(GPT, 27, 30), checks=checks))

    assert verdict_of(confirmed) == (VerdictState.CONFIRMED, None)
    assert verdict_of(refuted) == (VerdictState.REFUTED, None)
    assert verdict_of(unclear) == (VerdictState.INCONCLUSIVE, VerdictReason.BELOW_MDE)
    assert confirmed.thresholds[0].estimate.low == pytest.approx(0.8256, abs=5e-5)
    assert unclear.verdict is not None
    assert unclear.verdict.text == (
        "gpt: promises is 0.90 (95% CI 0.74 to 0.97) against above 0.8 with margin 0.02: too wide to decide."
    )


def test_threshold_cells_carry_the_one_sided_p_and_the_bh_adjustment() -> None:
    analysis = ANALYST.analyze(
        source(threshold(), rate_attempts(GPT, 90, 100), checks=(check_plan("promises", MetricKind.BINARY),))
    )

    cell = analysis.thresholds[0]
    assert cell.estimate.p_value is not None
    assert cell.estimate.p_adjusted == pytest.approx(min(1.0, 2 * cell.estimate.p_value))
    assert analysis.matrix.rows[0].cells[0].verdict is CellVerdict.PASS
    assert analysis.variants[0].metrics["promises"] == cell.estimate


def test_benjamini_hochberg_demotes_a_lone_passing_cell_in_a_family() -> None:
    checks = (check_plan("promises", MetricKind.BINARY),)
    attempts = rate_attempts(GPT, 21, 30) + rate_attempts(MISTRAL, 15, 30)
    variants = (variant(GPT), variant(MISTRAL))

    alone = ANALYST.analyze(
        source(threshold(above=0.5, margin=0.0, only=GPT), attempts, variants=variants, checks=checks)
    )
    family = ANALYST.analyze(source(threshold(above=0.5, margin=0.0), attempts, variants=variants, checks=checks))

    assert alone.thresholds[0].verdict is CellVerdict.PASS
    first, second = family.thresholds
    assert first.estimate.low is not None and first.estimate.low > 0.5
    assert first.estimate.p_adjusted is not None and first.estimate.p_adjusted > 0.05
    assert (first.verdict, second.verdict) == (CellVerdict.UNCLEAR, CellVerdict.UNCLEAR)
    assert family.matrix.rows[1].cells[0].verdict is CellVerdict.UNCLEAR


def test_threshold_only_tests_the_named_variant() -> None:
    checks = (check_plan("promises", MetricKind.BINARY),)
    attempts = rate_attempts(GPT, 90, 100) + rate_attempts(MISTRAL, 10, 100)
    variants = (variant(GPT), variant(MISTRAL))

    analysis = ANALYST.analyze(source(threshold(only=GPT), attempts, variants=variants, checks=checks))

    assert [cell.variant_id for cell in analysis.thresholds] == [GPT]
    assert analysis.matrix.rows[1].cells[0].verdict is CellVerdict.NONE
    assert verdict_of(analysis) == (VerdictState.CONFIRMED, None)


def test_threshold_with_several_variants_joins_phrases() -> None:
    checks = (check_plan("promises", MetricKind.BINARY),)
    attempts = rate_attempts(GPT, 90, 100) + rate_attempts(MISTRAL, 18, 30)
    variants = (variant(GPT), variant(MISTRAL))

    analysis = ANALYST.analyze(source(threshold(), attempts, variants=variants, checks=checks))

    assert verdict_of(analysis) == (VerdictState.REFUTED, None)
    assert analysis.verdict is not None
    assert analysis.verdict.text.count("; ") == 1
    assert "mistral: promises is 0.60" in analysis.verdict.text


def compare_source(
    baseline: Sequence[AttemptRecord], candidate: Sequence[AttemptRecord], guardrails: list[Guardrail] | None = None
) -> AnalysisInput:
    question = CompareQuestion(
        kind="compare", baseline=GPT, candidate=MISTRAL, primary="success_rate", margin=0.05, guardrails=guardrails
    )
    return source(question, [*baseline, *candidate], variants=(variant(GPT), variant(MISTRAL)))


def outcomes(variant_id: VariantId, passes: Sequence[bool], cost: str = "0.001") -> list[AttemptRecord]:
    return [attempt(variant_id, f"case_{index:03d}", passed=flag, cost=cost) for index, flag in enumerate(passes)]


def test_compare_with_all_cases_passing_is_uninformative() -> None:
    analysis = ANALYST.analyze(compare_source(outcomes(GPT, [True] * 12), outcomes(MISTRAL, [True] * 12)))

    assert verdict_of(analysis) == (VerdictState.INCONCLUSIVE, VerdictReason.UNINFORMATIVE)


def test_compare_with_equal_cases_has_no_discordance() -> None:
    mixed = [index % 2 == 0 for index in range(12)]

    analysis = ANALYST.analyze(compare_source(outcomes(GPT, mixed), outcomes(MISTRAL, mixed)))

    assert verdict_of(analysis) == (VerdictState.INCONCLUSIVE, VerdictReason.NO_DISCORDANCE)


def test_compare_confirmed_by_the_sign_test() -> None:
    baseline = outcomes(GPT, [False] * 9 + [True] * 21)
    candidate = outcomes(MISTRAL, [True] * 30)

    analysis = ANALYST.analyze(compare_source(baseline, candidate))

    primary = analysis.contrasts[0]
    assert primary.difference.method is StatMethod.EXACT_SIGN
    assert verdict_of(analysis) == (VerdictState.CONFIRMED, None)


def test_breaking_guardrail_refutes() -> None:
    baseline = outcomes(GPT, [False] * 9 + [True] * 21, cost="0.001")
    candidate = outcomes(MISTRAL, [True] * 30, cost="0.004")
    guardrails = [Guardrail(metric="cost_usd", margin=0.0005)]

    analysis = ANALYST.analyze(compare_source(baseline, candidate, guardrails))

    guardrail = analysis.contrasts[1]
    assert guardrail.difference.value == pytest.approx(-0.003)
    assert guardrail.verdict is CellVerdict.FAIL
    assert verdict_of(analysis) == (VerdictState.REFUTED, None)
    assert analysis.verdict is not None
    assert analysis.verdict.text.endswith("; guardrail cost_usd breaks.")


def test_relative_guardrail_without_a_baseline_value_is_unclear() -> None:
    baseline = outcomes(GPT, [False] * 30)
    candidate = outcomes(MISTRAL, [True] * 30)
    guardrails = [Guardrail(metric="cost_of_pass", margin=0.2, relative=True)]

    analysis = ANALYST.analyze(compare_source(baseline, candidate, guardrails))

    guardrail = analysis.contrasts[1]
    assert guardrail.margin_abs is None
    assert guardrail.verdict is CellVerdict.UNCLEAR
    assert verdict_of(analysis)[0] is VerdictState.INCONCLUSIVE


def test_rules_fire_in_order() -> None:
    base = noninferior_source()
    errors = [attempt(MISTRAL, f"broken_{index}", outcome=OutcomeClass.INFRA_ERROR, passed=None) for index in range(3)]
    broken = replace(base, attempts=(*base.attempts, *errors))

    everything = replace(broken, status=SeriesStatus.CANCELLED, stop=StopCause.BUDGET_CUT, inputs_changed=True)
    assert verdict_of(ANALYST.analyze(everything)) == (VerdictState.INVALID, VerdictReason.CANCELLED)
    failed = replace(everything, status=SeriesStatus.FAILED)
    assert verdict_of(ANALYST.analyze(failed)) == (VerdictState.INVALID, VerdictReason.INFRA_ERRORS)
    budget = replace(everything, status=SeriesStatus.DONE)
    assert verdict_of(ANALYST.analyze(budget)) == (VerdictState.INVALID, VerdictReason.BUDGET_CUT)
    changed = replace(budget, stop=StopCause.COMPLETED)
    assert verdict_of(ANALYST.analyze(changed)) == (VerdictState.INVALID, VerdictReason.INPUTS_CHANGED)
    infra = replace(changed, inputs_changed=False)
    assert verdict_of(ANALYST.analyze(infra)) == (VerdictState.INVALID, VerdictReason.INFRA_ERRORS)


def test_invalid_texts_count_attempts() -> None:
    base = noninferior_source()
    errors = [attempt(MISTRAL, f"broken_{index}", outcome=OutcomeClass.INFRA_ERROR, passed=None) for index in range(3)]
    broken = replace(base, attempts=(*base.attempts, *errors))

    infra = ANALYST.analyze(broken)
    cancelled = ANALYST.analyze(replace(base, status=SeriesStatus.CANCELLED))
    budget = ANALYST.analyze(replace(base, stop=StopCause.BUDGET_CUT))

    assert infra.infra_error_share == pytest.approx(3 / 27)
    assert infra.verdict is not None and infra.verdict.text == "No finding: 3 of 27 attempts hit infrastructure errors."
    assert cancelled.verdict is not None
    assert cancelled.verdict.text == "No finding: cancelled after 24 of 24 attempts."
    assert budget.verdict is not None
    assert budget.verdict.text == "No finding: the spend cap stopped the series after 24 of 24 attempts."


def test_a_series_failed_by_infrastructure_errors_names_them_whatever_stopped_it() -> None:
    base = noninferior_source()
    errors = tuple(
        attempt(variant, f"broken_{index}", outcome=OutcomeClass.INFRA_ERROR, passed=None)
        for variant in (GPT, MISTRAL)
        for index in range(3)
    )

    analysis = ANALYST.analyze(
        replace(base, attempts=errors, status=SeriesStatus.FAILED, stop=StopCause.BUDGET_CUT, inputs_changed=True)
    )

    assert verdict_of(analysis) == (VerdictState.INVALID, VerdictReason.INFRA_ERRORS)
    assert analysis.verdict is not None
    assert analysis.verdict.text == "No finding: 6 of 6 attempts hit infrastructure errors."


def test_infra_errors_at_the_limit_do_not_invalidate() -> None:
    base = noninferior_source()
    ok = [attempt(GPT, f"extra_{index}", checks=[score("critique", 0.7)]) for index in range(8)]
    errors = [attempt(MISTRAL, "extra_broken", outcome=OutcomeClass.INFRA_ERROR, passed=None)]

    analysis = ANALYST.analyze(replace(base, attempts=(*base.attempts, *ok, *errors)))

    assert analysis.infra_error_share == pytest.approx(1 / 33)
    assert verdict_of(analysis)[0] is VerdictState.CONFIRMED


def test_primary_without_data_is_invalid() -> None:
    attempts = [attempt(GPT, f"case_{index}") for index in range(10)]

    analysis = ANALYST.analyze(source(threshold(), attempts, checks=(check_plan("promises", MetricKind.BINARY),)))

    assert verdict_of(analysis) == (VerdictState.INVALID, VerdictReason.NO_DATA)
    assert analysis.verdict is not None
    assert analysis.verdict.text == "No finding: the primary metric has no data."


def test_running_and_cancelled_attempts_are_not_counted() -> None:
    attempts = [
        *rate_attempts(GPT, 9, 10),
        attempt(GPT, "late", state=AttemptState.RUNNING),
        attempt(GPT, "stopped", outcome=OutcomeClass.CANCELLED, passed=None),
    ]

    analysis = ANALYST.analyze(source(LookQuestion(kind="look"), attempts))

    aggregates = analysis.variants[0]
    assert (aggregates.cases, aggregates.attempts, aggregates.counted) == (11, 11, 10)
    assert aggregates.metrics["success_rate"].attempts == 10
    assert aggregates.metrics["infra_error_rate"].attempts == 10


def repeated_attempts() -> list[AttemptRecord]:
    successes = (5, 2, 4, 0, 3)
    return [
        attempt(
            GPT,
            f"case_{case}",
            repeat,
            passed=repeat <= passed,
            runtime=[RuntimeCheckTry(check="valid_json", failed_first_try=repeat == 1 and case == 0)],
            latency=1000 + 10 * case + repeat,
            models={"reply": "openrouter:openai/gpt-oss-20b", "route": "openrouter:mistralai/mistral-nemo"},
        )
        for case, passed in enumerate(successes)
        for repeat in range(1, 6)
    ]


def test_repeats_give_pass_k_stability_and_icc() -> None:
    analysis = ANALYST.analyze(source(LookQuestion(kind="look"), repeated_attempts(), repeats=5))

    aggregates = analysis.variants[0]
    assert aggregates.pass_k == pytest.approx(0.2)
    assert aggregates.stability == Stability(always=1, never=1, flaky=3)
    assert aggregates.icc is not None and 0 <= aggregates.icc <= 1
    assert aggregates.metrics["success_rate"].value == pytest.approx(0.56)
    assert aggregates.metrics["success_rate"].method is StatMethod.KISH_WILSON
    assert aggregates.models == ("openrouter:mistralai/mistral-nemo", "openrouter:openai/gpt-oss-20b")
    assert aggregates.spend_usd == Decimal("0.0375")
    runtime = aggregates.runtime_checks["valid_json"]
    assert (runtime.cases, runtime.attempts, runtime.method) == (5, 25, StatMethod.BETA_BINOMIAL)


def test_single_repeat_has_no_repeat_aggregates() -> None:
    analysis = ANALYST.analyze(source(LookQuestion(kind="look"), rate_attempts(GPT, 8, 10)))

    aggregates = analysis.variants[0]
    assert (aggregates.pass_k, aggregates.icc, aggregates.stability) == (None, None, None)


def test_latency_tail_needs_twenty_attempts() -> None:
    analysis = ANALYST.analyze(source(LookQuestion(kind="look"), repeated_attempts(), repeats=5))

    metrics = analysis.variants[0].metrics
    assert metrics["latency_p95_ms"].degenerate is None
    assert metrics["latency_p50_ms"].method is StatMethod.BOOTSTRAP_QUANTILE
    short = ANALYST.analyze(source(LookQuestion(kind="look"), rate_attempts(GPT, 8, 10)))
    assert short.variants[0].metrics["latency_p95_ms"].degenerate is not None


def test_analysis_is_deterministic() -> None:
    first = ANALYST.analyze(noninferior_source())
    second = ANALYST.analyze(noninferior_source())

    assert first == second
