from collections.abc import Sequence
from typing import Final

import numpy as np
from scipy import stats

FDR_LEVEL: Final = 0.05
MISSING_P: Final = 1.0
TWO_SIDES: Final = 2.0


class InvalidLevel(ValueError):
    def __init__(self, level: float) -> None:
        super().__init__(f"the false discovery rate level must be in (0, 1], got {level}")
        self.level = level


def adjust(p_values: Sequence[float | None], q: float = 0.05) -> tuple[float | None, ...]:
    if not 0 < q <= 1:
        raise InvalidLevel(q)
    if not p_values:
        return ()
    family = np.asarray([MISSING_P if value is None else value for value in p_values], dtype=np.float64)
    adjusted = stats.false_discovery_control(family, method="bh").tolist()
    return tuple(None if value is None else float(found) for value, found in zip(p_values, adjusted, strict=True))


def two_sided(p_one: float | None) -> float | None:
    if p_one is None:
        return None
    return min(1.0, TWO_SIDES * p_one)


def discovered(p_adjusted: float | None, q: float = FDR_LEVEL) -> bool:
    return p_adjusted is not None and p_adjusted <= q
