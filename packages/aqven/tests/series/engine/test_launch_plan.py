import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest

from aqven.runtime.address import RunId
from aqven.series.launch import LaunchInputs, LaunchPlanBuilder, cap_decision
from aqven.series.model import (
    Assignment,
    AttemptId,
    AttemptRecord,
    AttemptState,
    CaseSnapshot,
    OutcomeClass,
    RecommendationReason,
    SeriesChange,
    SeriesId,
    SeriesRecord,
    VariantPlanRecord,
    VariantRole,
)
from aqven.series.settings import DEFAULT_CAP, ProjectCap
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


def variant(variant_id: str, role: VariantRole) -> VariantPlanRecord:
    return VariantPlanRecord(
        variant_id=VariantId(variant_id),
        role=role,
        changes=(),
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


def inputs(question: Question, cases: int = 12, repeats: int = 3, available: int = 24) -> LaunchInputs:
    return LaunchInputs(
        experiment_id=EXPERIMENT,
        question=question,
        on=SeriesSplit.DEV,
        cases=cases,
        repeats=repeats,
        available=available,
        planned_cases=12,
        variants=(variant("writer", VariantRole.BASELINE), variant("cheap", VariantRole.CANDIDATE)),
        checks=(),
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


def history_row(variant_id: str, case_name: str, passed: bool) -> AttemptRecord:
    return AttemptRecord(
        attempt_id=AttemptId(f"{variant_id}-{case_name}-{passed}"),
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
        cost_usd=Decimal("0.004"),
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

    async def settle(self, series_id: SeriesId, change: SeriesChange) -> SeriesRecord:
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


@pytest.mark.parametrize(
    ("request_cap", "needs", "cap"),
    [
        (None, False, Decimal("1.00")),
        (Decimal("0.60"), False, Decimal("0.60")),
        (Decimal("1.00"), False, Decimal("1.00")),
        (Decimal("2.00"), True, Decimal("2.00")),
    ],
)
def test_only_a_requested_cap_above_the_project_cap_waits_for_approval(
    request_cap: Decimal | None, needs: bool, cap: Decimal
) -> None:
    decision = cap_decision(request_cap, Decimal("1.00"))

    assert (decision.needs_approval, decision.cap_usd) == (needs, cap)


def test_the_launch_plan_names_where_the_project_cap_came_from() -> None:
    builder = LaunchPlanBuilder(store=HistoryStore())
    look = LookQuestion.model_validate({"kind": "look"})
    cap = ProjectCap(usd=Decimal("2.50"), source="project")

    launch = asyncio.run(builder.build(inputs(look, cases=3, repeats=1), None, cap))

    assert (launch.project_cap_usd, launch.project_cap_source) == (Decimal("2.50"), "project")


def test_a_look_recommends_the_requested_cases() -> None:
    builder = LaunchPlanBuilder(store=HistoryStore())
    look = LookQuestion.model_validate({"kind": "look"})

    launch = asyncio.run(builder.build(inputs(look, cases=3, repeats=1), None, DEFAULT_CAP))

    assert launch.recommended.reason is RecommendationReason.LOOK
    assert launch.recommended.cases == 3
    assert (launch.attempts, launch.variants) == (6, 2)
    assert not launch.needs_approval


def test_a_rate_pair_uses_the_prior_spread_without_history() -> None:
    builder = LaunchPlanBuilder(store=HistoryStore())

    launch = asyncio.run(builder.build(inputs(noninferior(0.1), available=100), None, DEFAULT_CAP))
    short = asyncio.run(builder.build(inputs(noninferior(0.1)), None, DEFAULT_CAP))

    assert (launch.spread, launch.spread_source, launch.icc) == (0.5, "prior", 0.3)
    assert (launch.recommended.reason, launch.recommended.cases) == (RecommendationReason.WIDE, 52)
    assert launch.recommended.text.startswith("at 12 cases the expected half-width is ±0.")
    assert launch.below_recommended
    assert launch.half_width is not None and launch.mde is not None
    assert (short.recommended.reason, short.recommended.cases) == (RecommendationReason.SHORT_OF_CASES, 52)


def test_a_zero_margin_has_no_recommendation() -> None:
    builder = LaunchPlanBuilder(store=HistoryStore())

    launch = asyncio.run(builder.build(inputs(threshold(0.0)), None, DEFAULT_CAP))

    assert launch.recommended.reason is RecommendationReason.NO_MARGIN
    assert launch.recommended.cases == 12


def test_history_measures_the_spread() -> None:
    rows = {
        "writer": tuple(history_row("writer", f"case_{index}", index % 2 == 0) for index in range(8)),
        "cheap": tuple(history_row("cheap", f"case_{index}", index % 3 == 0) for index in range(8)),
    }
    builder = LaunchPlanBuilder(store=HistoryStore(rows))

    launch = asyncio.run(builder.build(inputs(noninferior(0.2), cases=4, repeats=1), None, DEFAULT_CAP))

    assert launch.spread_source == "history"
    assert launch.spread is not None and launch.spread > 0
    assert not launch.needs_approval
