import statistics
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Final, Literal, Self

import numpy as np

QUANTILE_METHOD: Final = "linear"


class ShapeMismatch(TypeError):
    def __init__(self, expected: str, found: object) -> None:
        super().__init__(f"expected {expected} samples, got {type(found).__name__}")


def kept[T](values: Sequence[T], keep: Sequence[bool]) -> tuple[T, ...]:
    return tuple(value for value, chosen in zip(values, keep, strict=True) if chosen)


@dataclass(frozen=True, slots=True)
class RateSamples:
    cases: tuple[tuple[int, int], ...]

    @property
    def size(self) -> int:
        return len(self.cases)

    @property
    def attempts(self) -> int:
        return sum(total for _, total in self.cases)

    @property
    def successes(self) -> int:
        return sum(passed for passed, _ in self.cases)

    def present(self) -> tuple[bool, ...]:
        return tuple(total > 0 for _, total in self.cases)

    def take(self, keep: Sequence[bool]) -> Self:
        return replace(self, cases=kept(self.cases, keep))

    def means(self) -> tuple[float, ...]:
        return tuple(passed / total for passed, total in self.cases)

    def outcomes(self) -> tuple[tuple[float, ...], ...]:
        return tuple((1.0,) * passed + (0.0,) * (total - passed) for passed, total in self.cases)

    def point(self) -> float | None:
        if not self.cases:
            return None
        return statistics.fmean(self.means())


@dataclass(frozen=True, slots=True)
class MeanSamples:
    cases: tuple[tuple[float, ...], ...]

    @property
    def size(self) -> int:
        return len(self.cases)

    @property
    def attempts(self) -> int:
        return sum(len(values) for values in self.cases)

    def present(self) -> tuple[bool, ...]:
        return tuple(bool(values) for values in self.cases)

    def take(self, keep: Sequence[bool]) -> Self:
        return replace(self, cases=kept(self.cases, keep))

    def means(self) -> tuple[float, ...]:
        return tuple(statistics.fmean(values) for values in self.cases)

    def point(self) -> float | None:
        if not self.cases:
            return None
        return statistics.fmean(self.means())


@dataclass(frozen=True, slots=True)
class RatioSamples:
    cases: tuple[tuple[float, float], ...]

    @property
    def size(self) -> int:
        return len(self.cases)

    @property
    def attempts(self) -> int:
        return len(self.cases)

    @property
    def numerator(self) -> float:
        return sum(top for top, _ in self.cases)

    @property
    def denominator(self) -> float:
        return sum(bottom for _, bottom in self.cases)

    def present(self) -> tuple[bool, ...]:
        return (True,) * len(self.cases)

    def take(self, keep: Sequence[bool]) -> Self:
        return replace(self, cases=kept(self.cases, keep))

    def point(self) -> float | None:
        if self.denominator <= 0:
            return None
        return self.numerator / self.denominator


@dataclass(frozen=True, slots=True)
class QuantileSamples:
    cases: tuple[tuple[float, ...], ...]
    share: float
    minimum_attempts: int = 1

    @property
    def size(self) -> int:
        return len(self.cases)

    @property
    def attempts(self) -> int:
        return sum(len(values) for values in self.cases)

    def present(self) -> tuple[bool, ...]:
        return tuple(bool(values) for values in self.cases)

    def take(self, keep: Sequence[bool]) -> Self:
        return replace(self, cases=kept(self.cases, keep))

    def point(self) -> float | None:
        values = [value for case in self.cases for value in case]
        if not values:
            return None
        return float(np.quantile(np.asarray(values, dtype=np.float64), self.share, method=QUANTILE_METHOD))


type Samples = RateSamples | MeanSamples | RatioSamples | QuantileSamples

MEAN_SHAPES: Final = (RateSamples, MeanSamples)


def expect[S: Samples](samples: Samples, shape: type[S]) -> S:
    if isinstance(samples, shape):
        return samples
    raise ShapeMismatch(shape.__name__, samples)


def case_means(samples: Samples) -> tuple[float, ...]:
    if isinstance(samples, MEAN_SHAPES):
        return samples.means()
    raise ShapeMismatch("rate or mean", samples)


def filled[S: Samples](samples: S) -> S:
    return samples.take(samples.present())


def aligned[S: Samples](baseline: S, candidate: S) -> tuple[S, S]:
    both = tuple(left and right for left, right in zip(baseline.present(), candidate.present(), strict=True))
    return baseline.take(both), candidate.take(both)


@dataclass(frozen=True, slots=True)
class Bound:
    side: Literal["above", "below"]
    value: float
    margin: float

    @property
    def edge(self) -> float:
        if self.side == "above":
            return self.value + self.margin
        return self.value - self.margin


@dataclass(frozen=True, slots=True)
class StatConfig:
    seed: int
    confidence: float = 0.95
    large_cases: int = 50
    rare_share: float = 0.10
    min_discordant: int = 10
    bca_resamples: int = 9999
    percentile_resamples: int = 4000
    quantile_resamples: int = 2000
    min_bootstrap_cases: int = 5
