from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from aqven.runtime.address import RunId
from aqven.series.model import (
    AttemptId,
    AttemptRecord,
    AttemptState,
    CaseSnapshot,
    ExperimentOrigin,
    LaunchPlan,
    OutcomeClass,
    Recommendation,
    RecommendationReason,
    SeriesId,
    SeriesPlanRecord,
    SeriesRecord,
    SeriesSnapshot,
    SeriesStatus,
    SubjectKind,
    SubjectRecord,
    VariantPlanRecord,
    VariantRole,
)
from aqven.spec import DatasetId, ExperimentId, FlowId, SeriesSplit, TypeId, VariantId

NOW: Final = datetime(2026, 9, 23, 12, 0, tzinfo=UTC)
EXPERIMENT: Final = ExperimentId("triage_agents")
WRITER: Final = VariantId("writer")


def launch_plan() -> LaunchPlan:
    return LaunchPlan(
        on=SeriesSplit.DEV,
        cases=2,
        repeats=1,
        variants=1,
        attempts=2,
        available=2,
        half_width=None,
        mde=None,
        margin=None,
        spread=None,
        spread_source="none",
        icc=0.3,
        recommended=Recommendation(cases=2, repeats=1, reason=RecommendationReason.LOOK, text="look"),
        below_recommended=False,
        needs_approval=True,
        project_cap_usd=Decimal("1.00"),
        cap_usd=Decimal("1.00"),
    )


def record(series_id: str, created_at: datetime, experiment: str = EXPERIMENT) -> SeriesRecord:
    variant = VariantPlanRecord(
        variant_id=WRITER,
        role=VariantRole.OTHER,
        changes=(),
        flow_id=FlowId("triage"),
        ir_hash="",
        flow_hash="sha256-flow",
        input_type=TypeId("Ticket"),
        output_type=TypeId("Label"),
        assignments=(),
    )
    snapshot = SeriesSnapshot(
        experiment_sha256=None,
        dataset_sha256="sha256-data",
        cases_sha256="sha256-cases",
        flows={WRITER: "sha256-flow"},
        judges={},
        code_sha256="sha256-code",
        engine_version="test",
    )
    plan = SeriesPlanRecord(
        subject=SubjectRecord(
            kind=SubjectKind.FLOW, flow_id=FlowId("triage"), local_flow=False, start_node=None, end_node=None
        ),
        question=None,
        variants=(variant,),
        checks=(),
        judge_ir_hash=None,
        package="series_shop",
        repeats=1,
        case_count=2,
        snapshot=snapshot,
    )
    return SeriesRecord(
        series_id=SeriesId(series_id),
        origin=ExperimentOrigin(experiment_id=ExperimentId(experiment)),
        flow_id=FlowId("triage"),
        dataset_id=DatasetId("triage_cases"),
        on=SeriesSplit.DEV,
        status=SeriesStatus.AWAITING_APPROVAL,
        plan=plan,
        launch=launch_plan(),
        cap_usd=Decimal("1.00"),
        needs_approval=True,
        created_at=created_at,
    )


def cases() -> tuple[CaseSnapshot, ...]:
    return tuple(
        CaseSnapshot(case_index=index, name=name, split=SeriesSplit.DEV, inputs={"text": name})
        for index, name in enumerate(("always_1", "never_1"))
    )


def attempt(series_id: str, ordinal: int, state: AttemptState, cost: str = "0") -> AttemptRecord:
    return AttemptRecord(
        attempt_id=AttemptId(f"{series_id}-{ordinal}"),
        series_id=SeriesId(series_id),
        ordinal=ordinal,
        variant_id=WRITER,
        case_name=cases()[ordinal].name,
        split=SeriesSplit.DEV,
        repeat=1,
        run_id=RunId(f"run-{series_id}-{ordinal}"),
        state=state,
        outcome=OutcomeClass.OK if state is AttemptState.FINISHED else None,
        cost_usd=Decimal(cost),
        check_cost_usd=Decimal("0.001") if state is AttemptState.FINISHED else Decimal(0),
        started_at=NOW,
        finished_at=NOW if state is AttemptState.FINISHED else None,
    )
