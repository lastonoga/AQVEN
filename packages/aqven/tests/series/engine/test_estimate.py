import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue
from series_fixture import CRITIC_MODEL, WRITER_MODEL, write_project
from series_prices import FIXTURE_PRICES, FixedPrices

from aqven.compiler import compile_root
from aqven.ir import BuiltinPolicy, CompiledFlow, CompiledLlmNode, CompiledMapNode, CompiledProject, RefBinding
from aqven.runtime.address import RunId
from aqven.series.bound import (
    DEFAULT_OUTPUT_TOKENS,
    BoundPlan,
    CaseScope,
    TokenBound,
    attempt_bound,
    calls_of,
    largest_case,
)
from aqven.series.estimate import EstimatePlan as Plan
from aqven.series.estimate import (
    FlowSample,
    NodeSample,
    PricedAttempt,
    SeriesEstimator,
    UsdSource,
    VariantFacts,
    VariantPricer,
    cap_decision,
    ceil_cents,
    minutes_for,
    usd_source,
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
    SubjectKind,
    SubjectRecord,
    VariantPlanRecord,
    VariantRole,
)
from aqven.series.plans import VariantDraft, build_variant
from aqven.series.views import SeriesListQuery
from aqven.spec import (
    AgentId,
    ExperimentId,
    FlowId,
    InferenceId,
    LookQuestion,
    ModelSettingsSpec,
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
STANDARD_SHOP: Final = Path(__file__).parents[2] / "fixtures" / "standard_shop"
INTAKE: Final = FlowId("intake")
LAYOUT_SHOP: Final = Path(__file__).parents[2] / "fixtures" / "layout_shop"
AUDIT: Final = FlowId("audit")
SHOP_WRITER: Final = "openai:gpt-5.4-mini"
SHOP_CRITIC: Final = "openai:gpt-5.6-terra"
RECHECK_ITERATIONS: Final = 2
SCHEMA: Final[dict[str, JsonValue]] = {"type": "object"}
OUTPUT_CAP: Final = 128


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


@pytest.mark.parametrize(
    ("sources", "expected"),
    [
        (("history", "history"), "history"),
        (("history", "prices"), "prices"),
        (("prices", "bound"), "bound"),
        (("history", "bound", "unknown"), "unknown"),
    ],
)
def test_the_weakest_source_names_the_whole_estimate(sources: tuple[UsdSource, ...], expected: UsdSource) -> None:
    priced = [PricedAttempt(usd=None if source == "unknown" else Decimal(1), source=source) for source in sources]

    assert usd_source(priced) == expected


def test_a_look_recommends_the_requested_cases() -> None:
    estimator = SeriesEstimator(store=HistoryStore(), prices=FixedPrices())
    look = LookQuestion.model_validate({"kind": "look"})

    outcome = asyncio.run(estimator.estimate(plan(look, cases=3, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.recommended.reason is EstimateReason.LOOK
    assert outcome.estimate.recommended.cases == 3
    assert (outcome.estimate.usd, outcome.estimate.usd_source) == (None, "unknown")
    assert outcome.estimate.needs_approval


def test_a_rate_pair_uses_the_prior_spread_without_history() -> None:
    estimator = SeriesEstimator(store=HistoryStore(), prices=FixedPrices())

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
    estimator = SeriesEstimator(store=HistoryStore(), prices=FixedPrices())

    estimate = asyncio.run(estimator.estimate(plan(threshold(0.0)), None, Decimal("1.00"), None)).estimate

    assert estimate.recommended.reason is EstimateReason.NO_MARGIN
    assert estimate.recommended.cases == 12


def test_history_prices_the_attempts_and_measures_the_spread() -> None:
    rows = {
        "writer": tuple(history_row("writer", f"case_{index}", index % 2 == 0, "0.004") for index in range(8)),
        "cheap": tuple(history_row("cheap", f"case_{index}", index % 3 == 0, "0.002") for index in range(8)),
    }
    prices = FixedPrices(FIXTURE_PRICES)
    estimator = SeriesEstimator(store=HistoryStore(rows), prices=prices)

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.2), cases=4, repeats=1), None, Decimal("1.00"), None))

    estimate = outcome.estimate
    assert estimate.usd_source == "history"
    assert estimate.usd == (Decimal("0.005") + Decimal("0.003")) * 4
    assert outcome.per_attempt_usd == Decimal("0.005")
    assert estimate.spread_source == "history"
    assert estimate.minutes == 1
    assert not estimate.needs_approval
    assert prices.asked == []


def test_history_without_a_known_price_does_not_price_the_attempts() -> None:
    unpriced = {
        name: tuple(
            history_row(name, f"case_{index}", index % 2 == 0, "0.001").model_copy(update={"unpriced_calls": 1})
            for index in range(8)
        )
        for name in ("writer", "cheap")
    }
    estimator = SeriesEstimator(store=HistoryStore(unpriced), prices=FixedPrices())

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.2), cases=4, repeats=1), None, Decimal("1.00"), None))

    assert (outcome.estimate.usd_source, outcome.estimate.usd) == ("unknown", None)
    assert outcome.estimate.needs_approval


def test_history_prices_the_attempts_from_the_priced_ones_only() -> None:
    def rows(name: str) -> tuple[AttemptRecord, ...]:
        priced = tuple(history_row(name, f"case_{index}", True, "0.004") for index in range(4))
        unpriced = tuple(
            history_row(name, f"late_{index}", True, "0.001").model_copy(update={"unpriced_calls": 2})
            for index in range(4)
        )
        return (*priced, *unpriced)

    estimator = SeriesEstimator(
        store=HistoryStore({"writer": rows("writer"), "cheap": rows("cheap")}), prices=FixedPrices()
    )

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.2), cases=4, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.usd_source == "history"
    assert outcome.per_attempt_usd == Decimal("0.005")


def test_history_of_infrastructure_errors_does_not_price_the_attempts() -> None:
    broken = tuple(
        history_row("writer", f"case_{index}", False, "0").model_copy(
            update={"outcome": OutcomeClass.INFRA_ERROR, "passed": None, "check_cost_usd": Decimal(0), "latency_ms": 30}
        )
        for index in range(8)
    )
    estimator = SeriesEstimator(store=HistoryStore({"writer": broken, "cheap": broken}), prices=FixedPrices())

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.2), cases=4, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.usd_source == "unknown"
    assert outcome.estimate.usd is None
    assert outcome.estimate.minutes is None
    assert outcome.estimate.needs_approval


def test_recorded_runs_price_each_variant_through_its_assigned_model() -> None:
    sample = FlowSample(nodes={"classify": NodeSample(2000, 300, Decimal("0.5"))}, duration_ms=1500.0)
    estimator = SeriesEstimator(store=HistoryStore(), prices=FixedPrices(FIXTURE_PRICES), sampler=FixedSampler(sample))

    outcome = asyncio.run(estimator.estimate(plan(noninferior(0.1), cases=2, repeats=1), None, Decimal("1.00"), None))

    assert outcome.estimate.usd_source == "prices"
    assert outcome.estimate.usd == Decimal("0.00048") * 2 * 2
    assert outcome.per_attempt_usd == Decimal("0.00048")
    assert outcome.estimate.warnings == ()


def ticket_case(name: str, text: str) -> CaseSnapshot:
    return CaseSnapshot(case_index=0, name=name, split=SeriesSplit.DEV, inputs={"text": text})


def triage_bound(project: CompiledProject, case: CaseSnapshot) -> TokenBound:
    bounds = attempt_bound(BoundPlan(base=project, case=case), variant("writer", VariantRole.BASELINE))
    assert bounds is not None and len(bounds) == 1
    return bounds[0]


def test_the_bound_reads_the_rendered_prompt_of_the_case_and_the_output_cap(tmp_path: Path) -> None:
    project = compile_root(write_project(tmp_path))
    short = triage_bound(project, ticket_case("short", "printer jam"))
    long = triage_bound(project, ticket_case("long", "printer jam " * 15))

    assert (short.model, short.tokens_out, short.calls) == (WRITER_MODEL, DEFAULT_OUTPUT_TOKENS, 1)
    assert long.tokens_in > short.tokens_in > 0
    assert largest_case([ticket_case("short", "a"), ticket_case("long", "a" * 90)]) == ticket_case("long", "a" * 90)


def capped_writer(project: CompiledProject, max_tokens: int) -> CompiledProject:
    writer = project.agent(AgentId("writer"))
    capped = writer.model_copy(update={"settings": ModelSettingsSpec(max_tokens=max_tokens)})
    return project.model_copy(update={"agents": {**project.agents, AgentId("writer"): capped}})


def test_the_output_cap_of_the_agent_bounds_the_output_tokens(tmp_path: Path) -> None:
    project = capped_writer(compile_root(write_project(tmp_path)), OUTPUT_CAP)

    bound = triage_bound(project, ticket_case("short", "printer jam"))

    assert bound.tokens_out == OUTPUT_CAP


def test_a_first_series_is_priced_on_the_upper_bound(tmp_path: Path) -> None:
    project = compile_root(write_project(tmp_path))
    case = ticket_case("long", "printer jam " * 15)
    bounded = replace(plan(noninferior(0.1), cases=2, repeats=1), bound=BoundPlan(base=project, case=case))
    estimator = SeriesEstimator(store=HistoryStore(), prices=FixedPrices(FIXTURE_PRICES))

    outcome = asyncio.run(estimator.estimate(bounded, None, Decimal("1.00"), None))

    bound = triage_bound(project, case)
    per_attempt = FIXTURE_PRICES[WRITER_MODEL].cost(bound.tokens_in, bound.tokens_out)
    assert (outcome.estimate.usd_source, outcome.estimate.usd) == ("bound", per_attempt * 2 * 2)
    assert outcome.per_attempt_usd == per_attempt
    assert not outcome.estimate.needs_approval


def test_a_bound_charges_every_call_with_its_request_price() -> None:
    price = replace(FIXTURE_PRICES[WRITER_MODEL], per_request=Decimal("0.001"))
    pricer = VariantPricer(table={WRITER_MODEL: price}, judges=())
    bound = TokenBound(model=WRITER_MODEL, tokens_in=100, tokens_out=10, calls=3)

    priced = pricer.price(VariantFacts(variant=variant("writer", VariantRole.BASELINE), bound=(bound,)))

    assert priced == PricedAttempt(usd=price.cost(100, 10) * 3, source="bound")


def test_an_unpriced_model_leaves_the_bound_unknown(tmp_path: Path) -> None:
    project = compile_root(write_project(tmp_path))
    bounded = replace(plan(noninferior(0.1)), bound=BoundPlan(base=project, case=ticket_case("one", "printer jam")))
    prices = FixedPrices({CRITIC_MODEL: FIXTURE_PRICES[CRITIC_MODEL]})
    estimator = SeriesEstimator(store=HistoryStore(), prices=prices)

    estimate = asyncio.run(estimator.estimate(bounded, None, Decimal("1.00"), None)).estimate

    assert (estimate.usd, estimate.usd_source) == (None, "unknown")
    assert estimate.warnings == (f"price_unknown:{WRITER_MODEL}",)
    assert prices.asked == [(WRITER_MODEL,)]
    assert estimate.needs_approval


def flow_record(project: CompiledProject, flow_id: FlowId) -> tuple[VariantPlanRecord, CompiledProject]:
    subject = SubjectRecord(kind=SubjectKind.FLOW, flow_id=flow_id, arm_id=None, start_node=None, end_node=None)
    draft = VariantDraft(
        variant_id=VariantId("current"), role=VariantRole.OTHER, arm_id=None, flow_id=flow_id, agents={}
    )
    build = build_variant(project, subject, draft, None)
    return build.record, build.plan


def note_case(text: str) -> CaseSnapshot:
    return CaseSnapshot(case_index=0, name="note", split=SeriesSplit.DEV, inputs={"text": text})


def flow_bounds_of(root: Path, flow_id: FlowId, case: CaseSnapshot) -> tuple[TokenBound, ...]:
    record, project = flow_record(compile_root(root), flow_id)
    bounds = attempt_bound(BoundPlan(base=project, case=case), record)
    assert bounds is not None
    return bounds


def shop_bounds(case: CaseSnapshot) -> dict[str, TokenBound]:
    return {bound.model: bound for bound in flow_bounds_of(STANDARD_SHOP, INTAKE, case)}


def test_a_loop_multiplies_its_body_calls_by_the_iteration_cap() -> None:
    bounds = shop_bounds(note_case("a note"))

    assert {model: bound.calls for model, bound in bounds.items()} == {SHOP_WRITER: 1, SHOP_CRITIC: RECHECK_ITERATIONS}
    assert bounds[SHOP_CRITIC].tokens_out == DEFAULT_OUTPUT_TOKENS


def test_an_input_the_case_cannot_resolve_adds_the_whole_case_to_the_prompt() -> None:
    text = "a note " * 40
    outputs: dict[NodeId, JsonValue] = {NodeId("clean"): {"text": text}}
    unresolved = note_case(text)
    resolved = unresolved.model_copy(update={"node_outputs": outputs})

    assert shop_bounds(unresolved)[SHOP_WRITER].tokens_in > shop_bounds(resolved)[SHOP_WRITER].tokens_in


def test_a_called_flow_adds_the_model_calls_of_its_nodes() -> None:
    record, _ = flow_record(compile_root(LAYOUT_SHOP), AUDIT)

    bounds = flow_bounds_of(LAYOUT_SHOP, AUDIT, note_case("a note"))

    assert [item.model for item in record.assignments] == [SHOP_CRITIC]
    assert sorted(bound.model for bound in bounds) == [SHOP_WRITER, SHOP_CRITIC, SHOP_CRITIC]


def fan_flow() -> CompiledFlow:
    fan = CompiledMapNode(
        node_id=NodeId("fan"),
        description="labels each ticket",
        over="$input.tickets",
        body=NodeId("fan__label"),
        on_item_error=BuiltinPolicy(use="skip"),
        outputs=(RefBinding(name="labels", ref="$item"),),
        output_schema=SCHEMA,
    )
    label = CompiledLlmNode(
        node_id=NodeId("fan__label"),
        parent=NodeId("fan"),
        description="labels one ticket",
        agent=AgentId("writer"),
        inference=InferenceId("classify"),
        output_mode="tool",
        inputs=(RefBinding(name="text", ref="$item"),),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
    )
    return CompiledFlow(
        flow_id=FlowId("fan"),
        description="labels a batch",
        input_type="Batch",
        output_type="Labels",
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        returns=(RefBinding(name="labels", ref="$fan.out.labels"),),
        order=(NodeId("fan"),),
        nodes={NodeId("fan"): fan, NodeId("fan__label"): label},
    )


@pytest.mark.parametrize(("tickets", "calls"), [(["a", "b", "c"], 3), ([], 1), ("not a list", 1)])
def test_a_map_multiplies_its_body_calls_by_the_items_of_the_case(tickets: JsonValue, calls: int) -> None:
    flow = fan_flow()

    assert calls_of(flow, flow.node(NodeId("fan__label")), CaseScope(flow_input={"tickets": tickets})) == calls
