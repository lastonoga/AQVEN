from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest
from pydantic import TypeAdapter, ValidationError

from aqven.engine import RunSpec, SeriesTag
from aqven.runtime.address import RunId
from aqven.series import (
    SETTLED_STATUSES,
    STORED_STATUSES,
    TERMINAL_STATUSES,
    AttemptId,
    AttemptRecord,
    AttemptState,
    CaseSnapshot,
    CheckState,
    CheckValue,
    ExperimentOrigin,
    LaunchPlan,
    LookTarget,
    Recommendation,
    RecommendationReason,
    SeriesEvent,
    SeriesId,
    SeriesPlanRecord,
    SeriesRecord,
    SeriesSnapshot,
    SeriesStartRequest,
    SeriesStatus,
    SubjectKind,
    SubjectRecord,
    VariantPlanRecord,
    VariantRole,
)
from aqven.spec import (
    DatasetId,
    ExperimentId,
    FlowId,
    MetricKind,
    SeriesSplit,
    ThresholdQuestion,
    TypeId,
    VariantId,
)

SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
NOW: Final = datetime(2026, 9, 23, 12, 0, tzinfo=UTC)
EVENTS: Final[TypeAdapter[SeriesEvent]] = TypeAdapter(SeriesEvent)


def launch_plan() -> LaunchPlan:
    return LaunchPlan(
        on=SeriesSplit.HOLDOUT,
        cases=6,
        repeats=3,
        variants=2,
        attempts=36,
        available=6,
        half_width=0.18,
        mde=0.25,
        margin=0.05,
        spread=0.5,
        spread_source="prior",
        icc=0.3,
        recommended=Recommendation(cases=60, repeats=3, reason=RecommendationReason.SHORT_OF_CASES, text="more cases"),
        below_recommended=True,
        needs_approval=False,
        project_cap_usd=Decimal("1.00"),
        cap_usd=Decimal("0.53"),
    )


def record() -> SeriesRecord:
    variant = VariantPlanRecord(
        variant_id=VariantId("gpt"),
        role=VariantRole.BASELINE,
        changes=(),
        flow_id=FlowId("support_case"),
        ir_hash="a" * 64,
        flow_hash="sha256-" + "b" * 64,
        input_type=TypeId("CaseRequest"),
        output_type=TypeId("CaseOutcome"),
        assignments=(),
    )
    plan = SeriesPlanRecord(
        subject=SubjectRecord(
            kind=SubjectKind.FLOW, flow_id=FlowId("support_case"), local_flow=False, start_node=None, end_node=None
        ),
        question=ThresholdQuestion(kind="threshold", metric="success_rate", above=0.8, margin=0.02),
        variants=(variant,),
        checks=(),
        judge_ir_hash=None,
        package="lumen",
        repeats=3,
        case_count=6,
        snapshot=SeriesSnapshot(
            experiment_sha256=None,
            dataset_sha256="d",
            cases_sha256="c",
            flows={VariantId("gpt"): "f"},
            judges={},
            code_sha256="k",
            engine_version="0.0.2",
        ),
    )
    return SeriesRecord(
        series_id=SERIES,
        origin=ExperimentOrigin(experiment_id=ExperimentId("reply_look")),
        flow_id=FlowId("support_case"),
        dataset_id=DatasetId("support_case_cases"),
        on=SeriesSplit.HOLDOUT,
        status=SeriesStatus.RUNNING,
        plan=plan,
        launch=launch_plan(),
        cap_usd=Decimal("0.53"),
        needs_approval=False,
        created_at=NOW,
    )


def test_series_record_survives_a_json_round_trip() -> None:
    stored = record()

    assert SeriesRecord.model_validate_json(stored.model_dump_json()) == stored
    assert stored.model_dump(mode="json")["cap_usd"] == "0.53"


def test_attempt_record_round_trips_with_check_values() -> None:
    attempt = AttemptRecord(
        attempt_id=AttemptId("0cf98137-2d99-5695-8fe4-983a861383ab"),
        series_id=SERIES,
        ordinal=0,
        variant_id=VariantId("gpt"),
        case_name="strip_flicker_credit",
        split=SeriesSplit.DEV,
        repeat=1,
        run_id=RunId("689d28f5-41a5-5e36-9978-fb028ec88b4f"),
        state=AttemptState.FINISHED,
        checks=(CheckValue(check_id="promises", kind=MetricKind.BINARY, state=CheckState.PASSED, value=1.0),),
        started_at=NOW,
    )

    assert AttemptRecord.model_validate(attempt.model_dump(mode="json")) == attempt


def test_status_families() -> None:
    assert SeriesStatus.WAITING_HUMAN not in STORED_STATUSES
    assert TERMINAL_STATUSES <= SETTLED_STATUSES
    assert SeriesStatus.RUNNING not in SETTLED_STATUSES


def test_case_snapshot_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CaseSnapshot.model_validate({"case_index": 0, "name": "a", "split": "dev", "inputs": {}, "extra": 1})


def test_start_request_needs_exactly_one_origin() -> None:
    look = LookTarget(flow_id=FlowId("support_case"), dataset_id=DatasetId("cases"), case_names=("a",))

    assert SeriesStartRequest(experiment_id=ExperimentId("reply_look")).on is SeriesSplit.DEV
    assert SeriesStartRequest(look=look).look == look
    with pytest.raises(ValidationError):
        SeriesStartRequest()
    with pytest.raises(ValidationError):
        SeriesStartRequest(experiment_id=ExperimentId("reply_look"), look=look)


def test_look_target_needs_both_ends_of_a_range() -> None:
    with pytest.raises(ValidationError):
        LookTarget.model_validate(
            {"flow_id": "support_case", "dataset_id": "cases", "case_names": ["a"], "start_node": "route"}
        )


def test_series_events_are_discriminated_by_type() -> None:
    event = EVENTS.validate_python(
        {"type": "series_status", "seq": 1, "at": NOW.isoformat(), "series_id": SERIES, "status": "running"}
    )

    assert event.type == "series_status"


def test_run_spec_carries_the_series_tag_and_reads_old_specs() -> None:
    tag = SeriesTag(series_id=SERIES, attempt_id="x", role="subject", variant_id="gpt", case_name="a", repeat=1)
    spec = RunSpec(flow_id=FlowId("support_case"), mode="experiment", series=tag, output_deltas=False)
    old = RunSpec.model_validate({"flow_id": "support_case", "mode": "live"})

    assert RunSpec.model_validate(spec.model_dump(mode="json")) == spec
    assert (old.series, old.output_deltas) == (None, True)
