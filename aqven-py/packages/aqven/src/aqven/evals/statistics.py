import random
from collections.abc import Sequence
from dataclasses import dataclass
from math import comb
from statistics import fmean
from typing import Final, Protocol

from aqven.spec import MetricKind

BOOTSTRAP_METHOD: Final = "paired_bootstrap"
EXACT_METHOD: Final = "mcnemar_exact"
LOWER_QUANTILE: Final = 0.025
UPPER_QUANTILE: Final = 0.975
CERTAIN: Final = 1.0


@dataclass(frozen=True, slots=True)
class PairedSample:
    kind: MetricKind
    baseline: tuple[float, ...]
    candidate: tuple[float, ...]

    @property
    def size(self) -> int:
        return len(self.baseline)

    @property
    def differences(self) -> tuple[float, ...]:
        return tuple(after - before for before, after in zip(self.baseline, self.candidate, strict=True))


@dataclass(frozen=True, slots=True)
class PairedOutcome:
    p_value: float
    ci_lo: float
    ci_hi: float
    method: str


class Statistics(Protocol):
    def paired(self, sample: PairedSample, resamples: int, seed: int) -> PairedOutcome: ...

    def holm(self, p_values: Sequence[float], alpha: float) -> tuple[float, ...]: ...

    def fdr(self, p_values: Sequence[float], q: float) -> tuple[float, ...]: ...


def quantile(values: Sequence[float], share: float) -> float:
    if not values:
        return 0.0
    position = min(len(values) - 1, max(0, round(share * (len(values) - 1))))
    return values[position]


def bootstrap_means(differences: Sequence[float], resamples: int, seed: int) -> tuple[float, ...]:
    generator = random.Random(seed)
    size = len(differences)
    return tuple(sorted(fmean(generator.choices(differences, k=size)) for _ in range(resamples)))


def two_sided(means: Sequence[float]) -> float:
    if not means:
        return CERTAIN
    below = sum(1 for value in means if value <= 0)
    above = sum(1 for value in means if value >= 0)
    return min(CERTAIN, 2 * min(below, above) / len(means))


def exact_p(wins: int, losses: int) -> float:
    discordant = wins + losses
    if discordant == 0:
        return CERTAIN
    tail = sum(comb(discordant, count) for count in range(min(wins, losses) + 1))
    return min(CERTAIN, 2 * tail / 2**discordant)


@dataclass(frozen=True, slots=True)
class PairedStatistics:
    def paired(self, sample: PairedSample, resamples: int, seed: int) -> PairedOutcome:
        differences = sample.differences
        if not differences or not any(differences):
            return PairedOutcome(p_value=CERTAIN, ci_lo=0.0, ci_hi=0.0, method=self._method(sample))
        means = bootstrap_means(differences, resamples, seed)
        return PairedOutcome(
            p_value=self._p_value(sample, differences, means),
            ci_lo=quantile(means, LOWER_QUANTILE),
            ci_hi=quantile(means, UPPER_QUANTILE),
            method=self._method(sample),
        )

    def holm(self, p_values: Sequence[float], alpha: float) -> tuple[float, ...]:
        ordered = sorted(range(len(p_values)), key=lambda index: p_values[index])
        adjusted = [CERTAIN] * len(p_values)
        running = 0.0
        for rank, index in enumerate(ordered):
            running = max(running, min(CERTAIN, (len(p_values) - rank) * p_values[index]))
            adjusted[index] = running
        return tuple(adjusted)

    def fdr(self, p_values: Sequence[float], q: float) -> tuple[float, ...]:
        ordered = sorted(range(len(p_values)), key=lambda index: p_values[index], reverse=True)
        adjusted = [CERTAIN] * len(p_values)
        running = CERTAIN
        for position, index in enumerate(ordered):
            rank = len(p_values) - position
            running = min(running, min(CERTAIN, len(p_values) * p_values[index] / rank))
            adjusted[index] = running
        return tuple(adjusted)

    def _method(self, sample: PairedSample) -> str:
        return EXACT_METHOD if sample.kind is MetricKind.BINARY else BOOTSTRAP_METHOD

    def _p_value(self, sample: PairedSample, differences: Sequence[float], means: Sequence[float]) -> float:
        if sample.kind is not MetricKind.BINARY:
            return two_sided(means)
        wins = sum(1 for value in differences if value > 0)
        losses = sum(1 for value in differences if value < 0)
        return exact_p(wins, losses)
