import pytest

from aqven.series.stats.multiplicity import InvalidLevel, adjust, discovered, two_sided


def test_benjamini_hochberg_matches_the_reference() -> None:
    adjusted = adjust([0.004, 0.012, 0.028, 0.045, 0.20])

    assert adjusted == pytest.approx((0.02, 0.03, 0.046667, 0.05625, 0.2), abs=1e-6)


def test_missing_p_values_join_the_family_as_one() -> None:
    adjusted = adjust([0.01, None])

    assert adjusted[0] == pytest.approx(0.02)
    assert adjusted[1] is None


def test_single_cell_is_the_identity() -> None:
    assert adjust([0.03]) == pytest.approx((0.03,))


def test_empty_family() -> None:
    assert adjust([]) == ()


def test_invalid_level() -> None:
    with pytest.raises(InvalidLevel):
        adjust([0.1], q=0.0)


def test_two_sided_doubles_and_caps() -> None:
    assert two_sided(0.02) == pytest.approx(0.04)
    assert two_sided(0.7) == 1.0
    assert two_sided(None) is None


def test_discovery_needs_an_adjusted_p() -> None:
    assert discovered(0.05)
    assert not discovered(0.0501)
    assert not discovered(None)
