from dataclasses import dataclass
from typing import Final

import numpy as np
from scipy import stats

from aqven.series.model import Estimate, StatMethod
from aqven.series.stats.numerics import FloatArray, floats, has_nan, interval, quiet, rng_of, two_sided_p
from aqven.series.stats.samples import (
    QuantileSamples,
    RatioSamples,
    Samples,
    StatConfig,
    case_means,
    expect,
)
from aqven.series.stats.single import PooledCases, case_ratio

WIN_SHARE: Final = 0.5
CONSTANT_P: Final = 0.0


def differences(baseline: Samples, candidate: Samples, sign: int) -> FloatArray:
    return sign * (floats(case_means(candidate)) - floats(case_means(baseline)))


def paired_attempts(baseline: Samples, candidate: Samples) -> int:
    return baseline.attempts + candidate.attempts


@dataclass(frozen=True, slots=True)
class ExactSign:
    def estimate(self, baseline: Samples, candidate: Samples, sign: int, config: StatConfig) -> Estimate:
        spread = differences(baseline, candidate, sign)
        discordant = spread[spread != 0]
        wins = int(np.count_nonzero(discordant > 0))
        with quiet():
            test = stats.binomtest(wins, discordant.size, p=WIN_SHARE)
            share = test.proportion_ci(confidence_level=config.confidence, method="exact")
        scale = float(np.mean(np.abs(discordant))) * discordant.size / spread.size
        return interval(
            float(np.mean(spread)),
            (2 * float(share.low) - 1) * scale,
            (2 * float(share.high) - 1) * scale,
            StatMethod.EXACT_SIGN,
            float(test.pvalue),
            spread.size,
            paired_attempts(baseline, candidate),
        )


@dataclass(frozen=True, slots=True)
class PairedT:
    def estimate(self, baseline: Samples, candidate: Samples, sign: int, config: StatConfig) -> Estimate:
        spread = differences(baseline, candidate, sign)
        value = float(np.mean(spread))
        attempts = paired_attempts(baseline, candidate)
        if float(np.ptp(spread)) == 0:
            return interval(value, value, value, StatMethod.PAIRED_T, CONSTANT_P, spread.size, attempts)
        with quiet():
            test = stats.ttest_1samp(spread, popmean=0.0)
            found = test.confidence_interval(confidence_level=config.confidence)
        return interval(
            value, float(found.low), float(found.high), StatMethod.PAIRED_T, float(test.pvalue), spread.size, attempts
        )


@dataclass(frozen=True, slots=True)
class PairedBca:
    def estimate(self, baseline: Samples, candidate: Samples, sign: int, config: StatConfig) -> Estimate:
        spread = differences(baseline, candidate, sign)
        with quiet():
            result = stats.bootstrap(
                (spread,),
                np.mean,
                method="BCa",
                n_resamples=config.bca_resamples,
                confidence_level=config.confidence,
                vectorized=True,
                rng=rng_of(config.seed),
            )
        low, high = float(result.confidence_interval.low), float(result.confidence_interval.high)
        if has_nan(low, high):
            return PairedT().estimate(baseline, candidate, sign, config)
        return interval(
            float(np.mean(spread)),
            low,
            high,
            StatMethod.PAIRED_BCA,
            two_sided_p(floats(result.bootstrap_distribution)),
            spread.size,
            paired_attempts(baseline, candidate),
        )


@dataclass(frozen=True, slots=True)
class PairedBootstrapRatio:
    def estimate(self, baseline: Samples, candidate: Samples, sign: int, config: StatConfig) -> Estimate:
        before = expect(baseline, RatioSamples)
        after = expect(candidate, RatioSamples)

        def statistic(
            after_top: FloatArray,
            after_bottom: FloatArray,
            before_top: FloatArray,
            before_bottom: FloatArray,
            axis: int = -1,
        ) -> FloatArray:
            return sign * (case_ratio(after_top, after_bottom, axis) - case_ratio(before_top, before_bottom, axis))

        with quiet():
            result = stats.bootstrap(
                (
                    floats([top for top, _ in after.cases]),
                    floats([bottom for _, bottom in after.cases]),
                    floats([top for top, _ in before.cases]),
                    floats([bottom for _, bottom in before.cases]),
                ),
                statistic,
                paired=True,
                vectorized=True,
                method="percentile",
                n_resamples=config.percentile_resamples,
                confidence_level=config.confidence,
                rng=rng_of(config.seed),
            )
        value = sign * (after.numerator / after.denominator - before.numerator / before.denominator)
        return interval(
            value,
            float(result.confidence_interval.low),
            float(result.confidence_interval.high),
            StatMethod.PAIRED_BOOTSTRAP_RATIO,
            two_sided_p(floats(result.bootstrap_distribution)),
            after.size,
            paired_attempts(baseline, candidate),
        )


@dataclass(frozen=True, slots=True)
class PairedBootstrapQuantile:
    def estimate(self, baseline: Samples, candidate: Samples, sign: int, config: StatConfig) -> Estimate:
        before = expect(baseline, QuantileSamples)
        after = expect(candidate, QuantileSamples)
        before_pool = PooledCases.of(before.cases)
        after_pool = PooledCases.of(after.cases)

        def statistic(indices: FloatArray) -> float:
            return sign * (after_pool.quantile(indices, after.share) - before_pool.quantile(indices, before.share))

        with quiet():
            result = stats.bootstrap(
                (np.arange(after.size),),
                statistic,
                vectorized=False,
                method="percentile",
                n_resamples=config.quantile_resamples,
                confidence_level=config.confidence,
                rng=rng_of(config.seed),
            )
        everything = floats(np.arange(after.size))
        return interval(
            sign * (after_pool.quantile(everything, after.share) - before_pool.quantile(everything, before.share)),
            float(result.confidence_interval.low),
            float(result.confidence_interval.high),
            StatMethod.PAIRED_BOOTSTRAP_QUANTILE,
            two_sided_p(floats(result.bootstrap_distribution)),
            after.size,
            paired_attempts(baseline, candidate),
        )
