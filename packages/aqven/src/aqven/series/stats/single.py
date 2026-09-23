import math
import statistics
from collections import Counter
from dataclasses import dataclass
from typing import Final

import numpy as np
from scipy import stats

from aqven.series.model import Estimate, StatMethod
from aqven.series.stats.numerics import (
    ALTERNATIVES,
    FloatArray,
    constant_p,
    floats,
    has_nan,
    interval,
    quiet,
    rng_of,
    score_p,
    tail_p,
    wilson_bounds,
    z_of,
)
from aqven.series.stats.power import FULL_CORRELATION, icc_of
from aqven.series.stats.samples import (
    QUANTILE_METHOD,
    Bound,
    MeanSamples,
    QuantileSamples,
    RateSamples,
    RatioSamples,
    Samples,
    StatConfig,
    expect,
)

GRID_THETA: Final = np.linspace(0.0005, 0.9995, 1000)
GRID_PRECISION: Final = np.exp(np.linspace(math.log(0.05), math.log(500.0), 200))
GRID_ALPHA: Final = GRID_PRECISION[None, :] * GRID_THETA[:, None]
GRID_BETA: Final = GRID_PRECISION[None, :] * (1 - GRID_THETA[:, None])
GRID_PRIOR: Final = stats.gamma.logpdf(GRID_PRECISION, 1.0, scale=1.0) + np.log(GRID_PRECISION)
GRID_LAST: Final = GRID_THETA.size - 1
EVEN_SHARE: Final = 0.5


@dataclass(frozen=True, slots=True)
class WilsonByCases:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        rates = expect(samples, RateSamples)
        successes, size = rates.successes, rates.attempts
        with quiet():
            found = stats.binomtest(successes, size).proportion_ci(confidence_level=config.confidence, method="wilson")
        rate = successes / size
        return interval(
            rate,
            float(found.low),
            float(found.high),
            StatMethod.WILSON,
            score_p(rate, size, bound),
            rates.size,
            rates.attempts,
        )


@dataclass(frozen=True, slots=True)
class KishWilson:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        rates = expect(samples, RateSamples)
        found_icc = icc_of(rates.outcomes())
        icc = FULL_CORRELATION if found_icc is None else found_icc
        mean_repeats = rates.attempts / rates.size
        effective = rates.attempts / (1 + (mean_repeats - 1) * icc)
        rate = statistics.fmean(rates.means())
        low, high = wilson_bounds(rate, effective, z_of(config.confidence))
        return interval(
            rate, low, high, StatMethod.KISH_WILSON, score_p(rate, effective, bound), rates.size, rates.attempts
        )


@dataclass(frozen=True, slots=True)
class BetaBinomialGrid:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        rates = expect(samples, RateSamples)
        repeats = rates.cases[0][1]
        failures_rare = statistics.fmean(rates.means()) > EVEN_SHARE
        rare = Counter(total - passed if failures_rare else passed for passed, total in rates.cases)
        marginal = posterior(rare, repeats)
        cumulative = np.cumsum(marginal)
        tail = (1 - config.confidence) / 2
        low = float(GRID_THETA[int(np.searchsorted(cumulative, tail))])
        high = float(GRID_THETA[min(int(np.searchsorted(cumulative, 1 - tail)), GRID_LAST)])
        mean = float(np.sum(GRID_THETA * marginal))
        success_grid = 1 - GRID_THETA if failures_rare else GRID_THETA
        value, lower, upper = (1 - mean, 1 - high, 1 - low) if failures_rare else (mean, low, high)
        return interval(
            value,
            lower,
            upper,
            StatMethod.BETA_BINOMIAL,
            posterior_tail(success_grid, marginal, bound),
            rates.size,
            rates.attempts,
        )


def posterior(rare: Counter[int], repeats: int) -> FloatArray:
    with quiet():
        layers = [
            count * floats(stats.betabinom.logpmf(seen, repeats, GRID_ALPHA, GRID_BETA))
            for seen, count in sorted(rare.items())
        ]
    log_posterior = floats(np.sum(np.stack(layers), axis=0)) + GRID_PRIOR[None, :]
    weights = np.exp(log_posterior - log_posterior.max())
    marginal = weights.sum(axis=1)
    return floats(marginal / marginal.sum())


def posterior_tail(success_grid: FloatArray, marginal: FloatArray, bound: Bound | None) -> float | None:
    if bound is None:
        return None
    null = success_grid <= bound.edge if bound.side == "above" else success_grid >= bound.edge
    return min(1.0, float(np.sum(marginal[null])))


@dataclass(frozen=True, slots=True)
class TOnCaseMeans:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        means = floats(expect(samples, MeanSamples).means())
        return t_on_means(means, bound, config, StatMethod.T_CASE_MEANS, samples)


def t_on_means(
    means: FloatArray, bound: Bound | None, config: StatConfig, method: StatMethod, samples: Samples
) -> Estimate:
    value = float(np.mean(means))
    if float(np.ptp(means)) == 0:
        return interval(value, value, value, method, constant_p(value, bound), samples.size, samples.attempts)
    with quiet():
        found = stats.ttest_1samp(means, popmean=0.0).confidence_interval(confidence_level=config.confidence)
        p_value = one_sample_p(means, bound)
    return interval(value, float(found.low), float(found.high), method, p_value, samples.size, samples.attempts)


def one_sample_p(means: FloatArray, bound: Bound | None) -> float | None:
    if bound is None:
        return None
    return float(stats.ttest_1samp(means, popmean=bound.edge, alternative=ALTERNATIVES[bound.side]).pvalue)


@dataclass(frozen=True, slots=True)
class BcaOnCaseMeans:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        means = floats(expect(samples, MeanSamples).means())
        with quiet():
            result = stats.bootstrap(
                (means,),
                np.mean,
                method="BCa",
                n_resamples=config.bca_resamples,
                confidence_level=config.confidence,
                vectorized=True,
                rng=rng_of(config.seed),
            )
        low, high = float(result.confidence_interval.low), float(result.confidence_interval.high)
        if has_nan(low, high):
            return TOnCaseMeans().estimate(samples, bound, config)
        distribution = floats(result.bootstrap_distribution)
        return interval(
            float(np.mean(means)),
            low,
            high,
            StatMethod.BCA_CASE_MEANS,
            tail_p(distribution, bound),
            samples.size,
            samples.attempts,
        )


def case_ratio(numerators: FloatArray, denominators: FloatArray, axis: int = -1) -> FloatArray:
    top = np.sum(numerators, axis=axis)
    bottom = np.sum(denominators, axis=axis)
    return np.divide(top, bottom, out=np.full(np.shape(top), np.inf), where=bottom > 0)


@dataclass(frozen=True, slots=True)
class CaseBootstrapRatio:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        ratios = expect(samples, RatioSamples)
        numerators = floats([top for top, _ in ratios.cases])
        denominators = floats([bottom for _, bottom in ratios.cases])
        with quiet():
            result = stats.bootstrap(
                (numerators, denominators),
                case_ratio,
                paired=True,
                vectorized=True,
                method="percentile",
                n_resamples=config.percentile_resamples,
                confidence_level=config.confidence,
                rng=rng_of(config.seed),
            )
        return interval(
            ratios.numerator / ratios.denominator,
            float(result.confidence_interval.low),
            float(result.confidence_interval.high),
            StatMethod.BOOTSTRAP_RATIO,
            tail_p(floats(result.bootstrap_distribution), bound),
            ratios.size,
            ratios.attempts,
        )


@dataclass(frozen=True, slots=True)
class PooledCases:
    values: FloatArray
    owners: np.ndarray[tuple[int], np.dtype[np.intp]]
    size: int

    @classmethod
    def of(cls, cases: tuple[tuple[float, ...], ...]) -> PooledCases:
        values = floats([value for case in cases for value in case])
        owners = np.repeat(np.arange(len(cases), dtype=np.intp), [len(case) for case in cases])
        return cls(values=values, owners=owners, size=len(cases))

    def quantile(self, indices: FloatArray, share: float) -> float:
        multiplicity = np.bincount(indices.astype(np.intp), minlength=self.size)
        return float(np.quantile(np.repeat(self.values, multiplicity[self.owners]), share, method=QUANTILE_METHOD))


@dataclass(frozen=True, slots=True)
class CaseBootstrapQuantile:
    def estimate(self, samples: Samples, bound: Bound | None, config: StatConfig) -> Estimate:
        quantiles = expect(samples, QuantileSamples)
        pooled = PooledCases.of(quantiles.cases)

        def statistic(indices: FloatArray) -> float:
            return pooled.quantile(indices, quantiles.share)

        with quiet():
            result = stats.bootstrap(
                (np.arange(quantiles.size),),
                statistic,
                vectorized=False,
                method="percentile",
                n_resamples=config.quantile_resamples,
                confidence_level=config.confidence,
                rng=rng_of(config.seed),
            )
        return interval(
            float(np.quantile(pooled.values, quantiles.share, method=QUANTILE_METHOD)),
            float(result.confidence_interval.low),
            float(result.confidence_interval.high),
            StatMethod.BOOTSTRAP_QUANTILE,
            tail_p(floats(result.bootstrap_distribution), bound),
            quantiles.size,
            quantiles.attempts,
        )
