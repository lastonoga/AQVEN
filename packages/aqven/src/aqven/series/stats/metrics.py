from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from aqven.series.model import (
    COUNTED_OUTCOMES,
    AttemptRecord,
    AttemptState,
    CheckPlan,
    CheckState,
    CheckValue,
    MetricShape,
    MetricUnit,
    OutcomeClass,
)
from aqven.series.stats.samples import MeanSamples, QuantileSamples, RateSamples, RatioSamples, Samples
from aqven.spec import MetricDirection, MetricKind, SeriesMetric

type CaseAttempts = tuple[AttemptRecord, ...]
type Include = Callable[[AttemptRecord], bool]
type Reading = Callable[[AttemptRecord], float | None]
type Sampler = Callable[[Sequence[CaseAttempts]], Samples]

HIGHER: Final = MetricDirection.HIGHER_IS_BETTER
LOWER: Final = MetricDirection.LOWER_IS_BETTER
MEDIAN: Final = 0.50
TAIL: Final = 0.95
TAIL_MINIMUM_ATTEMPTS: Final = 20
SCORED_STATES: Final = frozenset({CheckState.PASSED, CheckState.FAILED})


@dataclass(frozen=True, slots=True)
class MetricDefinition:
    name: str
    shape: MetricShape
    direction: MetricDirection
    unit: MetricUnit
    include: Include
    sampler: Sampler

    def select(self, attempts: Iterable[AttemptRecord]) -> CaseAttempts:
        return tuple(attempt for attempt in attempts if self.include(attempt))

    def samples(self, cases: Sequence[CaseAttempts]) -> Samples:
        return self.sampler(cases)


def finished(attempt: AttemptRecord) -> bool:
    return attempt.state is AttemptState.FINISHED


def counted(attempt: AttemptRecord) -> bool:
    return finished(attempt) and attempt.outcome in COUNTED_OUTCOMES


def settled(attempt: AttemptRecord) -> bool:
    return finished(attempt) and attempt.outcome is not None and attempt.outcome is not OutcomeClass.CANCELLED


def never(attempt: AttemptRecord) -> bool:
    return False


def readings(case: CaseAttempts, reading: Reading) -> tuple[float, ...]:
    return tuple(value for value in map(reading, case) if value is not None)


def rate_sampler(success: Include) -> Sampler:
    def sample(cases: Sequence[CaseAttempts]) -> Samples:
        return RateSamples(cases=tuple((sum(1 for attempt in case if success(attempt)), len(case)) for case in cases))

    return sample


def mean_sampler(reading: Reading) -> Sampler:
    def sample(cases: Sequence[CaseAttempts]) -> Samples:
        return MeanSamples(cases=tuple(readings(case, reading) for case in cases))

    return sample


def ratio_sampler(numerator: Reading, denominator: Reading) -> Sampler:
    def sample(cases: Sequence[CaseAttempts]) -> Samples:
        return RatioSamples(
            cases=tuple((sum(readings(case, numerator)), sum(readings(case, denominator))) for case in cases)
        )

    return sample


def quantile_sampler(reading: Reading, share: float, minimum_attempts: int) -> Sampler:
    def sample(cases: Sequence[CaseAttempts]) -> Samples:
        return QuantileSamples(
            cases=tuple(readings(case, reading) for case in cases), share=share, minimum_attempts=minimum_attempts
        )

    return sample


def rate_metric(name: str, direction: MetricDirection, include: Include, success: Include) -> MetricDefinition:
    return MetricDefinition(name, MetricShape.RATE, direction, MetricUnit.RATE, include, rate_sampler(success))


def mean_metric(
    name: str, direction: MetricDirection, unit: MetricUnit, include: Include, reading: Reading
) -> MetricDefinition:
    def readable(attempt: AttemptRecord) -> bool:
        return include(attempt) and reading(attempt) is not None

    return MetricDefinition(name, MetricShape.MEAN, direction, unit, readable, mean_sampler(reading))


def quantile_metric(name: str, share: float, minimum_attempts: int) -> MetricDefinition:
    def timed(attempt: AttemptRecord) -> bool:
        return counted(attempt) and attempt.latency_ms is not None

    return MetricDefinition(
        name,
        MetricShape.QUANTILE,
        LOWER,
        MetricUnit.MS,
        timed,
        quantile_sampler(latency, share, minimum_attempts),
    )


def passed(attempt: AttemptRecord) -> bool:
    return attempt.passed is True


def cost(attempt: AttemptRecord) -> float:
    return float(attempt.cost_usd)


def pass_count(attempt: AttemptRecord) -> float:
    return 1.0 if passed(attempt) else 0.0


def latency(attempt: AttemptRecord) -> float | None:
    return None if attempt.latency_ms is None else float(attempt.latency_ms)


def schema_known(attempt: AttemptRecord) -> bool:
    return counted(attempt) and attempt.schema_valid_first_try is not None


def schema_valid(attempt: AttemptRecord) -> bool:
    return attempt.schema_valid_first_try is True


def infra_error(attempt: AttemptRecord) -> bool:
    return attempt.outcome is OutcomeClass.INFRA_ERROR


BUILTIN_METRICS: Final[Mapping[SeriesMetric, MetricDefinition]] = {
    SeriesMetric.SUCCESS_RATE: rate_metric(SeriesMetric.SUCCESS_RATE.value, HIGHER, counted, passed),
    SeriesMetric.COST_USD: mean_metric(SeriesMetric.COST_USD.value, LOWER, MetricUnit.USD, counted, cost),
    SeriesMetric.COST_OF_PASS: MetricDefinition(
        SeriesMetric.COST_OF_PASS.value,
        MetricShape.RATIO,
        LOWER,
        MetricUnit.USD,
        counted,
        ratio_sampler(cost, pass_count),
    ),
    SeriesMetric.LATENCY_P50_MS: quantile_metric(SeriesMetric.LATENCY_P50_MS.value, MEDIAN, 1),
    SeriesMetric.LATENCY_P95_MS: quantile_metric(SeriesMetric.LATENCY_P95_MS.value, TAIL, TAIL_MINIMUM_ATTEMPTS),
    SeriesMetric.SCHEMA_VALID_FIRST_TRY: rate_metric(
        SeriesMetric.SCHEMA_VALID_FIRST_TRY.value, HIGHER, schema_known, schema_valid
    ),
    SeriesMetric.INFRA_ERROR_RATE: rate_metric(SeriesMetric.INFRA_ERROR_RATE.value, LOWER, settled, infra_error),
}


def check_value(attempt: AttemptRecord, check_id: str) -> CheckValue | None:
    return next((value for value in attempt.checks if value.check_id == check_id), None)


def scored_value(attempt: AttemptRecord, check_id: str) -> CheckValue | None:
    value = check_value(attempt, check_id)
    if value is None or not finished(attempt) or value.state not in SCORED_STATES:
        return None
    return value


def binary_check(check_id: str) -> MetricDefinition:
    def scored(attempt: AttemptRecord) -> bool:
        return scored_value(attempt, check_id) is not None

    def check_passed(attempt: AttemptRecord) -> bool:
        value = scored_value(attempt, check_id)
        return value is not None and value.state is CheckState.PASSED

    return rate_metric(check_id, HIGHER, scored, check_passed)


def score_check(unit: MetricUnit) -> Callable[[str], MetricDefinition]:
    def define(check_id: str) -> MetricDefinition:
        def score(attempt: AttemptRecord) -> float | None:
            value = scored_value(attempt, check_id)
            return None if value is None else value.value

        return mean_metric(check_id, HIGHER, unit, finished, score)

    return define


CHECK_METRICS: Final[Mapping[MetricKind, Callable[[str], MetricDefinition]]] = {
    MetricKind.BINARY: binary_check,
    MetricKind.CONTINUOUS: score_check(MetricUnit.SCORE),
    MetricKind.ORDINAL: score_check(MetricUnit.ORDINAL),
}


def runtime_check(name: str) -> MetricDefinition:
    def tried(attempt: AttemptRecord) -> bool:
        return counted(attempt) and any(entry.check == name for entry in attempt.runtime_checks)

    def failed_first_try(attempt: AttemptRecord) -> bool:
        return any(entry.check == name and entry.failed_first_try for entry in attempt.runtime_checks)

    return rate_metric(name, LOWER, tried, failed_first_try)


def unknown_metric(name: str) -> MetricDefinition:
    return rate_metric(name, HIGHER, never, never)


@dataclass(frozen=True, slots=True)
class MetricRegistry:
    checks: Mapping[str, MetricDefinition]
    builtins: Mapping[str, MetricDefinition]
    runtime: tuple[MetricDefinition, ...]

    @classmethod
    def of(cls, checks: Sequence[CheckPlan], attempts: Sequence[AttemptRecord]) -> MetricRegistry:
        runtime_names = sorted({entry.check for attempt in attempts for entry in attempt.runtime_checks})
        return cls(
            checks={check.check_id: CHECK_METRICS[check.kind](check.check_id) for check in checks},
            builtins={metric.value: definition for metric, definition in BUILTIN_METRICS.items()},
            runtime=tuple(runtime_check(name) for name in runtime_names),
        )

    def get(self, name: str) -> MetricDefinition:
        found = self.checks.get(name, self.builtins.get(name))
        return unknown_metric(name) if found is None else found
