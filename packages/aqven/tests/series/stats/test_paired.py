import numpy as np
import pytest

from aqven.series.model import DegenerateReason, StatMethod
from aqven.series.stats.samples import (
    MeanSamples,
    QuantileSamples,
    RateSamples,
    RatioSamples,
    ShapeMismatch,
    StatConfig,
)
from aqven.series.stats.strategies import paired
from aqven.series.stats.verdicts import pair_verdict
from aqven.spec import CellVerdict, MetricDirection

CONFIG = StatConfig(seed=20260923)
HIGHER = MetricDirection.HIGHER_IS_BETTER
LOWER = MetricDirection.LOWER_IS_BETTER
BASELINE_SCORES = (0.62, 0.71, 0.55, 0.80, 0.68, 0.74, 0.59, 0.66, 0.77, 0.70, 0.64, 0.73)
CANDIDATE_SCORES = (0.60, 0.73, 0.50, 0.79, 0.66, 0.70, 0.61, 0.60, 0.76, 0.69, 0.60, 0.72)


def means(scores: tuple[float, ...]) -> MeanSamples:
    return MeanSamples(cases=tuple((score,) for score in scores))


def sign_samples(wins: int, losses: int, ties: int) -> tuple[RateSamples, RateSamples]:
    baseline = ((0, 1),) * wins + ((1, 1),) * losses + ((1, 1),) * ties
    candidate = ((1, 1),) * wins + ((0, 1),) * losses + ((1, 1),) * ties
    return RateSamples(cases=baseline), RateSamples(cases=candidate)


def test_paired_t_matches_the_reference() -> None:
    estimate = paired(means(BASELINE_SCORES), means(CANDIDATE_SCORES), HIGHER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_T
    assert estimate.value == pytest.approx(-0.019167, abs=1e-6)
    assert estimate.low == pytest.approx(-0.035070, abs=1e-6)
    assert estimate.high == pytest.approx(-0.003263, abs=1e-6)
    assert estimate.p_value == pytest.approx(0.022482, abs=1e-6)
    assert (estimate.cases, estimate.attempts) == (12, 24)
    assert pair_verdict(estimate, "noninferior", 0.05) is CellVerdict.PASS


def test_lower_is_better_flips_the_sign() -> None:
    estimate = paired(means(BASELINE_SCORES), means(CANDIDATE_SCORES), LOWER, CONFIG)

    assert estimate.value == pytest.approx(0.019167, abs=1e-6)
    assert estimate.low == pytest.approx(0.003263, abs=1e-6)
    assert estimate.high == pytest.approx(0.035070, abs=1e-6)


def test_constant_nonzero_difference_gives_a_zero_width_interval() -> None:
    estimate = paired(means((0.25,) * 8), means((0.5,) * 8), HIGHER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_T
    assert (estimate.value, estimate.low, estimate.high) == (0.25, 0.25, 0.25)
    assert estimate.p_value == 0.0


def test_exact_sign_matches_the_reference() -> None:
    baseline, candidate = sign_samples(wins=7, losses=2, ties=21)

    estimate = paired(baseline, candidate, HIGHER, CONFIG)

    assert estimate.method is StatMethod.EXACT_SIGN
    assert estimate.p_value == pytest.approx(0.179688, abs=1e-6)
    assert estimate.low == pytest.approx(-0.060056, abs=1e-6)
    assert estimate.high == pytest.approx(0.283113, abs=1e-6)
    assert estimate.value == pytest.approx(5 / 30)
    assert estimate.cases == 30


def test_ten_discordant_cases_leave_the_sign_test() -> None:
    baseline, candidate = sign_samples(wins=7, losses=3, ties=20)

    assert paired(baseline, candidate, HIGHER, CONFIG).method is StatMethod.PAIRED_T


def test_paired_bca_from_fifty_cases() -> None:
    spread = np.linspace(-0.3, 0.5, 60) ** 3 + 0.02
    baseline = MeanSamples(cases=((0.0,),) * 60)
    candidate = MeanSamples(cases=tuple((float(value),) for value in spread))

    estimate = paired(baseline, candidate, HIGHER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_BCA
    assert estimate.value == pytest.approx(0.037542, abs=1e-6)
    assert estimate.low == pytest.approx(0.029650, abs=1e-6)
    assert estimate.high == pytest.approx(0.047622, abs=1e-6)
    assert estimate.p_value == pytest.approx(2 / 10000)


def test_paired_bca_falls_back_to_t_on_nan() -> None:
    baseline = MeanSamples(cases=((0.2,),) * 60)
    candidate = MeanSamples(cases=((0.7,),) * 60)

    estimate = paired(baseline, candidate, HIGHER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_T
    assert estimate.low == estimate.high == pytest.approx(0.5)


def test_only_cases_with_data_on_both_sides_are_paired() -> None:
    baseline = RateSamples(cases=((1, 2), (0, 0), (2, 2), (1, 2)))
    candidate = RateSamples(cases=((2, 2), (1, 1), (0, 0), (2, 2)))

    estimate = paired(baseline, candidate, HIGHER, CONFIG)

    assert estimate.cases == 2
    assert estimate.attempts == 8
    assert estimate.value == pytest.approx(0.5)


def test_paired_ratio_by_case_bootstrap() -> None:
    baseline = RatioSamples(cases=tuple((0.002 + 0.0001 * case, 3.0) for case in range(12)))
    candidate = RatioSamples(cases=tuple((0.004 + 0.0001 * case, 3.0) for case in range(12)))

    estimate = paired(baseline, candidate, LOWER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_BOOTSTRAP_RATIO
    assert estimate.value == pytest.approx(-0.002 / 3)
    assert estimate.low is not None and estimate.high is not None and estimate.value is not None
    assert estimate.low <= estimate.value <= estimate.high


def test_paired_quantile_by_case_bootstrap() -> None:
    baseline = QuantileSamples(cases=tuple((100.0 + case, 110.0 + case) for case in range(10)), share=0.5)
    candidate = QuantileSamples(cases=tuple((150.0 + case, 160.0 + case) for case in range(10)), share=0.5)

    estimate = paired(baseline, candidate, LOWER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_BOOTSTRAP_QUANTILE
    assert estimate.value == pytest.approx(-50.0)
    assert estimate.low is not None and estimate.high is not None
    assert estimate.high < 0


def test_different_shapes_are_rejected() -> None:
    with pytest.raises(ShapeMismatch):
        paired(means(BASELINE_SCORES), RateSamples(cases=((1, 1),)), HIGHER, CONFIG)


def test_all_pairs_passing_are_uninformative() -> None:
    both = RateSamples(cases=((3, 3),) * 12)

    estimate = paired(both, both, HIGHER, CONFIG)

    assert estimate.degenerate is DegenerateReason.UNINFORMATIVE
    assert estimate.method is None
    assert (estimate.low, estimate.high) == (None, None)
    assert estimate.value == 0.0


def test_rates_with_many_discordant_cases_from_fifty_pairs_use_bca() -> None:
    baseline = RateSamples(cases=tuple((case % 3, 3) for case in range(60)))
    candidate = RateSamples(cases=tuple(((case + 1) % 4, 3) for case in range(60)))

    estimate = paired(baseline, candidate, HIGHER, CONFIG)

    assert estimate.method is StatMethod.PAIRED_BCA
    assert (estimate.cases, estimate.attempts) == (60, 360)
