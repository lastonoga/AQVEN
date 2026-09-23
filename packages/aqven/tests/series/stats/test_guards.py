import pytest

from aqven.series.model import DegenerateReason
from aqven.series.stats.guards import (
    GuardChain,
    NoData,
    NoDiscordance,
    TooFewAttempts,
    TooFewCases,
    Uninformative,
    guard_chain,
)
from aqven.series.stats.samples import (
    MeanSamples,
    QuantileSamples,
    RateSamples,
    RatioSamples,
    Samples,
    StatConfig,
)
from aqven.series.stats.strategies import paired, single
from aqven.spec import MetricDirection

CONFIG = StatConfig(seed=7)
HIGHER = MetricDirection.HIGHER_IS_BETTER


@pytest.mark.parametrize(
    ("samples", "reason"),
    [
        (RateSamples(cases=()), DegenerateReason.NO_DATA),
        (RateSamples(cases=((0, 0), (0, 0))), DegenerateReason.NO_DATA),
        (RatioSamples(cases=((0.01, 0.0),) * 8), DegenerateReason.NO_DATA),
        (QuantileSamples(cases=((1.0, 2.0),) * 9, share=0.95, minimum_attempts=20), DegenerateReason.TOO_FEW_ATTEMPTS),
        (MeanSamples(cases=((0.4, 0.6),)), DegenerateReason.TOO_FEW_CASES),
        (RateSamples(cases=((1, 3),)), DegenerateReason.TOO_FEW_CASES),
        (RatioSamples(cases=((0.01, 1.0),) * 4), DegenerateReason.TOO_FEW_CASES),
        (QuantileSamples(cases=((1.0,),) * 4, share=0.5), DegenerateReason.TOO_FEW_CASES),
    ],
)
def test_single_guards(samples: Samples, reason: DegenerateReason) -> None:
    estimate = single(samples, None, CONFIG)

    assert estimate.degenerate is reason
    assert (estimate.low, estimate.high, estimate.method) == (None, None, None)


def test_wilson_needs_a_single_case_only() -> None:
    estimate = single(RateSamples(cases=((1, 1),)), None, CONFIG)

    assert estimate.degenerate is None
    assert estimate.low is not None


def test_degenerate_estimates_keep_the_point_value() -> None:
    estimate = single(MeanSamples(cases=((0.4, 0.6),)), None, CONFIG)

    assert estimate.value == pytest.approx(0.5)
    assert (estimate.cases, estimate.attempts) == (1, 2)


@pytest.mark.parametrize(
    ("baseline", "candidate", "reason"),
    [
        (RateSamples(cases=((1, 1),) * 5), RateSamples(cases=((0, 0),) * 5), DegenerateReason.NO_DATA),
        (RateSamples(cases=((1, 1),)), RateSamples(cases=((0, 1),)), DegenerateReason.TOO_FEW_CASES),
        (RateSamples(cases=((0, 2),) * 6), RateSamples(cases=((0, 2),) * 6), DegenerateReason.UNINFORMATIVE),
        (RateSamples(cases=((1, 2),) * 6), RateSamples(cases=((1, 2),) * 6), DegenerateReason.NO_DISCORDANCE),
        (MeanSamples(cases=((0.3,),) * 6), MeanSamples(cases=((0.3,),) * 6), DegenerateReason.NO_DISCORDANCE),
        (
            RatioSamples(cases=((0.01, 1.0),) * 6),
            RatioSamples(cases=((0.01, 0.0),) * 6),
            DegenerateReason.NO_DATA,
        ),
    ],
)
def test_paired_guards(baseline: Samples, candidate: Samples, reason: DegenerateReason) -> None:
    assert paired(baseline, candidate, HIGHER, CONFIG).degenerate is reason


def test_first_guard_wins() -> None:
    chain = GuardChain(guards=(TooFewCases(3), NoData()))

    assert chain.check((RateSamples(cases=()),), CONFIG) is DegenerateReason.TOO_FEW_CASES


def test_chain_order_follows_the_contract() -> None:
    kinds = [type(guard) for guard in guard_chain(2).guards]

    assert kinds == [NoData, TooFewAttempts, TooFewCases, Uninformative, NoDiscordance]


def test_pair_guards_ignore_single_samples() -> None:
    lone = (RateSamples(cases=((2, 2),) * 4),)

    assert Uninformative().check(lone, CONFIG) is None
    assert NoDiscordance().check(lone, CONFIG) is None


def test_constant_nonzero_mean_difference_is_not_degenerate() -> None:
    estimate = paired(MeanSamples(cases=((0.1,),) * 6), MeanSamples(cases=((0.3,),) * 6), HIGHER, CONFIG)

    assert estimate.degenerate is None
