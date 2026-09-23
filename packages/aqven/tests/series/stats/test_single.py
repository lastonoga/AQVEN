import numpy as np
import pytest
from scipy import stats

from aqven.series.model import DegenerateReason, StatMethod
from aqven.series.stats.numerics import wilson_bounds, z_of
from aqven.series.stats.samples import (
    Bound,
    MeanSamples,
    QuantileSamples,
    RateSamples,
    RatioSamples,
    StatConfig,
)
from aqven.series.stats.strategies import single

CONFIG = StatConfig(seed=20260923)
KISH_ROWS = (
    *((1, 1, 1),) * 8,
    (1, 1, 0),
    (1, 0, 1),
    (0, 1, 1),
    (1, 1, 0),
    (0, 0, 0),
    (0, 0, 1),
    *((1, 1, 1),) * 4,
    (0, 0, 0),
    (1, 1, 1),
)
CASE_SCORES = (0.62, 0.71, 0.55, 0.80, 0.68, 0.74, 0.59, 0.66, 0.77, 0.70, 0.64, 0.73)
PASS_COSTS = (0.0030, 0.0036, 0.0027, 0.0033, 0.0039, 0.0030, 0.0033, 0.0036, 0.0030, 0.0027, 0.0042, 0.0033)
PASS_COUNTS = (3, 3, 2, 3, 1, 3, 3, 0, 3, 2, 3, 3)


def one_attempt_cases(successes: int, size: int) -> RateSamples:
    return RateSamples(cases=((1, 1),) * successes + ((0, 1),) * (size - successes))


@pytest.mark.parametrize(
    ("successes", "size", "low", "high"),
    [
        (27, 30, 0.7438, 0.9654),
        (30, 30, 0.8865, 1.0),
        (0, 30, 0.0, 0.1135),
        (90, 100, 0.8256, 0.9448),
        (18, 30, 0.4232, 0.7541),
    ],
)
def test_wilson_by_cases_matches_the_reference(successes: int, size: int, low: float, high: float) -> None:
    estimate = single(one_attempt_cases(successes, size), None, CONFIG)

    assert estimate.method is StatMethod.WILSON
    assert estimate.value == pytest.approx(successes / size)
    assert estimate.low == pytest.approx(low, abs=5e-5)
    assert estimate.high == pytest.approx(high, abs=5e-5)
    assert estimate.p_value is None
    assert (estimate.cases, estimate.attempts) == (size, size)


def test_wilson_score_p_value_against_the_edge() -> None:
    estimate = single(one_attempt_cases(17, 20), Bound(side="above", value=0.70, margin=0.0), CONFIG)

    assert estimate.low == pytest.approx(0.639581, abs=1e-6)
    assert estimate.high == pytest.approx(0.947631, abs=1e-6)
    assert estimate.p_value == pytest.approx(0.071617, abs=1e-6)


def test_wilson_below_uses_the_lower_tail() -> None:
    estimate = single(one_attempt_cases(17, 20), Bound(side="below", value=0.70, margin=0.0), CONFIG)

    assert estimate.p_value == pytest.approx(1 - 0.071617, abs=1e-6)


def test_kish_wilson_matches_the_reference() -> None:
    samples = RateSamples(cases=tuple((sum(row), len(row)) for row in KISH_ROWS))

    estimate = single(samples, None, CONFIG)

    assert estimate.method is StatMethod.KISH_WILSON
    assert estimate.value == pytest.approx(0.8)
    assert estimate.low == pytest.approx(0.627281, abs=1e-6)
    assert estimate.high == pytest.approx(0.904825, abs=1e-6)
    assert (estimate.cases, estimate.attempts) == (20, 60)


def test_rare_failures_with_equal_repeats_use_the_beta_binomial_grid() -> None:
    failures = [0] * 44 + [1, 1, 2, 1, 5, 4]
    samples = RateSamples(cases=tuple((5 - failed, 5) for failed in failures))

    estimate = single(samples, None, CONFIG)

    assert estimate.method is StatMethod.BETA_BINOMIAL
    assert estimate.value == pytest.approx(1 - 0.0704, abs=5e-5)
    assert estimate.low == pytest.approx(0.8625, abs=5e-5)
    assert estimate.high == pytest.approx(0.9735, abs=5e-5)


def test_rare_successes_keep_the_success_scale() -> None:
    successes = [0] * 44 + [1, 1, 2, 1, 5, 4]
    samples = RateSamples(cases=tuple((passed, 5) for passed in successes))

    estimate = single(samples, None, CONFIG)

    assert estimate.method is StatMethod.BETA_BINOMIAL
    assert estimate.value == pytest.approx(0.0704, abs=5e-5)
    assert estimate.low == pytest.approx(0.0265, abs=5e-5)
    assert estimate.high == pytest.approx(0.1375, abs=5e-5)


def test_beta_binomial_p_value_is_the_posterior_mass_on_the_null_side() -> None:
    failures = [0] * 44 + [1, 1, 2, 1, 5, 4]
    samples = RateSamples(cases=tuple((5 - failed, 5) for failed in failures))

    far = single(samples, Bound(side="above", value=0.80, margin=0.0), CONFIG)
    near = single(samples, Bound(side="above", value=0.95, margin=0.0), CONFIG)

    assert far.p_value is not None and far.p_value < 0.001
    assert near.p_value is not None and near.p_value > 0.5


def test_unequal_repeats_fall_back_to_kish_even_when_rare() -> None:
    samples = RateSamples(cases=((3, 3),) * 30 + ((1, 2),))

    assert single(samples, None, CONFIG).method is StatMethod.KISH_WILSON


def test_t_on_case_means_matches_the_reference() -> None:
    samples = MeanSamples(cases=tuple((score,) for score in CASE_SCORES))

    estimate = single(samples, Bound(side="above", value=0.6, margin=0.0), CONFIG)

    assert estimate.method is StatMethod.T_CASE_MEANS
    assert estimate.value == pytest.approx(0.6825)
    assert estimate.low == pytest.approx(0.635409, abs=1e-6)
    assert estimate.high == pytest.approx(0.729591, abs=1e-6)
    assert estimate.p_value == pytest.approx(0.001336, abs=1e-6)


def test_repeats_collapse_to_case_means_before_t() -> None:
    samples = MeanSamples(cases=tuple((score - 0.1, score + 0.1) for score in CASE_SCORES))

    estimate = single(samples, None, CONFIG)

    assert estimate.low == pytest.approx(0.635409, abs=1e-6)
    assert estimate.high == pytest.approx(0.729591, abs=1e-6)
    assert (estimate.cases, estimate.attempts) == (12, 24)


def test_constant_case_means_give_a_zero_width_interval() -> None:
    estimate = single(MeanSamples(cases=((0.5,),) * 6), Bound(side="above", value=0.4, margin=0.0), CONFIG)

    assert (estimate.low, estimate.high, estimate.value) == (0.5, 0.5, 0.5)
    assert estimate.p_value == 0.0
    assert estimate.degenerate is None


def test_bca_on_case_means_from_fifty_cases() -> None:
    values = np.linspace(-0.3, 0.5, 60) ** 3 + 0.02

    estimate = single(MeanSamples(cases=tuple((float(value),) for value in values)), None, CONFIG)

    assert estimate.method is StatMethod.BCA_CASE_MEANS
    assert estimate.value == pytest.approx(0.037542, abs=1e-6)
    assert estimate.low == pytest.approx(0.029650, abs=1e-6)
    assert estimate.high == pytest.approx(0.047622, abs=1e-6)


def test_bca_falls_back_to_t_when_scipy_returns_nan() -> None:
    estimate = single(MeanSamples(cases=((1.0,),) * 60), None, CONFIG)

    assert estimate.method is StatMethod.T_CASE_MEANS
    assert (estimate.low, estimate.high) == (1.0, 1.0)


def test_bca_p_value_counts_the_distribution_beyond_the_edge() -> None:
    values = np.linspace(-0.3, 0.5, 60) ** 3 + 0.02
    samples = MeanSamples(cases=tuple((float(value),) for value in values))

    estimate = single(samples, Bound(side="above", value=0.0, margin=0.0), CONFIG)

    assert estimate.p_value == pytest.approx(1 / 10000)


def test_cost_of_pass_by_case_bootstrap() -> None:
    samples = RatioSamples(cases=tuple(zip(PASS_COSTS, map(float, PASS_COUNTS), strict=True)))

    estimate = single(samples, None, StatConfig(seed=1))

    assert estimate.method is StatMethod.BOOTSTRAP_RATIO
    assert estimate.value == pytest.approx(0.00136552, abs=1e-8)
    assert estimate.low == pytest.approx(0.00110909, abs=1e-8)
    assert estimate.high == pytest.approx(0.00184091, abs=1e-8)


def test_ratio_without_passes_has_no_data() -> None:
    estimate = single(RatioSamples(cases=((0.003, 0.0),) * 6), None, CONFIG)

    assert estimate.degenerate is DegenerateReason.NO_DATA
    assert estimate.value is None


def test_quantile_by_case_bootstrap() -> None:
    cases = tuple(tuple(float(100 * case + attempt) for attempt in range(3)) for case in range(10))

    estimate = single(QuantileSamples(cases=cases, share=0.5), None, CONFIG)

    assert estimate.method is StatMethod.BOOTSTRAP_QUANTILE
    assert estimate.value == pytest.approx(float(np.quantile(np.ravel(cases), 0.5)))
    assert estimate.low is not None and estimate.high is not None and estimate.value is not None
    assert estimate.low <= estimate.value <= estimate.high
    assert (estimate.cases, estimate.attempts) == (10, 30)


def test_quantile_bootstrap_is_reproducible_by_seed() -> None:
    cases = tuple(tuple(float((case * 37 + attempt * 11) % 97) for attempt in range(2)) for case in range(12))
    samples = QuantileSamples(cases=cases, share=0.95)

    assert single(samples, None, CONFIG) == single(samples, None, CONFIG)


WILSON_SIZES = (*range(1, 31), 47, 99, 100, 153, 200)


def test_closed_wilson_formula_matches_scipy() -> None:
    z = z_of(0.95)
    worst = 0.0
    for size in WILSON_SIZES:
        for successes in range(size + 1):
            found = stats.binomtest(successes, size).proportion_ci(confidence_level=0.95, method="wilson")
            low, high = wilson_bounds(successes / size, size, z)
            worst = max(worst, abs(low - float(found.low)), abs(high - float(found.high)))

    assert worst < 1e-12
