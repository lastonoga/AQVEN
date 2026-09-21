from typing import Final

from test_evals_gate import gate_spec, request, series

from aqven.evals import GateDecision, PairedStatistics, build_gate
from aqven.spec import MetricKind

STATISTICS: Final = PairedStatistics()
SIZE: Final = 12


def grades(value: float) -> list[float]:
    return [value] * SIZE


def test_a_clear_improvement_passes_the_gate() -> None:
    rows = series("grade", "primary", grades(0.40), grades(0.80))

    report = build_gate(request(rows, size=SIZE), STATISTICS)

    row = report.per_test[0]
    assert (report.decision, row.p_adj is not None and row.p_adj < 0.05) == (GateDecision.PASS, True)
    assert row.delta > 0 and row.ci_lo > 0


def test_a_clear_regression_blocks_the_gate() -> None:
    rows = series("grade", "primary", grades(0.80), grades(0.40))

    report = build_gate(request(rows, size=SIZE), STATISTICS)

    assert report.decision is GateDecision.BLOCK
    assert report.per_test[0].delta < 0


def test_the_same_series_give_the_same_numbers() -> None:
    rows = series("grade", "primary", [0.3, 0.5, 0.4, 0.6] * 3, [0.4, 0.5, 0.7, 0.6] * 3)

    first = build_gate(request(rows, size=SIZE), STATISTICS)
    second = build_gate(request(rows, size=SIZE), STATISTICS)

    assert first.per_test[0].model_dump() == second.per_test[0].model_dump()


def test_a_binary_scorer_uses_the_exact_test() -> None:
    rows = series("filled", "primary", grades(0.0), grades(1.0), kind=MetricKind.BINARY)

    report = build_gate(request(rows, size=SIZE, spec=gate_spec(primary=("filled",))), STATISTICS)

    row = report.per_test[0]
    assert (row.method, row.n_discordant) == ("mcnemar_exact", SIZE)
    assert row.p_raw is not None and row.p_raw < 0.05
