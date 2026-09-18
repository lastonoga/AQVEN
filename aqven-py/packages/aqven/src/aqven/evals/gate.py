from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from hashlib import sha256
from statistics import fmean, stdev
from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field

from aqven.evals.statistics import PairedOutcome, PairedSample, Statistics
from aqven.ir import canonical_json
from aqven.spec import GateSpec, MetricKind


class GateDecision(StrEnum):
    PASS = "PASS"
    WARN = "WARN"
    BLOCK = "BLOCK"
    GATE_UNAVAILABLE = "GATE_UNAVAILABLE"


type GateFamily = Literal["primary", "secondary", "safety"]

FAMILY_ORDER: Final[tuple[GateFamily, ...]] = ("primary", "secondary", "safety")
BINARY_THRESHOLD: Final = 0.5
MIN_SPREAD_SIZE: Final = 2
HASH_PREFIX: Final = "sha256-"
GATE_CONFIG_DOMAIN: Final = "aqven/gate-config/v1"
GATE_REPORT_DOMAIN: Final = "aqven/gate-report/v1"
STATISTICS_UNAVAILABLE: Final = "statistics_unavailable"
DATASET_TOO_SMALL: Final = "dataset_too_small"
TOO_MANY_DROPPED: Final = "too_many_dropped"
NO_PAIRED_CASES: Final = "no_paired_cases"
INSUFFICIENT_DISCORDANT: Final = "insufficient_discordant"
NO_SIGNIFICANT_IMPROVEMENT: Final = "no_significant_improvement"
SIDE_REGRESSION: Final = "side_regression"
SAFETY_REGRESSION: Final = "regression_on_safety_metric"

REPORT_CONFIG = ConfigDict(extra="forbid", frozen=True)


class GateTestResult(BaseModel):
    model_config = REPORT_CONFIG
    node_id: str | None
    scorer_id: str
    family: GateFamily
    n: Annotated[int, Field(ge=0)]
    n_discordant: Annotated[int, Field(ge=0)] | None
    n_ties: Annotated[int, Field(ge=0)] | None
    delta: float
    ci_lo: float
    ci_hi: float
    p_raw: Annotated[float, Field(ge=0, le=1)] | None
    p_adj: Annotated[float, Field(ge=0, le=1)] | None
    q_adj: Annotated[float, Field(ge=0, le=1)] | None
    method: str
    dz: float | None
    wins: Annotated[int, Field(ge=0)]
    losses: Annotated[int, Field(ge=0)]
    ties: Annotated[int, Field(ge=0)]
    noise_floor: float | None
    verdict: GateDecision


class GateReport(BaseModel):
    model_config = REPORT_CONFIG
    decision: GateDecision
    reason_code: str | None
    spec_a_hash: str
    spec_b_hash: str
    gate_config_hash: str
    seeds: tuple[int, ...]
    repeats: Annotated[int, Field(ge=1)]
    per_test: tuple[GateTestResult, ...]
    dropped_cases: tuple[str, ...]
    content_hash: str


@dataclass(frozen=True, slots=True)
class ScorerSeries:
    scorer_id: str
    kind: MetricKind
    family: GateFamily
    baseline: tuple[float, ...]
    candidate: tuple[float, ...]

    @property
    def sample(self) -> PairedSample:
        return PairedSample(kind=self.kind, baseline=self.baseline, candidate=self.candidate)


@dataclass(frozen=True, slots=True)
class GateRequest:
    spec: GateSpec
    series: tuple[ScorerSeries, ...]
    dataset_size: int
    dropped_cases: tuple[str, ...] = ()
    spec_a_hash: str = ""
    spec_b_hash: str = ""
    seeds: tuple[int, ...] = ()

    def family(self, name: GateFamily) -> tuple[ScorerSeries, ...]:
        return tuple(item for item in self.series if item.family == name)


@dataclass(frozen=True, slots=True)
class GateStop:
    decision: GateDecision
    reason_code: str


def truth(value: float) -> bool:
    return value >= BINARY_THRESHOLD


def outcome_counts(series: ScorerSeries) -> tuple[int, int, int]:
    pairs = tuple(zip(series.baseline, series.candidate, strict=True))
    wins = sum(1 for before, after in pairs if after > before)
    losses = sum(1 for before, after in pairs if after < before)
    return wins, losses, len(pairs) - wins - losses


def discordant_counts(series: ScorerSeries) -> tuple[int, int]:
    pairs = tuple(zip(series.baseline, series.candidate, strict=True))
    lost = sum(1 for before, after in pairs if truth(before) and not truth(after))
    gained = sum(1 for before, after in pairs if not truth(before) and truth(after))
    return lost, gained


def effect_size(series: ScorerSeries) -> float | None:
    differences = series.sample.differences
    if len(differences) < MIN_SPREAD_SIZE:
        return None
    spread = stdev(differences)
    return None if spread == 0 else fmean(differences) / spread


def gate_config_hash(spec: GateSpec) -> str:
    digest = sha256()
    digest.update(GATE_CONFIG_DOMAIN.encode())
    digest.update(canonical_json(spec.model_dump(mode="json", by_alias=True)))
    return f"{HASH_PREFIX}{digest.hexdigest()}"


def report_content_hash(report: GateReport) -> str:
    digest = sha256()
    digest.update(GATE_REPORT_DOMAIN.encode())
    digest.update(canonical_json(report.model_dump(mode="json", by_alias=True, exclude={"content_hash"})))
    return f"{HASH_PREFIX}{digest.hexdigest()}"


def sealed(report: GateReport) -> GateReport:
    return report.model_copy(update={"content_hash": report_content_hash(report)})


def unavailable(request: GateRequest, reason_code: str, repeats: int) -> GateReport:
    return sealed(
        GateReport(
            decision=GateDecision.GATE_UNAVAILABLE,
            reason_code=reason_code,
            spec_a_hash=request.spec_a_hash,
            spec_b_hash=request.spec_b_hash,
            gate_config_hash=gate_config_hash(request.spec),
            seeds=request.seeds,
            repeats=repeats,
            per_test=(),
            dropped_cases=request.dropped_cases,
            content_hash="",
        )
    )


def _too_small(request: GateRequest) -> GateStop | None:
    if request.dataset_size >= request.spec.min_dataset:
        return None
    return GateStop(GateDecision.GATE_UNAVAILABLE, DATASET_TOO_SMALL)


def _too_many_dropped(request: GateRequest) -> GateStop | None:
    size = max(request.dataset_size, 1)
    if len(request.dropped_cases) / size <= request.spec.max_dropped_ratio:
        return None
    return GateStop(GateDecision.GATE_UNAVAILABLE, TOO_MANY_DROPPED)


def _no_pairs(request: GateRequest) -> GateStop | None:
    primary = request.family("primary")
    if primary and all(item.sample.size > 0 for item in request.series):
        return None
    return GateStop(GateDecision.GATE_UNAVAILABLE, NO_PAIRED_CASES)


def _insufficient_discordant(request: GateRequest) -> GateStop | None:
    binary = [item for item in request.family("primary") if item.kind is MetricKind.BINARY]
    short = [item for item in binary if sum(discordant_counts(item)) < request.spec.min_discordant]
    return GateStop(GateDecision.GATE_UNAVAILABLE, INSUFFICIENT_DISCORDANT) if short else None


ADMISSION_RULES: Final[tuple[Callable[[GateRequest], GateStop | None], ...]] = (
    _too_small,
    _too_many_dropped,
    _no_pairs,
    _insufficient_discordant,
)


def admission(request: GateRequest) -> GateStop | None:
    return next((stop for rule in ADMISSION_RULES if (stop := rule(request)) is not None), None)


@dataclass(frozen=True, slots=True)
class GateBuilder:
    statistics: Statistics
    resamples: int
    seed: int

    def measure(self, series: ScorerSeries) -> tuple[ScorerSeries, PairedOutcome]:
        return series, self.statistics.paired(series.sample, self.resamples, self.seed)

    def row(self, series: ScorerSeries, measured: PairedOutcome, adjusted: float | None) -> GateTestResult:
        wins, losses, ties = outcome_counts(series)
        binary = series.kind is MetricKind.BINARY
        ordinal = series.kind is MetricKind.ORDINAL
        return GateTestResult(
            node_id=None,
            scorer_id=series.scorer_id,
            family=series.family,
            n=series.sample.size,
            n_discordant=sum(discordant_counts(series)) if binary else None,
            n_ties=ties if ordinal else None,
            delta=fmean(series.candidate) - fmean(series.baseline),
            ci_lo=measured.ci_lo,
            ci_hi=measured.ci_hi,
            p_raw=measured.p_value,
            p_adj=adjusted if series.family == "primary" else None,
            q_adj=adjusted if series.family == "secondary" else None,
            method=measured.method,
            dz=effect_size(series),
            wins=wins,
            losses=losses,
            ties=ties,
            noise_floor=None,
            verdict=GateDecision.PASS,
        )


def family_rows(builder: GateBuilder, request: GateRequest, name: GateFamily) -> tuple[GateTestResult, ...]:
    measured = [builder.measure(series) for series in request.family(name)]
    adjusted = ADJUSTMENTS[name](builder.statistics, request.spec, [item.p_value for _, item in measured])
    return tuple(builder.row(series, item, value) for (series, item), value in zip(measured, adjusted, strict=True))


def _holm(statistics: Statistics, spec: GateSpec, p_values: Sequence[float]) -> tuple[float | None, ...]:
    return statistics.holm(p_values, spec.alpha_primary)


def _fdr(statistics: Statistics, spec: GateSpec, p_values: Sequence[float]) -> tuple[float | None, ...]:
    return statistics.fdr(p_values, spec.q_secondary)


def _unadjusted(statistics: Statistics, spec: GateSpec, p_values: Sequence[float]) -> tuple[float | None, ...]:
    return tuple(None for _ in p_values)


ADJUSTMENTS: Final[Mapping[GateFamily, Callable[[Statistics, GateSpec, Sequence[float]], tuple[float | None, ...]]]] = {
    "primary": _holm,
    "secondary": _fdr,
    "safety": _unadjusted,
}


def safety_verdict(row: GateTestResult, spec: GateSpec) -> GateDecision:
    return GateDecision.BLOCK if row.ci_lo < -spec.ni_margin else GateDecision.PASS


def primary_verdict(row: GateTestResult, spec: GateSpec) -> GateDecision:
    rejected = row.p_adj is not None and row.p_adj <= spec.alpha_primary
    return GateDecision.PASS if rejected and row.ci_lo > 0 else GateDecision.BLOCK


def secondary_verdict(row: GateTestResult, spec: GateSpec) -> GateDecision:
    rejected = row.q_adj is not None and row.q_adj <= spec.q_secondary
    return GateDecision.WARN if rejected and row.delta < 0 else GateDecision.PASS


VERDICTS: Final[Mapping[GateFamily, Callable[[GateTestResult, GateSpec], GateDecision]]] = {
    "primary": primary_verdict,
    "secondary": secondary_verdict,
    "safety": safety_verdict,
}

REASONS: Final[Mapping[GateFamily, str]] = {
    "primary": NO_SIGNIFICANT_IMPROVEMENT,
    "secondary": SIDE_REGRESSION,
    "safety": SAFETY_REGRESSION,
}

DECISION_ORDER: Final[tuple[GateDecision, ...]] = (GateDecision.BLOCK, GateDecision.WARN, GateDecision.PASS)


def judged(rows: Sequence[GateTestResult], spec: GateSpec) -> tuple[GateTestResult, ...]:
    return tuple(row.model_copy(update={"verdict": VERDICTS[row.family](row, spec)}) for row in rows)


def decision_of(rows: Sequence[GateTestResult]) -> tuple[GateDecision, str | None]:
    for decision in DECISION_ORDER[:-1]:
        offender = next((row for row in rows if row.verdict is decision), None)
        if offender is not None:
            return decision, REASONS[offender.family]
    return GateDecision.PASS, None


def build_gate(request: GateRequest, statistics: Statistics | None, repeats: int = 1) -> GateReport:
    if statistics is None:
        return unavailable(request, STATISTICS_UNAVAILABLE, repeats)
    stop = admission(request)
    if stop is not None:
        return unavailable(request, stop.reason_code, repeats)
    builder = GateBuilder(statistics, request.spec.bootstrap.resamples, request.spec.bootstrap.seed)
    rows = judged([row for name in FAMILY_ORDER for row in family_rows(builder, request, name)], request.spec)
    decision, reason = decision_of(rows)
    report = GateReport(
        decision=decision,
        reason_code=reason,
        spec_a_hash=request.spec_a_hash,
        spec_b_hash=request.spec_b_hash,
        gate_config_hash=gate_config_hash(request.spec),
        seeds=request.seeds,
        repeats=repeats,
        per_test=rows,
        dropped_cases=request.dropped_cases,
        content_hash="",
    )
    return sealed(report)
