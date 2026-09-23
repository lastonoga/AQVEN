import pytest

from aqven.series.model import Contrast, DegenerateReason, Estimate, MetricUnit, StatMethod, ThresholdCell
from aqven.series.stats.wording import (
    budget_cut_text,
    cancelled_text,
    dev_signal,
    infra_errors_text,
    inputs_changed_text,
    no_data_text,
    number,
    pair_measurement,
    sentence,
    threshold_measurement,
    unvalidated_signal,
)
from aqven.spec import CellVerdict, MetricDirection, VariantId


def estimate(
    value: float | None, low: float | None, high: float | None, degenerate: DegenerateReason | None = None
) -> Estimate:
    method = None if degenerate is not None else StatMethod.PAIRED_T
    return Estimate(value=value, low=low, high=high, method=method, cases=12, attempts=72, degenerate=degenerate)


def threshold_cell(variant: str, value: float, low: float, high: float, verdict: CellVerdict) -> ThresholdCell:
    return ThresholdCell(
        metric="promises",
        variant_id=VariantId(variant),
        bound="above",
        threshold=0.97,
        margin=0.01,
        estimate=estimate(value, low, high),
        verdict=verdict,
    )


def contrast(metric: str, role: str, difference: Estimate, verdict: CellVerdict, margin: float = 0.05) -> Contrast:
    return Contrast.model_validate(
        {
            "metric": metric,
            "role": role,
            "baseline": "gpt",
            "candidate": "mistral",
            "direction": MetricDirection.HIGHER_IS_BETTER,
            "margin": margin,
            "relative": False,
            "margin_abs": margin,
            "difference": difference,
            "verdict": verdict,
        }
    )


def test_threshold_statement_matches_the_findings_example() -> None:
    cell = threshold_cell("gpt", 0.99, 0.98, 0.9989, CellVerdict.PASS)

    text = sentence(threshold_measurement([cell], MetricUnit.RATE))

    assert text == (
        "gpt: promises is 0.99 (95% CI 0.98 to 1.00) against above 0.97 with margin 0.01: "
        "clears the bound by more than the margin."
    )


def test_threshold_tails_and_variants_join_with_semicolons() -> None:
    cells = [
        threshold_cell("gpt", 0.95, 0.9, 0.97, CellVerdict.FAIL),
        threshold_cell("mistral", 0.96, 0.9, 0.99, CellVerdict.UNCLEAR),
    ]

    assert sentence(threshold_measurement(cells, MetricUnit.RATE)) == (
        "gpt: promises is 0.95 (95% CI 0.90 to 0.97) against above 0.97 with margin 0.01: "
        "stays within the margin of the bound or on its wrong side; "
        "mistral: promises is 0.96 (95% CI 0.90 to 0.99) against above 0.97 with margin 0.01: too wide to decide."
    )


def test_noninferior_statement_matches_the_finding_example() -> None:
    primary = contrast("critique", "primary", estimate(-0.019167, -0.03507, -0.003263), CellVerdict.PASS)
    guardrail = contrast("cost_of_pass", "guardrail", estimate(0.0, 0.0, 0.0), CellVerdict.PASS, 0.2)

    text = sentence(pair_measurement("noninferior", primary, MetricUnit.SCORE, [guardrail]))

    assert text == (
        "mistral vs gpt on critique: -0.019 (95% CI -0.035 to -0.003): "
        "not worse by more than the 0.05 margin; guardrail cost_of_pass holds."
    )


@pytest.mark.parametrize(
    ("kind", "verdict", "tail"),
    [
        ("compare", CellVerdict.PASS, "better by more than the 0.05 margin"),
        ("compare", CellVerdict.FAIL, "the effect is within ±0.05 or reversed"),
        ("compare", CellVerdict.UNCLEAR, "too wide to decide at the 0.05 margin"),
        ("noninferior", CellVerdict.FAIL, "worse by more than the 0.05 margin"),
        ("noninferior", CellVerdict.UNCLEAR, "too wide to decide at the 0.05 margin"),
    ],
)
def test_pair_tails(kind: str, verdict: CellVerdict, tail: str) -> None:
    primary = contrast("success_rate", "primary", estimate(0.12, 0.05, 0.2), verdict)

    text = pair_measurement("compare" if kind == "compare" else "noninferior", primary, MetricUnit.RATE, [])

    assert text == f"mistral vs gpt on success_rate: +0.12 (95% CI +0.05 to +0.20): {tail}"


def test_guardrail_words() -> None:
    primary = contrast("success_rate", "primary", estimate(0.12, 0.05, 0.2), CellVerdict.PASS)
    breaking = contrast("cost_usd", "guardrail", estimate(-0.001, -0.002, -0.0015), CellVerdict.FAIL)
    unsettled = contrast(
        "latency_p95_ms",
        "guardrail",
        estimate(None, None, None, DegenerateReason.TOO_FEW_ATTEMPTS),
        CellVerdict.UNCLEAR,
    )

    text = pair_measurement("compare", primary, MetricUnit.RATE, [breaking, unsettled])

    assert text.endswith("; guardrail cost_usd breaks; guardrail latency_p95_ms is unsettled")


def test_degenerate_intervals_say_why() -> None:
    primary = contrast(
        "success_rate", "primary", estimate(0.0, None, None, DegenerateReason.NO_DISCORDANCE), CellVerdict.UNCLEAR
    )

    assert pair_measurement("compare", primary, MetricUnit.RATE, []) == (
        "mistral vs gpt on success_rate: +0.00 (no 95% CI: the variants agree on every case): "
        "too wide to decide at the 0.05 margin"
    )


@pytest.mark.parametrize(
    ("value", "unit", "signed", "text"),
    [
        (0.8, MetricUnit.RATE, False, "0.80"),
        (0.1234, MetricUnit.SCORE, False, "0.123"),
        (3.26, MetricUnit.ORDINAL, False, "3.3"),
        (0.0012, MetricUnit.USD, False, "$0.0012"),
        (0.00136552, MetricUnit.USD, False, "$0.001366"),
        (12.3456, MetricUnit.USD, False, "$12.35"),
        (1200.0, MetricUnit.USD, False, "$1200"),
        (-0.0003, MetricUnit.USD, True, "-$0.0003"),
        (0.0003, MetricUnit.USD, True, "+$0.0003"),
        (0.0, MetricUnit.USD, False, "$0"),
        (1234.4, MetricUnit.MS, False, "1234"),
        (-15.6, MetricUnit.MS, True, "-16"),
        (0.05, MetricUnit.RATE, True, "+0.05"),
        (None, MetricUnit.RATE, False, "n/a"),
    ],
)
def test_number_formats(value: float | None, unit: MetricUnit, signed: bool, text: str) -> None:
    assert number(value, unit, signed) == text


def test_open_bound() -> None:
    cell = ThresholdCell(
        metric="cost_of_pass",
        variant_id=VariantId("gpt"),
        bound="below",
        threshold=0.002,
        margin=0.0,
        estimate=estimate(0.0013, 0.0011, None),
        verdict=CellVerdict.UNCLEAR,
    )

    assert threshold_measurement([cell], MetricUnit.USD) == (
        "gpt: cost_of_pass is $0.0013 (95% CI $0.0011 to unbounded) against below 0.002 with margin 0: "
        "too wide to decide"
    )


def test_signal_and_invalid_sentences() -> None:
    assert dev_signal("m") == "Signal on dev, not a finding: m."
    assert unvalidated_signal("critique", "m") == "Signal only, judge critique is not validated: m."
    assert cancelled_text(5, 24) == "No finding: cancelled after 5 of 24 attempts."
    assert budget_cut_text(9, 24) == "No finding: the spend cap stopped the series after 9 of 24 attempts."
    assert inputs_changed_text("flows") == "No finding: inputs changed during the series (flows)."
    assert infra_errors_text(3, 24) == "No finding: 3 of 24 attempts hit infrastructure errors."
    assert no_data_text() == "No finding: the primary metric has no data."
