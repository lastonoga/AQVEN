import math
import statistics
from collections.abc import Sequence
from typing import Final

Z_CONFIDENCE: Final = 1.959963984540054
Z_POWER: Final = 0.8416212335729143
FULL_CORRELATION: Final = 1.0
MIN_CASES: Final = 1
MIN_SPREAD_VALUES: Final = 2


class MarginRequired(ValueError):
    def __init__(self, margin: float) -> None:
        super().__init__(f"the recommended number of cases needs a positive margin, got {margin}")
        self.margin = margin


def design_effect(repeats: int, icc: float) -> float:
    return 1 + (repeats - 1) * icc


def effective_cases(cases: int, repeats: int, icc: float) -> float:
    return cases * repeats / design_effect(repeats, icc)


def standard_error(spread: float, cases: int, repeats: int, icc: float) -> float:
    effective = effective_cases(cases, repeats, icc)
    if effective <= 0:
        return math.inf
    return spread / math.sqrt(effective)


def half_width(spread: float, cases: int, repeats: int, icc: float) -> float:
    return Z_CONFIDENCE * standard_error(spread, cases, repeats, icc)


def mde(spread: float, cases: int, repeats: int, icc: float) -> float:
    return (Z_CONFIDENCE + Z_POWER) * standard_error(spread, cases, repeats, icc)


def recommended_cases(spread: float, margin: float, repeats: int, icc: float) -> int:
    if margin <= 0:
        raise MarginRequired(margin)
    needed = (Z_CONFIDENCE * spread / margin) ** 2 * design_effect(repeats, icc) / repeats
    return max(MIN_CASES, math.ceil(needed))


def spread_of(values: Sequence[float]) -> float | None:
    if len(values) < MIN_SPREAD_VALUES:
        return None
    return statistics.stdev(values)


def within_variance(cases: Sequence[Sequence[float]]) -> float | None:
    repeated = [statistics.variance(values) for values in cases if len(values) >= MIN_SPREAD_VALUES]
    if not repeated:
        return None
    return statistics.fmean(repeated)


def icc_of(cases: Sequence[Sequence[float]]) -> float | None:
    filled = [values for values in cases if values]
    within = within_variance(filled)
    if within is None or len(filled) < MIN_SPREAD_VALUES:
        return None
    means = [statistics.fmean(values) for values in filled]
    mean_repeats = statistics.fmean([len(values) for values in filled])
    between = max(0.0, statistics.variance(means) - within / mean_repeats)
    total = between + within
    if total == 0:
        return FULL_CORRELATION
    return between / total
