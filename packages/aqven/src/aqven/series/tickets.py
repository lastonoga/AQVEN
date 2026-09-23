from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Final

from pydantic import AwareDatetime, Field

from aqven.engine.request import RunSpec, SeriesTag
from aqven.runtime.address import JsonObject, RunId
from aqven.series.ids import attempt_id, judge_run_id, key_of, subject_run_id
from aqven.series.model import (
    AttemptId,
    AttemptRecord,
    AttemptState,
    CaseSnapshot,
    OutcomeClass,
    RecordModel,
    SeriesId,
    SeriesRecord,
    VariantPlanRecord,
)
from aqven.series.subjects import SubjectStrategy
from aqven.spec import FlowId, SeriesSplit, VariantId

EXPERIMENT_MODE: Final = "experiment"
SUBJECT_ROLE: Final = "subject"
JUDGE_ROLE: Final = "judge"


class CaseMismatch(ValueError):
    def __init__(self, ordinal: int, expected: int, found: int) -> None:
        super().__init__(f"attempt {ordinal} belongs to case {expected}, but case {found} was given")
        self.ordinal = ordinal


class AttemptTicket(RecordModel):
    series_id: SeriesId
    attempt_id: AttemptId
    ordinal: int = Field(ge=0)
    variant_id: VariantId
    case_index: int = Field(ge=0)
    case_name: str
    split: SeriesSplit
    repeat: int = Field(ge=1)
    run_id: RunId
    ir_hash: str
    flow_id: FlowId
    flow_input: JsonObject
    spec: RunSpec
    judge_ir_hash: str | None = None
    judges: dict[str, FlowId] = Field(default_factory=dict[str, FlowId])
    started_at: AwareDatetime

    def judge_run(self, check_id: str) -> RunId:
        return judge_run_id(self.attempt_id, check_id)

    def judge_spec(self, check_id: str) -> RunSpec:
        tag = SeriesTag(
            series_id=self.series_id,
            attempt_id=self.attempt_id,
            role=JUDGE_ROLE,
            variant_id=self.variant_id,
            case_name=self.case_name,
            repeat=self.repeat,
            check_id=check_id,
        )
        return RunSpec(
            flow_id=self.judges[check_id],
            mode=EXPERIMENT_MODE,
            limits=self.spec.limits,
            output_deltas=False,
            series=tag,
        )


class AttemptSummary(RecordModel):
    attempt_id: AttemptId
    ordinal: int = Field(ge=0)
    variant_id: VariantId
    case_name: str
    repeat: int = Field(ge=1)
    run_id: RunId
    outcome: OutcomeClass
    passed: bool | None
    cost_usd: Decimal
    spend_usd: Decimal
    finished_at: AwareDatetime


def judge_flows(record: SeriesRecord) -> Mapping[str, FlowId]:
    return {check.check_id: check.judge.flow_id for check in record.plan.checks if check.judge is not None}


def variant_at(record: SeriesRecord, ordinal: int) -> tuple[VariantPlanRecord, int, int]:
    plan = record.plan
    key = key_of(ordinal, plan.repeats, len(plan.variants))
    return plan.variants[key.variant_index], key.case_index, key.repeat


def attempt_ticket(
    record: SeriesRecord,
    case: CaseSnapshot,
    ordinal: int,
    limit_usd_micros: int,
    strategy: SubjectStrategy,
    now: datetime,
) -> AttemptTicket:
    variant, case_index, repeat = variant_at(record, ordinal)
    if case.case_index != case_index:
        raise CaseMismatch(ordinal, case_index, case.case_index)
    attempt = attempt_id(record.series_id, variant.variant_id, case.name, repeat)
    tag = SeriesTag(
        series_id=record.series_id,
        attempt_id=attempt,
        role=SUBJECT_ROLE,
        variant_id=variant.variant_id,
        case_name=case.name,
        repeat=repeat,
    )
    prepared = strategy.prepare(variant, case, record.dataset_id, tag, limit_usd_micros)
    return AttemptTicket(
        series_id=record.series_id,
        attempt_id=attempt,
        ordinal=ordinal,
        variant_id=variant.variant_id,
        case_index=case.case_index,
        case_name=case.name,
        split=case.split,
        repeat=repeat,
        run_id=subject_run_id(attempt),
        ir_hash=variant.ir_hash,
        flow_id=variant.flow_id,
        flow_input=prepared.flow_input,
        spec=prepared.spec,
        judge_ir_hash=record.plan.judge_ir_hash,
        judges=dict(judge_flows(record)),
        started_at=now,
    )


def running_row(ticket: AttemptTicket) -> AttemptRecord:
    return AttemptRecord(
        attempt_id=ticket.attempt_id,
        series_id=ticket.series_id,
        ordinal=ticket.ordinal,
        variant_id=ticket.variant_id,
        case_name=ticket.case_name,
        split=ticket.split,
        repeat=ticket.repeat,
        run_id=ticket.run_id,
        state=AttemptState.RUNNING,
        started_at=ticket.started_at,
    )


def summary_of(row: AttemptRecord, finished_at: datetime) -> AttemptSummary:
    return AttemptSummary(
        attempt_id=row.attempt_id,
        ordinal=row.ordinal,
        variant_id=row.variant_id,
        case_name=row.case_name,
        repeat=row.repeat,
        run_id=row.run_id,
        outcome=row.outcome or OutcomeClass.INFRA_ERROR,
        passed=row.passed,
        cost_usd=row.cost_usd,
        spend_usd=row.cost_usd + row.check_cost_usd,
        finished_at=finished_at,
    )
