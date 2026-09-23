import math

import pytest

from aqven.series.stats import (
    Z_CONFIDENCE,
    Z_POWER,
    MarginRequired,
    effective_cases,
    half_width,
    icc_of,
    mde,
    recommended_cases,
    spread_of,
)

KISH_MATRIX = (
    *([1.0, 1.0, 1.0],) * 8,
    [1.0, 1.0, 0.0],
    [1.0, 0.0, 1.0],
    [0.0, 1.0, 1.0],
    [1.0, 1.0, 0.0],
    [0.0, 0.0, 0.0],
    [0.0, 0.0, 1.0],
    *([1.0, 1.0, 1.0],) * 4,
    [0.0, 0.0, 0.0],
    [1.0, 1.0, 1.0],
)


def test_power_formulas_match_the_reference() -> None:
    assert effective_cases(12, 3, 0.3) == pytest.approx(22.5)
    assert half_width(0.5, 12, 3, 0.3) == pytest.approx(0.206598, abs=1e-6)
    assert mde(0.5, 12, 3, 0.3) == pytest.approx(0.295313, abs=1e-6)
    assert recommended_cases(0.5, 0.05, 3, 0.3) == 205


def test_eighty_percent_power_constant() -> None:
    assert pytest.approx(7.848880, abs=1e-6) == (Z_CONFIDENCE + Z_POWER) ** 2


def test_recommended_cases_give_a_half_width_within_the_margin() -> None:
    cases = recommended_cases(0.4, 0.1, 2, 0.5)

    assert half_width(0.4, cases, 2, 0.5) <= 0.1
    assert half_width(0.4, cases - 1, 2, 0.5) > 0.1


def test_recommended_cases_need_a_margin() -> None:
    with pytest.raises(MarginRequired):
        recommended_cases(0.5, 0.0, 3, 0.3)


def test_no_cases_give_an_infinite_half_width() -> None:
    assert math.isinf(half_width(0.5, 0, 3, 0.3))


def test_spread_needs_two_values() -> None:
    assert spread_of([0.5]) is None
    assert spread_of([0.62, 0.71, 0.55]) == pytest.approx(0.080208, abs=1e-6)


def test_kish_icc_matches_the_reference() -> None:
    icc = icc_of(KISH_MATRIX)

    assert icc == pytest.approx(0.496466, abs=1e-6)
    assert effective_cases(20, 3, icc or 0.0) == pytest.approx(30.106383, abs=1e-6)


def test_icc_is_undefined_without_repeats_or_cases() -> None:
    assert icc_of([[1.0], [0.0]]) is None
    assert icc_of([[1.0, 0.0]]) is None
    assert icc_of([[1.0, 1.0], [1.0, 1.0]]) == 1.0
