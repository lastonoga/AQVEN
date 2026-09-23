from collections.abc import Callable
from dataclasses import dataclass
from typing import Final, Protocol

from aqven.series.model import Estimate
from aqven.series.stats.guards import guard_chain
from aqven.series.stats.numerics import degenerate
from aqven.series.stats.paired import (
    ExactSign,
    PairedBca,
    PairedBootstrapQuantile,
    PairedBootstrapRatio,
    PairedT,
    differences,
)
from aqven.series.stats.samples import (
    Bound,
    MeanSamples,
    QuantileSamples,
    RateSamples,
    RatioSamples,
    Samples,
    ShapeMismatch,
    StatConfig,
    aligned,
    filled,
)
from aqven.series.stats.single import (
    BcaOnCaseMeans,
    BetaBinomialGrid,
    CaseBootstrapQuantile,
    CaseBootstrapRatio,
    KishWilson,
    TOnCaseMeans,
    WilsonByCases,
)
from aqven.spec import MetricDirection

ONE_ATTEMPT: Final = 1
SIGNS: Final[dict[MetricDirection, int]] = {
    MetricDirection.HIGHER_IS_BETTER: 1,
    MetricDirection.LOWER_IS_BETTER: -1,
}

type CaseFloor = Callable[[StatConfig], int]


class SingleStrategy(Protocol):
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate: ...


class PairedStrategy(Protocol):
    def estimate(self, baseline: Samples, candidate: Samples, sign: int, config: StatConfig) -> Estimate: ...


def one_case(config: StatConfig) -> int:
    return 1


def two_cases(config: StatConfig) -> int:
    return 2


def bootstrap_cases(config: StatConfig) -> int:
    return config.min_bootstrap_cases


def any_single(samples: Samples, config: StatConfig) -> bool:
    return True


def any_pair(baseline: Samples, candidate: Samples, config: StatConfig) -> bool:
    return True


def one_attempt_each(samples: RateSamples, config: StatConfig) -> bool:
    return all(total == ONE_ATTEMPT for _, total in samples.cases)


def rare_with_equal_repeats(samples: RateSamples, config: StatConfig) -> bool:
    repeats = {total for _, total in samples.cases}
    rate = samples.point()
    if len(repeats) != 1 or rate is None:
        return False
    return min(rate, 1 - rate) < config.rare_share


def few_cases(samples: MeanSamples, config: StatConfig) -> bool:
    return samples.size < config.large_cases


def few_discordant(baseline: RateSamples, candidate: RateSamples, config: StatConfig) -> bool:
    discordant = int((differences(baseline, candidate, 1) != 0).sum())
    return discordant < config.min_discordant


def few_pairs(baseline: Samples, candidate: Samples, config: StatConfig) -> bool:
    return candidate.size < config.large_cases


@dataclass(frozen=True, slots=True)
class SingleRow[S: Samples]:
    shape: type[S]
    when: Callable[[S, StatConfig], bool]
    strategy: SingleStrategy
    floor: CaseFloor

    def applies(self, samples: Samples, config: StatConfig) -> bool:
        return isinstance(samples, self.shape) and self.when(samples, config)


@dataclass(frozen=True, slots=True)
class PairedRow[S: Samples]:
    shape: type[S]
    when: Callable[[S, S, StatConfig], bool]
    strategy: PairedStrategy
    floor: CaseFloor

    def applies(self, baseline: Samples, candidate: Samples, config: StatConfig) -> bool:
        if not (isinstance(baseline, self.shape) and isinstance(candidate, self.shape)):
            return False
        return self.when(baseline, candidate, config)


SINGLE_TABLE: Final = (
    SingleRow(RateSamples, one_attempt_each, WilsonByCases(), one_case),
    SingleRow(RateSamples, rare_with_equal_repeats, BetaBinomialGrid(), one_case),
    SingleRow(RateSamples, any_single, KishWilson(), two_cases),
    SingleRow(MeanSamples, few_cases, TOnCaseMeans(), two_cases),
    SingleRow(MeanSamples, any_single, BcaOnCaseMeans(), bootstrap_cases),
    SingleRow(RatioSamples, any_single, CaseBootstrapRatio(), bootstrap_cases),
    SingleRow(QuantileSamples, any_single, CaseBootstrapQuantile(), bootstrap_cases),
)

PAIRED_TABLE: Final = (
    PairedRow(RateSamples, few_discordant, ExactSign(), two_cases),
    PairedRow(RateSamples, few_pairs, PairedT(), two_cases),
    PairedRow(RateSamples, any_pair, PairedBca(), two_cases),
    PairedRow(MeanSamples, few_pairs, PairedT(), two_cases),
    PairedRow(MeanSamples, any_pair, PairedBca(), two_cases),
    PairedRow(RatioSamples, any_pair, PairedBootstrapRatio(), bootstrap_cases),
    PairedRow(QuantileSamples, any_pair, PairedBootstrapQuantile(), bootstrap_cases),
)


def single(samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
    kept = filled(samples)
    row = next((row for row in SINGLE_TABLE if row.applies(kept, config)), None)
    if row is None:
        raise ShapeMismatch("known", samples)
    reason = guard_chain(row.floor(config)).check((kept,), config)
    if reason is not None:
        return degenerate(kept.point(), reason, kept.size, kept.attempts)
    return row.strategy.estimate(kept, bound, config)


def pair_point(baseline: Samples, candidate: Samples, sign: int) -> float | None:
    before, after = baseline.point(), candidate.point()
    if before is None or after is None:
        return None
    return sign * (after - before)


def paired(baseline: Samples, candidate: Samples, direction: MetricDirection, config: StatConfig) -> Estimate:
    if type(baseline) is not type(candidate):
        raise ShapeMismatch(type(baseline).__name__, candidate)
    before, after = aligned(baseline, candidate)
    row = next((row for row in PAIRED_TABLE if row.applies(before, after, config)), None)
    if row is None:
        raise ShapeMismatch("known", candidate)
    sign = SIGNS[direction]
    reason = guard_chain(row.floor(config)).check((before, after), config)
    if reason is not None:
        return degenerate(pair_point(before, after, sign), reason, after.size, before.attempts + after.attempts)
    return row.strategy.estimate(before, after, sign, config)
