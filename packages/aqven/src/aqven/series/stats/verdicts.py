from typing import Final, Literal

from aqven.series.model import Estimate
from aqven.series.stats.samples import Bound
from aqven.spec import CellVerdict

EDGE_SIGNS: Final[dict[Literal["compare", "noninferior"], float]] = {"compare": 1.0, "noninferior": -1.0}


def interval_verdict(low: float | None, high: float | None, edge: float) -> CellVerdict:
    if low is not None and low > edge:
        return CellVerdict.PASS
    if high is not None and high < edge:
        return CellVerdict.FAIL
    return CellVerdict.UNCLEAR


def negated(value: float | None) -> float | None:
    return None if value is None else -value


def threshold_verdict(estimate: Estimate, bound: Bound) -> CellVerdict:
    if bound.side == "above":
        return interval_verdict(estimate.low, estimate.high, bound.edge)
    return interval_verdict(negated(estimate.high), negated(estimate.low), -bound.edge)


def pair_edge(kind: Literal["compare", "noninferior"], margin_abs: float) -> float:
    return EDGE_SIGNS[kind] * margin_abs


def pair_verdict(difference: Estimate, kind: Literal["compare", "noninferior"], margin_abs: float) -> CellVerdict:
    return interval_verdict(difference.low, difference.high, pair_edge(kind, margin_abs))


def guardrail_verdict(difference: Estimate, margin_abs: float) -> CellVerdict:
    return pair_verdict(difference, "noninferior", margin_abs)
