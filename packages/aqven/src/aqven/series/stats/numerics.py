import math
import warnings
from collections.abc import Generator
from contextlib import contextmanager
from typing import Final, Literal

import numpy as np
from numpy.typing import NDArray
from scipy import stats

from aqven.series.model import DegenerateReason, Estimate, StatMethod
from aqven.series.stats.samples import Bound

type FloatArray = NDArray[np.float64]

P_FLOOR: Final = 1e-9
TWO_SIDES: Final = 2.0
HALF: Final = 0.5


@contextmanager
def quiet() -> Generator[None]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", stats.DegenerateDataWarning)
        warnings.simplefilter("ignore", RuntimeWarning)
        yield


def z_of(confidence: float) -> float:
    with quiet():
        return float(stats.norm.ppf(HALF + confidence / 2))


def rng_of(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def finite(value: float) -> float | None:
    return value if math.isfinite(value) else None


def floats(values: object) -> FloatArray:
    return np.asarray(values, dtype=np.float64)


def wilson_bounds(rate: float, size: float, z: float) -> tuple[float, float]:
    z_squared = z * z
    denominator = 1 + z_squared / size
    center = (rate + z_squared / (2 * size)) / denominator
    spread = z * math.sqrt(rate * (1 - rate) / size + z_squared / (4 * size * size)) / denominator
    return max(0.0, center - spread), min(1.0, center + spread)


def score_p(rate: float, size: float, bound: Bound | None) -> float | None:
    if bound is None:
        return None
    null = min(max(bound.edge, P_FLOOR), 1 - P_FLOOR)
    score = (rate - null) / math.sqrt(null * (1 - null) / size)
    tail = stats.norm.sf if bound.side == "above" else stats.norm.cdf
    with quiet():
        return float(tail(score))


def constant_p(value: float, bound: Bound | None) -> float | None:
    if bound is None:
        return None
    beyond = value > bound.edge if bound.side == "above" else value < bound.edge
    return 0.0 if beyond else 1.0


def tail_p(distribution: FloatArray, bound: Bound | None) -> float | None:
    if bound is None:
        return None
    null = distribution <= bound.edge if bound.side == "above" else distribution >= bound.edge
    return (1 + int(np.count_nonzero(null))) / (1 + distribution.size)


def two_sided_p(distribution: FloatArray) -> float:
    below = int(np.count_nonzero(distribution <= 0))
    above = int(np.count_nonzero(distribution >= 0))
    return min(1.0, TWO_SIDES * (1 + min(below, above)) / (1 + distribution.size))


def degenerate(value: float | None, reason: DegenerateReason, cases: int, attempts: int) -> Estimate:
    return Estimate(
        value=None if value is None else finite(value),
        low=None,
        high=None,
        method=None,
        cases=cases,
        attempts=attempts,
        degenerate=reason,
    )


def interval(
    value: float,
    low: float,
    high: float,
    method: StatMethod,
    p_value: float | None,
    cases: int,
    attempts: int,
) -> Estimate:
    if has_nan(value, low, high):
        return degenerate(value, DegenerateReason.NUMERIC, cases, attempts)
    return Estimate(
        value=finite(value),
        low=finite(low),
        high=finite(high),
        method=method,
        p_value=p_value,
        cases=cases,
        attempts=attempts,
    )


def has_nan(*values: float) -> bool:
    return any(math.isnan(value) for value in values)


type Alternative = Literal["greater", "less"]

ALTERNATIVES: Final[dict[Literal["above", "below"], Alternative]] = {"above": "greater", "below": "less"}
