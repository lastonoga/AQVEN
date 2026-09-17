from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import assert_never

from pydantic import JsonValue

from aqven.engine.human.answers import AcceptedAnswer, judge_answer
from aqven.engine.human.forms import FormAccepted, FormModel, FormRejected
from aqven.engine.human.journal import WaitJournal
from aqven.engine.human.keys import FIRST_ATTEMPT, wait_topic
from aqven.engine.human.outcomes import (
    FAIL_ON_EXPIRY,
    DefaultOnExpiry,
    EscalateOnExpiry,
    ExpiryPlan,
    FailOnExpiry,
    HumanAnswered,
    HumanDefaulted,
    HumanDefaultRejected,
    HumanExpired,
    WaitOutcome,
)
from aqven.engine.human.records import (
    AnswerEnvelope,
    WaitOpening,
    WaitRecord,
    WaitSubject,
    escalated_record,
    ignored_record,
    opened_record,
    resolved_record,
    timed_out_record,
)
from aqven.engine.human.scripted import ScriptedAnswerBook
from aqven.engine.human.wait_events import (
    escalated_event,
    ignored_event,
    resumed_event,
    suspended_event,
    timed_out_event,
)
from aqven.ports.execution import RunEventSink
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId
from aqven.runtime.human import IgnoredAnswer
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import WaitKind
from aqven.spec import TypeId


@dataclass(frozen=True, slots=True)
class WaitRequest:
    run_id: RunId
    address: ExecutionAddress
    wait_kind: WaitKind
    form: FormModel
    form_type_id: TypeId
    form_schema: JsonObject
    suspend_data: JsonValue
    assignee: str
    timeout_seconds: float
    expiry: ExpiryPlan


type Received = HumanAnswered | WaitRecord


@dataclass(frozen=True, slots=True)
class HumanWaiter:
    journal: WaitJournal
    events: RunEventSink
    book: ScriptedAnswerBook

    async def wait(self, request: WaitRequest) -> WaitOutcome:
        subject = WaitSubject(
            run_id=request.run_id,
            workflow_id=self.journal.workflow_id(),
            address=request.address,
            wait_kind=request.wait_kind,
            form_type_id=request.form_type_id,
            form_schema=request.form_schema,
            suspend_data=request.suspend_data,
        )
        opening = await self._opening(
            request.address, FIRST_ATTEMPT, request.assignee, request.timeout_seconds, request.expiry
        )
        record = opened_record(subject, opening)
        await self._suspend(record)
        return await self._await(request.form, record, request.expiry)

    async def _await(self, form: FormModel, record: WaitRecord, plan: ExpiryPlan) -> WaitOutcome:
        received = await self._receive(form, record)
        if isinstance(received, HumanAnswered):
            return received
        return await self._expire(form, received, plan)

    async def _expire(self, form: FormModel, record: WaitRecord, plan: ExpiryPlan) -> WaitOutcome:
        match plan:
            case FailOnExpiry():
                await self.events.emit(timed_out_event(record, plan.action, None))
                return HumanExpired(record.attempt)
            case DefaultOnExpiry():
                return await self._apply_default(form, record, plan)
            case EscalateOnExpiry():
                return await self._escalate(form, record, plan)
            case _:
                assert_never(plan)

    async def _apply_default(self, form: FormModel, record: WaitRecord, plan: DefaultOnExpiry) -> WaitOutcome:
        verdict = form.check(plan.value)
        default_ref = InlineValue(value=verdict.value) if isinstance(verdict, FormAccepted) else None
        await self.events.emit(timed_out_event(record, plan.action, default_ref))
        if isinstance(verdict, FormRejected):
            return HumanDefaultRejected(record.attempt, verdict.problems)
        return HumanDefaulted(verdict.value, record.attempt)

    async def _escalate(self, form: FormModel, record: WaitRecord, plan: EscalateOnExpiry) -> WaitOutcome:
        await self.events.emit(timed_out_event(record, plan.action, None))
        attempt = record.attempt + 1
        opening = await self._opening(record.address, attempt, plan.assignee, plan.timeout_seconds, FAIL_ON_EXPIRY)
        escalated = escalated_record(record, opening)
        await self.events.emit(escalated_event(record.attempt, escalated))
        await self._suspend(escalated)
        return await self._await(form, escalated, FAIL_ON_EXPIRY)

    async def _opening(
        self,
        address: ExecutionAddress,
        attempt: int,
        assignee: str,
        timeout_seconds: float,
        plan: ExpiryPlan,
    ) -> WaitOpening:
        since = await self.journal.now()
        return WaitOpening(
            attempt=attempt,
            assignee=assignee,
            waiting_since=since,
            deadline_at=since + timedelta(seconds=timeout_seconds),
            on_timeout=plan.action,
            topic=wait_topic(address, attempt),
        )

    async def _suspend(self, record: WaitRecord) -> None:
        await self.journal.publish(record)
        await self._deliver_scripted(record)
        await self.events.emit(suspended_event(record))

    async def _deliver_scripted(self, record: WaitRecord) -> None:
        delivery = self.book.lookup(record.address, record.attempt)
        if delivery is None:
            return
        envelope = AnswerEnvelope(
            payload=delivery.payload,
            idempotency_key=delivery.client_op_id,
            sent_at=record.waiting_since,
        )
        await self.journal.deliver(record.topic, envelope)

    async def _receive(self, form: FormModel, record: WaitRecord) -> Received:
        current = record
        while True:
            now = await self.journal.now()
            remaining = (current.deadline_at - now).total_seconds()
            if remaining <= 0:
                return await self._time_out(current, now)
            message = await self.journal.receive(current.topic, remaining)
            if message is None:
                continue
            received_at = await self.journal.now()
            judged = judge_answer(form, current, message, received_at)
            if isinstance(judged, IgnoredAnswer):
                current = await self._ignore(current, judged)
                continue
            return await self._resolve(current, judged, received_at)

    async def _time_out(self, record: WaitRecord, now: datetime) -> WaitRecord:
        timed_out = timed_out_record(record, now)
        await self.journal.publish(timed_out)
        return timed_out

    async def _ignore(self, record: WaitRecord, ignored: IgnoredAnswer) -> WaitRecord:
        updated = ignored_record(record, ignored)
        await self.journal.publish(updated)
        await self.events.emit(ignored_event(updated, ignored))
        return updated

    async def _resolve(self, record: WaitRecord, accepted: AcceptedAnswer, resolved_at: datetime) -> HumanAnswered:
        resolved = resolved_record(record, accepted.envelope, accepted.value, resolved_at)
        await self.journal.publish(resolved)
        resolved_by = accepted.envelope.idempotency_key
        await self.events.emit(resumed_event(resolved, resolved_by))
        return HumanAnswered(accepted.value, resolved.attempt, resolved_by)
