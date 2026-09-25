import asyncio
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from dbos import DBOS, Queue, SetWorkflowID, WorkflowHandleAsync
from dbos import error as dbos_errors
from pydantic import AwareDatetime, JsonValue, ValidationError

from aqven.check import check_project
from aqven.engine.launching import settled_record, start_run_workflow
from aqven.engine.lifecycle import HostWorkflow
from aqven.engine.reader import RunEventLog
from aqven.engine.request import RunRecord
from aqven.engine.runtime import active_runtime
from aqven.ir import IrHash
from aqven.runtime.address import JsonObject, RunId
from aqven.series.facts import (
    NO_SPEND,
    AttemptInspection,
    RunSpend,
    RunTrace,
    event_spend,
    inspection_of,
    run_facts,
    total_spend,
)
from aqven.series.feed import SeriesKey, SeriesProgressNotice, series_key
from aqven.series.ids import FIRST_TRY, attempt_id, judge_run_id, key_of, try_run_id, try_workflow_id
from aqven.series.model import (
    AnalysisInput,
    ApprovalReason,
    AttemptRecord,
    AttemptState,
    CheckValue,
    LookOrigin,
    OutcomeClass,
    PauseSpan,
    RecordModel,
    SeriesChange,
    SeriesId,
    SeriesPause,
    SeriesRecord,
    SeriesSnapshot,
    SeriesStatus,
    StopCause,
    VerdictState,
)
from aqven.series.planner import PlanningState, SeriesPlanner, rebuild_request
from aqven.series.ports import SeriesStore
from aqven.series.presenter import attempt_error
from aqven.series.protocol import (
    APPROVAL_RECV_SECONDS,
    APPROVAL_THRESHOLD,
    APPROVAL_TOPIC,
    ATTEMPT_SLOTS,
    LOOKAHEAD,
    PROBE_WIDTH,
    QUEUE_POLL_SECONDS,
    RATE_LIMIT_TRIES,
    SERIES_ATTEMPT_WORKFLOW,
    SERIES_EVENTS_STREAM,
    SERIES_QUEUE,
    SERIES_WORKFLOW,
)
from aqven.series.scoring import (
    AttemptScorer,
    AttemptScoring,
    JudgeReplyRecord,
    attempt_passed,
    check_cost,
    judge_inputs,
)
from aqven.series.services import SeriesServices
from aqven.series.slot import active_series
from aqven.series.stats.wording import infra_failure_text
from aqven.series.store import SeriesMissing
from aqven.series.subjects import SubjectBinding, SubjectStrategy, subject_strategy
from aqven.series.tickets import (
    AttemptSummary,
    AttemptTicket,
    attempt_ticket,
    requeued_summary,
    running_row,
    summary_of,
    variant_at,
)
from aqven.series.views import AttemptFinishedEvent, SeriesEventBase, SeriesFinishedEvent, SeriesStatusEvent
from aqven.server.errors import ApiFailure
from aqven.server.workspace import take_snapshot
from aqven.spec import ExperimentId, FlowId, LookQuestion, SeriesSplit, VariantId

PREPARE_STEP: Final = "aqven.series.prepare"
ANNOUNCE_STEP: Final = "aqven.series.announce"
APPROVED_STEP: Final = "aqven.series.mark_approved"
PAUSE_STEP: Final = "aqven.series.pause"
FINALIZE_STEP: Final = "aqven.series.finalize"
OPEN_STEP: Final = "aqven.series.open_attempt"
INSPECT_STEP: Final = "aqven.series.inspect_attempt"
CLOSE_STEP: Final = "aqven.series.close_attempt"
FAIL_STEP: Final = "aqven.series.fail_attempt"
REQUEUE_STEP: Final = "aqven.series.requeue_attempt"
JUDGE_OUTPUT: Final = "output"
MICROS: Final = Decimal(1_000_000)
ZERO: Final = Decimal(0)
PUBLISHED_STATES: Final = frozenset(
    {VerdictState.CONFIRMED, VerdictState.REFUTED, VerdictState.INCONCLUSIVE, VerdictState.SIGNAL}
)
FAILURE_OUTCOMES: Final[Mapping[type[BaseException], OutcomeClass]] = {
    dbos_errors.DBOSAwaitedWorkflowCancelledError: OutcomeClass.CANCELLED,
}

SERIES_ATTEMPTS: Final = Queue(SERIES_QUEUE, concurrency=ATTEMPT_SLOTS, polling_interval_sec=QUEUE_POLL_SECONDS)


class SeriesRun(RecordModel):
    needs_approval: bool
    total: int
    cap_usd: Decimal
    repeats: int
    variant_ids: tuple[VariantId, ...]
    case_names: tuple[str, ...]
    created_at: AwareDatetime
    experiment_id: ExperimentId | None = None
    flow_id: FlowId | None = None


class DrivenAttempts(RecordModel):
    stop: StopCause
    spent: Decimal
    done: int


class SeriesFinish(RecordModel):
    status: SeriesStatus
    verdict: VerdictState | None
    finished_at: AwareDatetime


class StatusMark(RecordModel):
    status: SeriesStatus
    at: AwareDatetime


class ApprovalMessage(RecordModel):
    approved_by: str
    cap_usd: Decimal | None = None

    def cap_or(self, current: Decimal) -> Decimal:
        return current if self.cap_usd is None else self.cap_usd


def utc_now() -> datetime:
    return datetime.now(UTC)


async def require_series(store: SeriesStore, series_id: SeriesId) -> SeriesRecord:
    record = await store.series(series_id)
    if record is None:
        raise SeriesMissing(series_id)
    return record


def strategy_for(record: SeriesRecord) -> SubjectStrategy:
    loader = active_runtime().services.loader
    return subject_strategy(SubjectBinding(subject=record.plan.subject, types=loader, package=record.plan.package))


def series_run(record: SeriesRecord, case_names: Sequence[str]) -> SeriesRun:
    plan = record.plan
    key = series_key(record)
    return SeriesRun(
        needs_approval=record.needs_approval,
        total=len(case_names) * plan.repeats * len(plan.variants),
        cap_usd=record.cap_usd,
        repeats=plan.repeats,
        variant_ids=tuple(variant.variant_id for variant in plan.variants),
        case_names=tuple(case_names),
        created_at=record.created_at,
        experiment_id=key.experiment_id,
        flow_id=key.flow_id,
    )


def progress_notice(series_id: SeriesId, run: SeriesRun, done: int, spent: Decimal) -> SeriesProgressNotice:
    key = SeriesKey(series_id=series_id, experiment_id=run.experiment_id, flow_id=run.flow_id)
    return SeriesProgressNotice(series=key, done=done, total=run.total, spend_usd=spent)


@dataclass(frozen=True, slots=True)
class AttemptTry:
    ordinal: int
    tries: int = FIRST_TRY

    def again(self) -> AttemptTry:
        return AttemptTry(ordinal=self.ordinal, tries=self.tries + 1)


def attempt_workflow_id(series_id: SeriesId, run: SeriesRun, entry: AttemptTry) -> str:
    key = key_of(entry.ordinal, run.repeats, len(run.variant_ids))
    attempt = attempt_id(series_id, run.variant_ids[key.variant_index], run.case_names[key.case_index], key.repeat)
    return try_workflow_id(attempt, entry.tries)


@dataclass(slots=True)
class SpendLedger:
    cap: Decimal
    reserve: Decimal = ZERO
    spent: Decimal = ZERO

    def committed(self, pending: int) -> Decimal:
        return self.spent + self.reserve * pending

    def headroom(self, pending: int) -> Decimal:
        return self.cap - self.committed(pending)

    def open_for(self, pending: int) -> bool:
        return self.committed(pending) < self.cap * APPROVAL_THRESHOLD

    def limit_micros(self, pending: int) -> int:
        return max(1, math.ceil(self.headroom(pending) * MICROS))

    def add(self, usd: Decimal) -> None:
        self.spent += usd
        self.reserve = max(self.reserve, usd)


@dataclass(frozen=True, slots=True)
class StatusEventBuilder:
    series_id: SeriesId
    mark: StatusMark

    def __call__(self, seq: int) -> SeriesEventBase:
        return SeriesStatusEvent(seq=seq, at=self.mark.at, series_id=self.series_id, status=self.mark.status)


@dataclass(frozen=True, slots=True)
class AttemptEventBuilder:
    series_id: SeriesId
    summary: AttemptSummary
    done: int
    total: int
    spent: Decimal

    def __call__(self, seq: int) -> SeriesEventBase:
        summary = self.summary
        return AttemptFinishedEvent(
            seq=seq,
            at=summary.finished_at,
            series_id=self.series_id,
            attempt_id=summary.attempt_id,
            ordinal=summary.ordinal,
            variant_id=summary.variant_id,
            case_name=summary.case_name,
            repeat=summary.repeat,
            run_id=summary.run_id,
            outcome=summary.outcome,
            passed=summary.passed,
            cost_usd=summary.cost_usd,
            done=self.done,
            total=self.total,
            spend_usd=self.spent,
        )


@dataclass(frozen=True, slots=True)
class FinishedEventBuilder:
    series_id: SeriesId
    finish: SeriesFinish

    def __call__(self, seq: int) -> SeriesEventBase:
        return SeriesFinishedEvent(
            seq=seq,
            at=self.finish.finished_at,
            series_id=self.series_id,
            status=self.finish.status,
            verdict=self.finish.verdict,
        )


type EventBuilder = StatusEventBuilder | AttemptEventBuilder | FinishedEventBuilder


@dataclass(slots=True)
class SeriesStream:
    written: int = 0

    async def write(self, build: EventBuilder) -> None:
        self.written += 1
        await DBOS.write_stream_async(SERIES_EVENTS_STREAM, build(self.written).model_dump(mode="json"))


@dataclass(frozen=True, slots=True)
class PendingAttempt:
    entry: AttemptTry
    handle: WorkflowHandleAsync[JsonObject]


def failure_text(error: BaseException) -> str:
    return f"{type(error).__name__}: {error}"


async def attempt_summary(series_id: SeriesId, pending: PendingAttempt) -> AttemptSummary:
    entry = pending.entry
    try:
        raw = await pending.handle.get_result(polling_interval_sec=QUEUE_POLL_SECONDS)
    except Exception as error:
        outcome = FAILURE_OUTCOMES.get(type(error), OutcomeClass.INFRA_ERROR)
        failed = await fail_attempt(series_id, entry.ordinal, outcome.value, failure_text(error), entry.tries)
        return AttemptSummary.model_validate(failed)
    return AttemptSummary.model_validate(raw)


async def enqueue_attempt(
    series_id: SeriesId, run: SeriesRun, entry: AttemptTry, limit_usd_micros: int
) -> WorkflowHandleAsync[JsonObject]:
    with SetWorkflowID(attempt_workflow_id(series_id, run, entry)):
        return await SERIES_ATTEMPTS.enqueue_async(run_attempt, series_id, entry.ordinal, limit_usd_micros, entry.tries)


@dataclass(slots=True)
class AttemptQueue:
    total: int
    cursor: int = 0
    requeued: list[AttemptTry] = field(default_factory=list[AttemptTry])
    done: int = 0

    @property
    def waiting(self) -> bool:
        return self.cursor < self.total or bool(self.requeued)

    def width(self) -> int:
        return LOOKAHEAD if self.done else PROBE_WIDTH

    def take(self) -> AttemptTry:
        if self.cursor < self.total:
            self.cursor += 1
            return AttemptTry(ordinal=self.cursor - 1)
        return self.requeued.pop(0)

    def settle(self, entry: AttemptTry, summary: AttemptSummary) -> bool:
        if summary.requeued:
            self.requeued.append(entry.again())
            return False
        self.done += 1
        return True


@dataclass(slots=True)
class AttemptWindow:
    series_id: SeriesId
    run: SeriesRun
    ledger: SpendLedger
    queue: AttemptQueue
    pending: dict[str, PendingAttempt] = field(default_factory=dict[str, PendingAttempt])

    @property
    def done(self) -> int:
        return self.queue.done

    @property
    def active(self) -> bool:
        return self.queue.waiting or bool(self.pending)

    @property
    def paused(self) -> bool:
        return not self.pending and self.queue.waiting

    def room(self) -> bool:
        return self.queue.waiting and len(self.pending) < self.queue.width()

    async def fill(self) -> None:
        while self.room() and self.ledger.open_for(len(self.pending)):
            limit = self.ledger.limit_micros(len(self.pending))
            entry = self.queue.take()
            handle = await enqueue_attempt(self.series_id, self.run, entry, limit)
            self.pending[handle.get_workflow_id()] = PendingAttempt(entry=entry, handle=handle)

    async def next_finished(self) -> AttemptSummary | None:
        handles = [pending.handle for pending in self.pending.values()]
        finished = await DBOS.wait_first_async(handles, polling_interval_sec=QUEUE_POLL_SECONDS)
        pending = self.pending.pop(finished.get_workflow_id())
        summary = await attempt_summary(self.series_id, pending)
        self.ledger.add(summary.spend_usd)
        return summary if self.queue.settle(pending.entry, summary) else None

    def driven(self) -> DrivenAttempts:
        return DrivenAttempts(stop=StopCause.COMPLETED, spent=self.ledger.spent, done=self.done)


async def drive_attempts(series_id: SeriesId, run: SeriesRun, stream: SeriesStream, cap: Decimal) -> DrivenAttempts:
    window = AttemptWindow(series_id, run, SpendLedger(cap=cap), AttemptQueue(total=run.total))
    while window.active:
        await window.fill()
        if window.paused:
            window.ledger.cap = await spend_gate(series_id, window.ledger, stream)
            continue
        summary = await window.next_finished()
        if summary is None:
            continue
        await stream.write(AttemptEventBuilder(series_id, summary, window.done, run.total, window.ledger.spent))
        active_series().feed.publish(progress_notice(series_id, run, window.done, window.ledger.spent))
    return window.driven()


def approval_of(message: object) -> ApprovalMessage | None:
    if message is None:
        return None
    try:
        return ApprovalMessage.model_validate(message)
    except ValidationError:
        return None


async def wait_for_approval() -> ApprovalMessage:
    while True:
        approval = approval_of(await DBOS.recv_async(APPROVAL_TOPIC, timeout_seconds=APPROVAL_RECV_SECONDS))
        if approval is not None:
            return approval


async def approval_after(series_id: SeriesId, waiting: StatusMark, stream: SeriesStream) -> ApprovalMessage:
    await stream.write(StatusEventBuilder(series_id, waiting))
    approval = await wait_for_approval()
    approved = StatusMark.model_validate(await mark_approved(series_id, approval.model_dump(mode="json")))
    await stream.write(StatusEventBuilder(series_id, approved))
    return approval


async def approval_gate(series_id: SeriesId, run: SeriesRun, stream: SeriesStream) -> Decimal:
    if not run.needs_approval:
        return run.cap_usd
    waiting = StatusMark.model_validate(await announce(series_id, SeriesStatus.AWAITING_APPROVAL.value))
    return (await approval_after(series_id, waiting, stream)).cap_or(run.cap_usd)


async def spend_gate(series_id: SeriesId, ledger: SpendLedger, stream: SeriesStream) -> Decimal:
    waiting = StatusMark.model_validate(await pause_series(series_id, str(ledger.spent)))
    return (await approval_after(series_id, waiting, stream)).cap_or(ledger.cap)


@DBOS.step(name=PREPARE_STEP)
async def prepare_series(series_id: str) -> JsonObject:
    store = active_series().store
    record = await require_series(store, SeriesId(series_id))
    cases = await store.cases(record.series_id)
    return series_run(record, [case.name for case in cases]).model_dump(mode="json")


@DBOS.step(name=ANNOUNCE_STEP)
async def announce(series_id: str, status: str) -> JsonObject:
    store = active_series().store
    wanted = SeriesStatus(status)
    record = await require_series(store, SeriesId(series_id))
    if record.status is SeriesStatus.AWAITING_APPROVAL and wanted is not record.status:
        await store.update(record.series_id, SeriesChange(status=wanted))
    return StatusMark(status=wanted, at=utc_now()).model_dump(mode="json")


@DBOS.step(name=PAUSE_STEP)
async def pause_series(series_id: str, spent_usd: str) -> JsonObject:
    store = active_series().store
    now = utc_now()
    record = await require_series(store, SeriesId(series_id))
    if record.status is SeriesStatus.RUNNING:
        pause = SeriesPause(reason=ApprovalReason.SPEND_NEAR_CAP, spent_usd=Decimal(spent_usd))
        pauses = (*record.pauses, PauseSpan(started_at=now))
        change = SeriesChange(status=SeriesStatus.AWAITING_APPROVAL, pause=pause, pauses=pauses)
        await store.update(record.series_id, change)
    return StatusMark(status=SeriesStatus.AWAITING_APPROVAL, at=now).model_dump(mode="json")


@DBOS.step(name=APPROVED_STEP)
async def mark_approved(series_id: str, message: JsonObject) -> JsonObject:
    store = active_series().store
    now = utc_now()
    approval = ApprovalMessage.model_validate(message)
    record = await require_series(store, SeriesId(series_id))
    if record.status is SeriesStatus.AWAITING_APPROVAL:
        change = SeriesChange(
            status=SeriesStatus.RUNNING,
            approved_by=approval.approved_by,
            approved_at=now,
            cap_usd=approval.cap_usd,
            pauses=tuple(span.ended(now) for span in record.pauses),
        )
        await store.update(record.series_id, change)
    return StatusMark(status=SeriesStatus.RUNNING, at=now).model_dump(mode="json")


def publishable(record: SeriesRecord) -> bool:
    verdict = record.verdict
    question = record.plan.question
    return (
        record.on is SeriesSplit.HOLDOUT
        and not isinstance(question, LookQuestion)
        and verdict is not None
        and verdict.state in PUBLISHED_STATES
    )


async def published(
    services: SeriesServices, record: SeriesRecord, attempts: Sequence[AttemptRecord]
) -> tuple[str | None, str | None]:
    if not publishable(record):
        return None, None
    try:
        return await services.findings.publish(record, attempts), None
    except Exception as error:
        return None, f"the finding was not written: {failure_text(error)}"


def series_planner(services: SeriesServices) -> SeriesPlanner:
    loader = active_runtime().services.loader
    return SeriesPlanner(
        types=loader, engine_version=services.engine_version, holdout_share=services.splits.holdout_share
    )


async def rebuilt_snapshot(services: SeriesServices, record: SeriesRecord) -> SeriesSnapshot | None:
    report = await asyncio.to_thread(check_project, services.root)
    tree = await asyncio.to_thread(take_snapshot, services.root)
    try:
        planned = await series_planner(services).plan(rebuild_request(record), PlanningState(report, tree), None)
    except ApiFailure:
        return None
    return planned.snapshot


async def inputs_changed(services: SeriesServices, record: SeriesRecord) -> bool:
    if isinstance(record.origin, LookOrigin):
        return False
    return await rebuilt_snapshot(services, record) != record.plan.snapshot


def only_infra_errors(attempts: Sequence[AttemptRecord]) -> bool:
    return bool(attempts) and all(row.outcome is OutcomeClass.INFRA_ERROR for row in attempts)


def closing_status(attempts: Sequence[AttemptRecord]) -> SeriesStatus:
    return SeriesStatus.FAILED if only_infra_errors(attempts) else SeriesStatus.DONE


def closing_error(status: SeriesStatus, attempts: Sequence[AttemptRecord]) -> str | None:
    if status is not SeriesStatus.FAILED:
        return None
    first = min(attempts, key=lambda row: row.ordinal)
    return infra_failure_text(len(attempts), attempt_error(first))


@DBOS.step(name=FINALIZE_STEP)
async def finalize_series(series_id: str, driven: JsonObject) -> JsonObject:
    services = active_series()
    store = services.store
    outcome = DrivenAttempts.model_validate(driven)
    record = await require_series(store, SeriesId(series_id))
    attempts = await store.attempts(record.series_id)
    cases = await store.cases(record.series_id)
    status = closing_status(attempts)
    source = AnalysisInput(
        series_id=record.series_id,
        question=record.plan.question,
        split=record.on,
        status=status,
        stop=outcome.stop,
        inputs_changed=await inputs_changed(services, record),
        variants=record.plan.variants,
        checks=record.plan.checks,
        repeats=record.plan.repeats,
        case_names=tuple(case.name for case in cases),
        attempts=attempts,
    )
    analysis = await asyncio.to_thread(services.analyst.analyze, source)
    now = utc_now()
    finished = record.model_copy(
        update={
            "status": status,
            "finished_at": now,
            "stop": outcome.stop,
            "verdict": analysis.verdict,
            "analysis": analysis,
        }
    )
    finding_path, publish_error = await published(services, finished, attempts)
    change = SeriesChange(
        status=status,
        finished_at=now,
        stop=outcome.stop,
        verdict=analysis.verdict,
        analysis=analysis,
        finding_path=finding_path,
        error=closing_error(status, attempts) or publish_error,
    )
    await store.update(record.series_id, change)
    verdict = None if analysis.verdict is None else analysis.verdict.state
    return SeriesFinish(status=status, verdict=verdict, finished_at=now).model_dump(mode="json")


@DBOS.workflow(name=SERIES_WORKFLOW)
async def run_series(series_id: str) -> JsonObject:
    identity = SeriesId(series_id)
    run = SeriesRun.model_validate(await prepare_series(series_id))
    stream = SeriesStream()
    cap = await approval_gate(identity, run, stream)
    driven = await drive_attempts(identity, run, stream, cap)
    finish = SeriesFinish.model_validate(await finalize_series(series_id, driven.model_dump(mode="json")))
    await stream.write(FinishedEventBuilder(identity, finish))
    await DBOS.close_stream_async(SERIES_EVENTS_STREAM)
    return finish.model_dump(mode="json")


async def attempt_trace(ticket: AttemptTicket) -> RunTrace:
    events = await RunEventLog().snapshot(ticket.run_id)
    plan = active_runtime().plans.plan(IrHash(ticket.ir_hash))
    return RunTrace(events=events, flow=plan.flow(ticket.flow_id))


@DBOS.step(name=OPEN_STEP)
async def open_attempt(series_id: str, ordinal: int, limit_usd_micros: int, tries: int = FIRST_TRY) -> JsonObject:
    store = active_series().store
    record = await require_series(store, SeriesId(series_id))
    _, case_index, _ = variant_at(record, ordinal)
    case = await store.case(record.series_id, case_index)
    ticket = attempt_ticket(record, case, ordinal, limit_usd_micros, strategy_for(record), utc_now(), tries)
    await store.open_attempt(running_row(ticket))
    return ticket.model_dump(mode="json")


@DBOS.step(name=INSPECT_STEP)
async def inspect_attempt(ticket_document: JsonObject, record_document: JsonObject) -> JsonObject:
    store = active_series().store
    ticket = AttemptTicket.model_validate(ticket_document)
    run = RunRecord.model_validate(record_document)
    record = await require_series(store, ticket.series_id)
    case = await store.case(ticket.series_id, ticket.case_index)
    trace = await attempt_trace(ticket)
    facts = run_facts(trace, run)
    documents = strategy_for(record).scope(trace.flow, case, run, trace.top_outputs())
    judged = judge_inputs(record.plan.checks, documents, case) if facts.outcome is OutcomeClass.OK else {}
    return inspection_of(facts, judged).model_dump(mode="json")


def finished_row(
    ticket: AttemptTicket,
    inspection: AttemptInspection,
    checks: tuple[CheckValue, ...],
    judged: Sequence[JudgeReplyRecord],
    now: datetime,
) -> AttemptRecord:
    return AttemptRecord(
        attempt_id=ticket.attempt_id,
        series_id=ticket.series_id,
        ordinal=ticket.ordinal,
        variant_id=ticket.variant_id,
        case_name=ticket.case_name,
        split=ticket.split,
        repeat=ticket.repeat,
        run_id=ticket.run_id,
        state=AttemptState.FINISHED,
        outcome=inspection.outcome,
        passed=attempt_passed(inspection.outcome, checks),
        error_code=inspection.error_code,
        error_message=inspection.error_message,
        first_failed_node=inspection.first_failed_node,
        checks=checks,
        runtime_checks=inspection.runtime_checks,
        schema_valid_first_try=inspection.schema_valid_first_try,
        cost_usd=inspection.cost_usd,
        check_cost_usd=check_cost(checks),
        unpriced_calls=inspection.unpriced_calls + sum(reply.unpriced_calls for reply in judged),
        tokens_in=inspection.tokens_in,
        tokens_out=inspection.tokens_out,
        latency_ms=inspection.latency_ms,
        wait_ms=inspection.wait_ms,
        models=inspection.models,
        started_at=ticket.started_at,
        finished_at=now,
    )


@DBOS.step(name=CLOSE_STEP)
async def close_attempt(
    ticket_document: JsonObject,
    record_document: JsonObject,
    inspection_document: JsonObject,
    replies: Mapping[str, JsonObject],
) -> JsonObject:
    store = active_series().store
    loader = active_runtime().services.loader
    ticket = AttemptTicket.model_validate(ticket_document)
    run = RunRecord.model_validate(record_document)
    inspection = AttemptInspection.model_validate(inspection_document)
    record = await require_series(store, ticket.series_id)
    case = await store.case(ticket.series_id, ticket.case_index)
    variant = next(item for item in record.plan.variants if item.variant_id == ticket.variant_id)
    trace = await attempt_trace(ticket)
    strategy = strategy_for(record)
    top_outputs = trace.top_outputs()
    scoring = AttemptScoring(
        checks=record.plan.checks,
        case=case,
        variant=variant,
        repeat=ticket.repeat,
        outcome=inspection.outcome,
        error_code=inspection.error_code or inspection.outcome.value,
        subject_input=case.inputs,
        subject_output=strategy.subject_output(run),
        documents=strategy.scope(trace.flow, case, run, top_outputs),
        top_outputs=top_outputs,
        cost_usd=inspection.cost_usd,
        latency_ms=inspection.latency_ms,
        package=record.plan.package,
        input_type=variant.input_type,
    )
    judged = {check_id: JudgeReplyRecord.model_validate(raw) for check_id, raw in replies.items()}
    answers = {check_id: reply.reply() for check_id, reply in judged.items()}
    checks = await AttemptScorer(types=loader, code=loader).score(scoring, answers)
    now = utc_now()
    row = finished_row(ticket, inspection, checks, tuple(judged.values()), now)
    await store.close_attempt(row)
    return summary_of(row, now).model_dump(mode="json")


async def run_spend(log: RunEventLog, run_id: RunId) -> RunSpend:
    if await DBOS.get_workflow_status_async(run_id) is None:
        return NO_SPEND
    return event_spend(await log.snapshot(run_id))


async def spent_on(run_ids: Sequence[RunId]) -> RunSpend:
    log = RunEventLog()
    return total_spend([await run_spend(log, run_id) for run_id in run_ids])


@DBOS.step(name=REQUEUE_STEP)
async def requeue_attempt(ticket_document: JsonObject, inspection_document: JsonObject) -> JsonObject:
    ticket = AttemptTicket.model_validate(ticket_document)
    inspection = AttemptInspection.model_validate(inspection_document)
    return requeued_summary(ticket, inspection.cost_usd, utc_now()).model_dump(mode="json")


@DBOS.step(name=FAIL_STEP)
async def fail_attempt(series_id: str, ordinal: int, outcome: str, message: str, tries: int = FIRST_TRY) -> JsonObject:
    store = active_series().store
    record = await require_series(store, SeriesId(series_id))
    variant, case_index, repeat = variant_at(record, ordinal)
    case = await store.case(record.series_id, case_index)
    attempt = attempt_id(record.series_id, variant.variant_id, case.name, repeat)
    run_id = try_run_id(attempt, tries)
    judges = [check.check_id for check in record.plan.checks if check.judge is not None]
    earlier = next((row for row in await store.attempts(record.series_id) if row.attempt_id == attempt), None)
    now = utc_now()
    subject = await spent_on([run_id])
    checks = await spent_on([judge_run_id(attempt, check_id) for check_id in judges])
    row = AttemptRecord(
        attempt_id=attempt,
        series_id=record.series_id,
        ordinal=ordinal,
        variant_id=variant.variant_id,
        case_name=case.name,
        split=case.split,
        repeat=repeat,
        run_id=run_id,
        state=AttemptState.FINISHED,
        outcome=OutcomeClass(outcome),
        passed=attempt_passed(OutcomeClass(outcome), ()),
        error_message=message,
        cost_usd=subject.cost_usd,
        check_cost_usd=checks.cost_usd,
        unpriced_calls=subject.unpriced_calls + checks.unpriced_calls,
        started_at=now if earlier is None else earlier.started_at,
        finished_at=now,
    )
    await store.close_attempt(row)
    return summary_of(row, now).model_dump(mode="json")


def unwrapped(output: JsonValue) -> JsonObject | None:
    found = output.get(JUDGE_OUTPUT) if isinstance(output, dict) else None
    return found if isinstance(found, dict) else None


def judge_reply(record: RunRecord, run_id: RunId) -> JudgeReplyRecord:
    usage = record.usage
    if record.status == "completed":
        return JudgeReplyRecord(
            output=unwrapped(record.output),
            cost_usd=usage.cost_usd,
            run_id=run_id,
            unpriced_calls=usage.unpriced_calls,
        )
    reason = record.error.message if record.error is not None else f"the judge run was {record.status}"
    return JudgeReplyRecord(
        output=None, cost_usd=usage.cost_usd, run_id=run_id, error=reason, unpriced_calls=usage.unpriced_calls
    )


async def run_judge(ticket: AttemptTicket, check_id: str, document: JsonObject) -> JsonObject:
    run_id = ticket.judge_run(check_id)
    handle = await start_run_workflow(run_id, IrHash(ticket.judge_ir_hash or ""), document, ticket.judge_spec(check_id))
    return judge_reply(await settled_record(handle), run_id).model_dump(mode="json")


def requeues(inspection: AttemptInspection, tries: int) -> bool:
    return inspection.rate_limited and tries < RATE_LIMIT_TRIES


@DBOS.workflow(name=SERIES_ATTEMPT_WORKFLOW)
async def run_attempt(series_id: str, ordinal: int, limit_usd_micros: int, tries: int = FIRST_TRY) -> JsonObject:
    ticket = AttemptTicket.model_validate(await open_attempt(series_id, ordinal, limit_usd_micros, tries))
    record = await settled_record(
        await start_run_workflow(ticket.run_id, IrHash(ticket.ir_hash), ticket.flow_input, ticket.spec)
    )
    ticket_document = ticket.model_dump(mode="json")
    record_document = record.model_dump(mode="json")
    inspection = AttemptInspection.model_validate(await inspect_attempt(ticket_document, record_document))
    if requeues(inspection, tries):
        return await requeue_attempt(ticket_document, inspection.model_dump(mode="json"))
    replies = {
        check_id: await run_judge(ticket, check_id, document) for check_id, document in inspection.judge_inputs.items()
    }
    return await close_attempt(ticket_document, record_document, inspection.model_dump(mode="json"), replies)


REGISTERED_SERIES_WORKFLOWS: Final[tuple[HostWorkflow, ...]] = (run_series, run_attempt)
