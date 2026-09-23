import math
import statistics
from typing import Final

from aqven.series.model import Stability
from aqven.series.stats.samples import RateSamples

MIN_REPEATED: Final = 2


def pass_hat_k(cases: RateSamples, k: int) -> float | None:
    shares = [math.comb(passed, k) / math.comb(total, k) for passed, total in cases.cases if total >= k]
    if not shares:
        return None
    return statistics.fmean(shares)


def stability_of(cases: RateSamples) -> Stability:
    repeated = [(passed, total) for passed, total in cases.cases if total >= MIN_REPEATED]
    always = sum(1 for passed, total in repeated if passed == total)
    never = sum(1 for passed, _ in repeated if passed == 0)
    return Stability(always=always, never=never, flaky=len(repeated) - always - never)
