from collections.abc import Sequence
from typing import Final

from evals_harness import FakeStatistics

from aqven.evals import GateDecision, GateFamily, GateRequest, ScorerSeries, build_gate
from aqven.spec import (
    BootstrapSpec,
    GateAction,
    GateActions,
    GateFamilies,
    GateSpec,
    MetricKind,
)

BOOTSTRAP: Final = BootstrapSpec(method="BCa", resamples=100, seed=7)
MARGIN: Final = 0.01


def gate_spec(
    primary: Sequence[str] = ("grade",),
    secondary: Sequence[str] = (),
    safety: Sequence[str] = (),
    min_dataset: int = 2,
    min_discordant: int = 0,
    max_dropped_ratio: float = 0.5,
) -> GateSpec:
    return GateSpec(
        baseline="production",
        repeats=1,
        min_dataset=min_dataset,
        min_discordant=min_discordant,
        families=GateFamilies(primary=list(primary), secondary=list(secondary) or None, safety=list(safety) or None),
        alpha_primary=0.05,
        q_secondary=0.1,
        alpha_safety=0.05,
        ni_margin=MARGIN,
        bootstrap=BOOTSTRAP,
        max_dropped_ratio=max_dropped_ratio,
        actions=GateActions.model_validate(
            {
                "pass": GateAction.RELEASE,
                "warn": GateAction.REQUIRE_APPROVAL,
                "block": GateAction.REJECT,
                "gate_unavailable": GateAction.REJECT,
            }
        ),
    )


def series(
    scorer_id: str,
    family: GateFamily,
    baseline: Sequence[float],
    candidate: Sequence[float],
    kind: MetricKind = MetricKind.CONTINUOUS,
) -> ScorerSeries:
    return ScorerSeries(
        scorer_id=scorer_id,
        kind=kind,
        family=family,
        baseline=tuple(baseline),
        candidate=tuple(candidate),
    )


def request(
    *rows: ScorerSeries, spec: GateSpec | None = None, size: int = 4, dropped: Sequence[str] = ()
) -> GateRequest:
    return GateRequest(
        spec=spec or gate_spec(),
        series=rows,
        dataset_size=size,
        dropped_cases=tuple(dropped),
        spec_a_hash="a",
        spec_b_hash="b",
        seeds=(1,),
    )


def test_a_gate_without_statistics_is_unavailable_and_never_passes() -> None:
    report = build_gate(request(series("grade", "primary", [0.1] * 4, [0.5] * 4)), None)

    assert report.decision is GateDecision.GATE_UNAVAILABLE
    assert (report.reason_code, report.per_test) == ("statistics_unavailable", ())
    assert report.content_hash.startswith("sha256-")


def test_a_dataset_below_the_minimum_is_unavailable() -> None:
    rows = series("grade", "primary", [0.1] * 4, [0.5] * 4)

    report = build_gate(request(rows, spec=gate_spec(min_dataset=10)), FakeStatistics())

    assert (report.decision, report.reason_code) == (GateDecision.GATE_UNAVAILABLE, "dataset_too_small")


def test_too_many_dropped_cases_are_unavailable() -> None:
    rows = series("grade", "primary", [0.1] * 4, [0.5] * 4)

    report = build_gate(request(rows, size=4, dropped=("a", "b", "c")), FakeStatistics())

    assert (report.decision, report.reason_code) == (GateDecision.GATE_UNAVAILABLE, "too_many_dropped")


def test_a_binary_primary_without_enough_discordant_pairs_is_unavailable() -> None:
    rows = series("grade", "primary", [1.0] * 4, [1.0] * 4, MetricKind.BINARY)

    report = build_gate(request(rows, spec=gate_spec(min_discordant=25)), FakeStatistics())

    assert (report.decision, report.reason_code) == (GateDecision.GATE_UNAVAILABLE, "insufficient_discordant")


def test_an_improvement_above_the_interval_passes() -> None:
    rows = series("grade", "primary", [0.1] * 4, [0.5] * 4)

    report = build_gate(request(rows), FakeStatistics())
    (row,) = report.per_test

    assert (report.decision, report.reason_code) == (GateDecision.PASS, None)
    assert (row.family, row.wins, row.losses, row.ties) == ("primary", 4, 0, 0)
    assert row.delta == 0.4 and row.ci_lo > 0 and row.p_adj == 0.01 and row.method == "fake-bca"


def test_a_primary_metric_that_did_not_move_blocks() -> None:
    rows = series("grade", "primary", [0.4] * 4, [0.4] * 4)

    report = build_gate(request(rows), FakeStatistics())

    assert (report.decision, report.reason_code) == (GateDecision.BLOCK, "no_significant_improvement")


def test_a_primary_metric_the_correction_rejects_blocks() -> None:
    rows = (
        series("grade", "primary", [0.1] * 4, [0.5] * 4),
        series("other", "primary", [0.1] * 4, [0.5] * 4),
    )

    report = build_gate(request(*rows), FakeStatistics(p_value=0.04))

    assert (report.decision, report.reason_code) == (GateDecision.BLOCK, "no_significant_improvement")


def test_a_safety_metric_below_the_margin_blocks() -> None:
    rows = (
        series("grade", "primary", [0.1] * 4, [0.5] * 4),
        series("filled", "safety", [1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 0.0, 0.0], MetricKind.BINARY),
    )

    report = build_gate(request(*rows), FakeStatistics())
    safety = next(row for row in report.per_test if row.family == "safety")

    assert (report.decision, report.reason_code) == (GateDecision.BLOCK, "regression_on_safety_metric")
    assert safety.n_discordant == 2 and safety.verdict is GateDecision.BLOCK


def test_a_secondary_regression_warns_but_does_not_block() -> None:
    rows = (
        series("grade", "primary", [0.1] * 4, [0.5] * 4),
        series("tone", "secondary", [0.6] * 4, [0.4] * 4),
    )

    report = build_gate(request(*rows, spec=gate_spec(secondary=["tone"])), FakeStatistics())
    secondary = next(row for row in report.per_test if row.family == "secondary")

    assert (report.decision, report.reason_code) == (GateDecision.WARN, "side_regression")
    assert secondary.q_adj == 0.01 and secondary.delta < 0


def test_the_report_hash_is_stable_for_the_same_inputs() -> None:
    rows = series("grade", "primary", [0.1] * 4, [0.5] * 4)

    first = build_gate(request(rows), FakeStatistics())
    second = build_gate(request(rows), FakeStatistics())

    assert first.content_hash == second.content_hash
    assert first.gate_config_hash == second.gate_config_hash
