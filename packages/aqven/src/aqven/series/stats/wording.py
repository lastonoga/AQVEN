import math
from collections.abc import Callable, Mapping, Sequence
from typing import Final, Literal

from aqven.series.model import Contrast, DegenerateReason, Estimate, MetricUnit, ThresholdCell
from aqven.spec import CellVerdict

type PairKind = Literal["compare", "noninferior"]
type NumberFormat = Callable[[float, bool], str]

CI_LABEL: Final = "95% CI"
MISSING_VALUE: Final = "n/a"
OPEN_BOUND: Final = "unbounded"
PHRASE_SEPARATOR: Final = "; "
USD_SIGNIFICANT: Final = 4
DEFAULT_REASON: Final = "the interval could not be computed"

DEGENERATE_WORDS: Final[Mapping[DegenerateReason, str]] = {
    DegenerateReason.NO_DATA: "no data",
    DegenerateReason.TOO_FEW_CASES: "too few cases",
    DegenerateReason.TOO_FEW_ATTEMPTS: "too few attempts",
    DegenerateReason.NO_DISCORDANCE: "the variants agree on every case",
    DegenerateReason.UNINFORMATIVE: "every case passes or fails for both variants",
    DegenerateReason.NUMERIC: DEFAULT_REASON,
}

THRESHOLD_TAILS: Final[Mapping[CellVerdict, str]] = {
    CellVerdict.PASS: "clears the bound by more than the margin",
    CellVerdict.FAIL: "stays within the margin of the bound or on its wrong side",
}
THRESHOLD_UNCLEAR: Final = "too wide to decide"

PAIR_TAILS: Final[Mapping[PairKind, Mapping[CellVerdict, str]]] = {
    "compare": {
        CellVerdict.PASS: "better by more than the {margin} margin",
        CellVerdict.FAIL: "the effect is within ±{margin} or reversed",
    },
    "noninferior": {
        CellVerdict.PASS: "not worse by more than the {margin} margin",
        CellVerdict.FAIL: "worse by more than the {margin} margin",
    },
}
PAIR_UNCLEAR: Final = "too wide to decide at the {margin} margin"

GUARDRAIL_WORDS: Final[Mapping[CellVerdict, str]] = {
    CellVerdict.PASS: "holds",
    CellVerdict.FAIL: "breaks",
}
GUARDRAIL_UNCLEAR: Final = "is unsettled"


def fixed(decimals: int) -> NumberFormat:
    def render(value: float, signed: bool) -> str:
        return f"{value:+.{decimals}f}" if signed else f"{value:.{decimals}f}"

    return render


def sign_of(value: float, signed: bool) -> str:
    if value < 0:
        return "-"
    return "+" if signed else ""


def usd(value: float, signed: bool) -> str:
    sign = sign_of(value, signed)
    size = abs(value)
    if size == 0:
        return f"{sign}$0"
    decimals = max(0, USD_SIGNIFICANT - 1 - math.floor(math.log10(size)))
    return f"{sign}${trimmed(f'{size:.{decimals}f}')}"


def trimmed(digits: str) -> str:
    if "." not in digits:
        return digits
    return digits.rstrip("0").rstrip(".")


UNIT_FORMATS: Final[Mapping[MetricUnit, NumberFormat]] = {
    MetricUnit.RATE: fixed(2),
    MetricUnit.SCORE: fixed(3),
    MetricUnit.ORDINAL: fixed(1),
    MetricUnit.USD: usd,
    MetricUnit.MS: fixed(0),
}


def number(value: float | None, unit: MetricUnit, signed: bool = False) -> str:
    if value is None:
        return MISSING_VALUE
    return UNIT_FORMATS[unit](value, signed)


def declared(value: float) -> str:
    return f"{value:g}"


def bound_text(value: float | None, unit: MetricUnit, signed: bool) -> str:
    return OPEN_BOUND if value is None else number(value, unit, signed)


def interval_text(estimate: Estimate, unit: MetricUnit, signed: bool = False) -> str:
    if estimate.low is None and estimate.high is None:
        reason = DEFAULT_REASON if estimate.degenerate is None else DEGENERATE_WORDS[estimate.degenerate]
        return f"no {CI_LABEL}: {reason}"
    low = bound_text(estimate.low, unit, signed)
    high = bound_text(estimate.high, unit, signed)
    return f"{CI_LABEL} {low} to {high}"


def threshold_phrase(cell: ThresholdCell, unit: MetricUnit) -> str:
    tail = THRESHOLD_TAILS.get(cell.verdict, THRESHOLD_UNCLEAR)
    return (
        f"{cell.variant_id}: {cell.metric} is {number(cell.estimate.value, unit)} "
        f"({interval_text(cell.estimate, unit)}) against {cell.bound} {declared(cell.threshold)} "
        f"with margin {declared(cell.margin)}: {tail}"
    )


def threshold_measurement(cells: Sequence[ThresholdCell], unit: MetricUnit) -> str:
    return PHRASE_SEPARATOR.join(threshold_phrase(cell, unit) for cell in cells)


def guardrail_phrase(contrast: Contrast) -> str:
    return f"; guardrail {contrast.metric} {GUARDRAIL_WORDS.get(contrast.verdict, GUARDRAIL_UNCLEAR)}"


def pair_measurement(kind: PairKind, primary: Contrast, unit: MetricUnit, guardrails: Sequence[Contrast]) -> str:
    margin = declared(primary.margin)
    tail = PAIR_TAILS[kind].get(primary.verdict, PAIR_UNCLEAR).format(margin=margin)
    difference = primary.difference
    head = (
        f"{primary.candidate} vs {primary.baseline} on {primary.metric}: {number(difference.value, unit, True)} "
        f"({interval_text(difference, unit, True)}): {tail}"
    )
    return head + "".join(guardrail_phrase(guardrail) for guardrail in guardrails)


def sentence(measurement: str) -> str:
    return f"{measurement}."


def dev_signal(measurement: str) -> str:
    return f"Signal on dev, not a finding: {measurement}."


def unvalidated_signal(check: str, measurement: str) -> str:
    return f"Signal only, judge {check} is not validated: {measurement}."


def cancelled_text(done: int, total: int) -> str:
    return f"No finding: cancelled after {done} of {total} attempts."


def budget_cut_text(done: int, total: int) -> str:
    return f"No finding: the spend cap stopped the series after {done} of {total} attempts."


def inputs_changed_text(what: str) -> str:
    return f"No finding: inputs changed during the series ({what})."


def infra_errors_text(errors: int, done: int) -> str:
    return f"No finding: {errors} of {done} attempts hit infrastructure errors."


def no_data_text() -> str:
    return "No finding: the primary metric has no data."
