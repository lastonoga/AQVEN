from dataclasses import dataclass
from typing import Final, Protocol

from aqven.series.model import DegenerateReason
from aqven.series.stats.samples import (
    MEAN_SHAPES,
    QuantileSamples,
    RateSamples,
    RatioSamples,
    Samples,
    StatConfig,
)

PAIR: Final = 2
CERTAIN_OUTCOMES: Final = (frozenset({0.0}), frozenset({1.0}))


class Guard(Protocol):
    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None: ...


def empty_ratio(samples: Samples) -> bool:
    return isinstance(samples, RatioSamples) and samples.denominator <= 0


@dataclass(frozen=True, slots=True)
class NoData:
    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None:
        if any(sample.size == 0 or empty_ratio(sample) for sample in samples):
            return DegenerateReason.NO_DATA
        return None


@dataclass(frozen=True, slots=True)
class TooFewAttempts:
    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None:
        short = (
            isinstance(sample, QuantileSamples) and sample.attempts < sample.minimum_attempts for sample in samples
        )
        if any(short):
            return DegenerateReason.TOO_FEW_ATTEMPTS
        return None


@dataclass(frozen=True, slots=True)
class TooFewCases:
    minimum: int

    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None:
        if any(sample.size < self.minimum for sample in samples):
            return DegenerateReason.TOO_FEW_CASES
        return None


@dataclass(frozen=True, slots=True)
class Uninformative:
    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None:
        if len(samples) != PAIR or not all(isinstance(sample, RateSamples) for sample in samples):
            return None
        seen = frozenset(mean for sample in samples if isinstance(sample, RateSamples) for mean in sample.means())
        if seen in CERTAIN_OUTCOMES:
            return DegenerateReason.UNINFORMATIVE
        return None


@dataclass(frozen=True, slots=True)
class NoDiscordance:
    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None:
        if len(samples) != PAIR:
            return None
        baseline, candidate = samples
        if not (isinstance(baseline, MEAN_SHAPES) and isinstance(candidate, MEAN_SHAPES)):
            return None
        if baseline.means() == candidate.means():
            return DegenerateReason.NO_DISCORDANCE
        return None


@dataclass(frozen=True, slots=True)
class GuardChain:
    guards: tuple[Guard, ...]

    def check(self, samples: tuple[Samples, ...], config: StatConfig) -> DegenerateReason | None:
        reasons = (guard.check(samples, config) for guard in self.guards)
        return next((reason for reason in reasons if reason is not None), None)


def guard_chain(minimum_cases: int) -> GuardChain:
    return GuardChain(guards=(NoData(), TooFewAttempts(), TooFewCases(minimum_cases), Uninformative(), NoDiscordance()))
