import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest

from aqven.ir import CompiledProject
from aqven.runtime.address import RunId
from aqven.series.estimate import EstimatePlan as Plan
from aqven.series.estimate import (
    FlowSample,
    NodeSample,
    SeriesEstimator,
    cap_decision,
    ceil_cents,
    minutes_for,
    token_price,
)
from aqven.series.model import (
    Assignment,
    AttemptId,
    AttemptRecord,
    AttemptState,
    CaseSnapshot,
    EstimateReason,
    OutcomeClass,
    SeriesChange,
    SeriesId,
    SeriesRecord,
    VariantPlanRecord,
    VariantRole,
)
from aqven.series.views import SeriesListQuery
from aqven.spec import (
    AgentId,
    ExperimentId,
    FlowId,
    LookQuestion,
    NodeId,
    NoninferiorQuestion,
    Question,
    SeriesSplit,
    ThresholdQuestion,
    TypeId,
    VariantId,
)

NOW: Final = datetime(2026, 9, 23, 12, 0, tzinfo=UTC)
EXPERIMENT: Final = ExperimentId("triage_agents")
PROJECT: Final = CompiledProject(package="series_shop", description="estimate fixture")


def variant(variant_id: str, role: VariantRole) -> VariantPlanRecord:
    return VariantPlanRecord(
        variant_id=VariantId(variant_id),
        role=role,
        arm_id=None,
        flow_id=FlowId("triage"),
        ir_hash="",
        flow_hash="",
        input_type=TypeId("Ticket"),
        output_type=TypeId("Label"),
        assignments=(
            Assignment(
                node_id=NodeId("classify"), agent_id=AgentId("writer"), model="openai:gpt-4o-mini", overridden=False
            ),
        ),
    )


def plan(question: Question, cases: int = 12, repeats: int = 3, available: int = 24) -> Plan:
    return Plan(
        experiment_id=EXPERIMENT,
        question=question,
        on=SeriesSplit.DEV,
        cases=cases,
        repeats=repeats,
        available=available,
        planned_cases=12,
        variants=(variant("writer", VariantRole.BASELINE), variant("cheap", VariantRole.CANDIDATE)),
        checks=(),
        base=PROJECT,
        cases_sha256="sha256-cases",
    )


def noninferior(margin: float) -> Question:
    return NoninferiorQuestion.model_validate(
        {"kind": "noninferior", "baseline": "writer", "candidate": "cheap", "primary": "success_rate", "margin": margin}
    )


def threshold(margin: float) -> Question:
    return ThresholdQuestion.model_validate(
        {"kind": "threshold", "metric": "success_rate", "above": 0.8, "margin": margin}
    )


def history_row(variant_id: str, case_name: str, passed: bool, cost: str) -> AttemptRecord:
    return AttemptRecord(
        attempt_id=AttemptId(f"{variant_id}-{case_name}-{passed}-{cost}"),
        series_id=SeriesId("old"),
        ordinal=0,
        variant_id=VariantId(variant_id),
        case_name=case_name,
        split=SeriesSplit.DEV,
        repeat=1,
        run_id=RunId("run"),
        state=AttemptState.FINISHED,
        outcome=OutcomeClass.OK,
        passed=passed,
        cost_usd=Decimal(cost),
        check_cost_usd=Decimal("0.001"),
        latency_ms=2000,
        started_at=NOW,
        finished_at=NOW,
    )


@dataclass(slots=True)
class HistoryStore:
    rows: dict[str, tuple[AttemptRecord, ...]] = field(default_factory=dict[str, tuple[AttemptRecord, ...]])

    async def create(self, series: SeriesRecord, cases: Sequence[CaseSnapshot]) -> bool:
        return True

    async def series(self, series_id: SeriesId) -> SeriesRecord | None:
        return None

    async def update(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord:
        raise LookupError(series_id)

    async def search(self, query: SeriesListQuery, limit: int) -> tuple[SeriesRecord, ...]:
        return ()

    async def case(self, series_id: SeriesId, case_index: int) -> CaseSnapshot:
        raise LookupError(series_id)

    async def cases(self, series_id: SeriesId) -> tuple[CaseSnapshot, ...]:
        return ()

    async def open_attempt(self, attempt: AttemptRecord) -> None:
        return None

    async def close_attempt(self, attempt: AttemptRecord) -> None:
        return None

    async def attempts(self, series_id: SeriesId) -> tuple[AttemptRecord, ...]:
        return ()

    async def spend(self, series_id: SeriesId) -> Decimal:
        return Decimal(0)

    async def history(
        self, experiment_id: ExperimentId, variant_id: VariantId, limit: int
    ) -> tuple[AttemptRecord, ...]:
        return self.rows.get(variant_id, ())


@dataclass(frozen=True, slots=True)
class FixedSampler:
    sample_of: FlowSample | None

    async def sample(self, flow_id: str) -> FlowSample | None:
        return self.sample_of


@pytest.mark.parametrize(
    ("usd", "request_cap", "needs", "cap"),
    [
        (Decimal("0.40"), None, False, Decimal("0.50")),
        (Decimal("0.90"), None, False, Decimal("1.00")),
        (Decimal("3.00"), None, True, Decimal("3.75")),
        (None, None, True, Decimal("1.00")),
        (Decimal("0.40"), Decimal("0.60"), False, Decimal("0.60")),
        (Decimal("0.40"), Decimal("2.00"), True, Decimal("2.00")),
        (None, Decimal("0.60"), True, Decimal("0.60")),
        (Decimal(0), None, False, Decimal("0.01")),
    ],
)
def test_the_cap_follows_the_estimate_request_and_project_cap(
    usd: Decimal | None, request_cap: Decimal | None, needs: bool, cap: Decimal
) -> None:
    decision = cap_decision(usd, request_cap, Decimal("1.00"))

    assert (decision.needs_approval, decision.cap_usd) == (needs, cap)


def test_cents_round_up() -> None:
    assert ceil_cents(Decimal("0.501")) == Decimal("0.51")
    assert ceil_cents(Decimal("0.5")) == Decimal("0.50")


def test_minutes_divide_by_the_attempt_lanes() -> None:
    assert minutes_for(240, 2000.0, None) == 2
    assert minutes_for(240, 2000.0, 1) == 8
    assert minutes_for(10, None, None) is None


def test_token_prices_come_from_genai_prices_and_unknown_models_have_none() -> None:
    assert token_price("openai:gpt-4o-mini", 2000, 300) == Decimal("0.00048")
    assert token_price("openai:no-such-model", 2000, 300) is None


def test_a_look_recommends_the_requested_cases() -> None:
    estimator = SeriesEstimator(store=HistoryStore())
    look = LookQuestion.model_validate({"kind": "look"})

    outcome = asyncio.run(estimator.estimate(plan(look, cases=3, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.recommended.reason is EstimateReason.LOOK
    assert outcome.estimate.recommended.cases == 3
    assert (outcome.estimate.usd, outcome.estimate.usd_source) == (None, "unknown")
    assert outcome.estimate.needs_approval


def test_a_rate_pair_uses_the_prior_spread_without_history() -> None:
    estimator = SeriesEstimator(store=HistoryStore())

    estimate = asyncio.run(
        estimator.estimate(plan(noninferior(0.1), available=100), None, Decimal("1.00"), None)
    ).estimate
    short = asyncio.run(estimator.estimate(plan(noninferior(0.1)), None, Decimal("1.00"), None)).estimate

    assert (estimate.spread, estimate.spread_source, estimate.icc) == (0.5, "prior", 0.3)
    assert (estimate.recommended.reason, estimate.recommended.cases) == (EstimateReason.WIDE, 52)
    assert estimate.recommended.text.startswith("at 12 cases the expected half-width is ±0.")
    assert estimate.below_recommended
    assert estimate.half_width is not None and estimate.mde is not None
    assert (short.recommended.reason, short.recommended.cases) == (EstimateReason.SHORT_OF_CASES, 52)


def test_a_zero_margin_has_no_recommendation() -> None:
    estimator = SeriesEstimator(store=HistoryStore())

    estimate = asyncio.run(estimator.estimate(plan(threshold(0.0)), None, Decimal("1.00"), None)).estimate

    assert estimate.recommended.reason is EstimateReason.NO_MARGIN
    assert estimate.recommended.cases == 12


def test_history_prices_the_attempts_and_measures_the_spread() -> None:
    rows = {
        "writer": tuple(history_row("writer", f"case_{index}", index % 2 == 0, "0.004") for index in range(8)),
        "cheap": tuple(history_row("cheap", f"case_{index}", index % 3 == 0, "0.002") for index in range(8)),
    }
    estimator = SeriesEstimator(store=HistoryStore(rows))

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.2), cases=4, repeats=1), None, Decimal("1.00"), None))

    estimate = outcome.estimate
    assert estimate.usd_source == "history"
    assert estimate.usd == (Decimal("0.005") + Decimal("0.003")) * 4
    assert outcome.per_attempt_usd == Decimal("0.005")
    assert estimate.spread_source == "history"
    assert estimate.minutes == 1
    assert not estimate.needs_approval


def test_history_of_infrastructure_errors_does_not_price_the_attempts() -> None:
    broken = tuple(
        history_row("writer", f"case_{index}", False, "0").model_copy(
            update={"outcome": OutcomeClass.INFRA_ERROR, "passed": None, "check_cost_usd": Decimal(0), "latency_ms": 30}
        )
        for index in range(8)
    )
    estimator = SeriesEstimator(store=HistoryStore({"writer": broken, "cheap": broken}))

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.2), cases=4, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.usd_source == "unknown"
    assert outcome.estimate.usd is None
    assert outcome.estimate.minutes is None
    assert outcome.estimate.needs_approval


def test_recorded_runs_price_each_variant_through_its_assigned_model() -> None:
    sample = FlowSample(nodes={"classify": NodeSample(2000, 300, Decimal("0.5"))}, duration_ms=1500.0)
    estimator = SeriesEstimator(store=HistoryStore(), sampler=FixedSampler(sample))

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.1), cases=2, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.usd_source == "prices"
    assert outcome.estimate.usd == Decimal("0.00048") * 2 * 2
    assert outcome.per_attempt_usd == Decimal("0.00048")
    assert outcome.estimate.warnings == ()
