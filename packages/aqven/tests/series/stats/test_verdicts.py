import pytest

from aqven.series.model import Estimate, Stability
from aqven.series.stats.repeats import pass_hat_k, stability_of
from aqven.series.stats.samples import Bound, RateSamples
from aqven.series.stats.verdicts import guardrail_verdict, pair_verdict, threshold_verdict
from aqven.spec import CellVerdict


def interval(low: float | None, high: float | None) -> Estimate:
    return Estimate(value=None, low=low, high=high, method=None, cases=30, attempts=30)


@pytest.mark.parametrize(
    ("low", "high", "verdict"),
    [
        (0.7438, 0.9654, CellVerdict.UNCLEAR),
        (0.8256, 0.9448, CellVerdict.PASS),
        (0.4232, 0.7541, CellVerdict.FAIL),
    ],
)
def test_threshold_above_matches_the_reference(low: float, high: float, verdict: CellVerdict) -> None:
    assert threshold_verdict(interval(low, high), Bound(side="above", value=0.80, margin=0.02)) is verdict


@pytest.mark.parametrize(
    ("low", "high", "verdict"),
    [
        (0.01, 0.05, CellVerdict.PASS),
        (0.09, 0.2, CellVerdict.FAIL),
        (0.05, 0.12, CellVerdict.UNCLEAR),
    ],
)
def test_threshold_below_mirrors(low: float, high: float, verdict: CellVerdict) -> None:
    assert threshold_verdict(interval(low, high), Bound(side="below", value=0.10, margin=0.02)) is verdict


def test_bound_edge() -> None:
    assert Bound(side="above", value=0.8, margin=0.02).edge == pytest.approx(0.82)
    assert Bound(side="below", value=0.1, margin=0.02).edge == pytest.approx(0.08)


@pytest.mark.parametrize(
    ("low", "high", "verdict"),
    [
        (0.09, 0.27, CellVerdict.PASS),
        (-0.03, 0.04, CellVerdict.FAIL),
        (-0.02, 0.12, CellVerdict.UNCLEAR),
    ],
)
def test_compare_matches_the_reference(low: float, high: float, verdict: CellVerdict) -> None:
    assert pair_verdict(interval(low, high), "compare", 0.05) is verdict


@pytest.mark.parametrize(
    ("low", "high", "verdict"),
    [
        (-0.035070, -0.003263, CellVerdict.PASS),
        (-0.2, -0.06, CellVerdict.FAIL),
        (-0.08, 0.02, CellVerdict.UNCLEAR),
    ],
)
def test_noninferior_and_guardrail_share_the_rule(low: float, high: float, verdict: CellVerdict) -> None:
    assert pair_verdict(interval(low, high), "noninferior", 0.05) is verdict
    assert guardrail_verdict(interval(low, high), 0.05) is verdict


def test_missing_bounds_do_not_decide() -> None:
    bound = Bound(side="above", value=0.8, margin=0.0)

    assert threshold_verdict(interval(None, None), bound) is CellVerdict.UNCLEAR
    assert threshold_verdict(interval(0.9, None), bound) is CellVerdict.PASS
    assert threshold_verdict(interval(None, 0.7), bound) is CellVerdict.FAIL


def test_pass_hat_k_matches_the_reference() -> None:
    cases = RateSamples(cases=tuple((passed, 5) for passed in (5, 2, 4, 0, 3)))

    assert pass_hat_k(cases, 1) == pytest.approx(0.56)
    assert pass_hat_k(cases, 2) == pytest.approx(0.4)
    assert pass_hat_k(cases, 3) == pytest.approx(0.3)


def test_pass_hat_k_skips_cases_with_fewer_attempts() -> None:
    cases = RateSamples(cases=((3, 3), (1, 2)))

    assert pass_hat_k(cases, 3) == pytest.approx(1.0)
    assert pass_hat_k(RateSamples(cases=((1, 2),)), 3) is None


def test_stability_classes_cases_with_two_attempts_or_more() -> None:
    cases = RateSamples(cases=((3, 3), (0, 3), (1, 3), (2, 2), (1, 1), (0, 1)))

    assert stability_of(cases) == Stability(always=2, never=1, flaky=1)
