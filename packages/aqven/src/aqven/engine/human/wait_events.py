from functools import partial

from aqven.engine.human.records import WaitRecord
from aqven.ports.execution import EventBuilder, EventStamp
from aqven.runtime.address import ClientOpId
from aqven.runtime.events import (
    NodeAnswerIgnored,
    NodeResumed,
    NodeSuspended,
    NodeWaitEscalated,
    NodeWaitTimedOut,
    RunEvent,
)
from aqven.runtime.human import IgnoredAnswer
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import OnTimeoutAction


def _suspended(record: WaitRecord, stamp: EventStamp) -> RunEvent:
    return NodeSuspended(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=record.address,
        wait_kind=record.wait_kind,
        attempt=record.attempt,
        form_type_id=record.form_type_id,
        assignee=record.assignee,
        waiting_since=record.waiting_since,
        deadline_at=record.deadline_at,
        on_timeout=record.on_timeout,
    )


def _resumed(record: WaitRecord, resolved_by: ClientOpId, stamp: EventStamp) -> RunEvent:
    return NodeResumed(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=record.address,
        attempt=record.attempt,
        resolved_by=resolved_by,
        answer_ref=InlineValue(value=record.answer),
    )


def _ignored(record: WaitRecord, ignored: IgnoredAnswer, stamp: EventStamp) -> RunEvent:
    return NodeAnswerIgnored(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=record.address,
        attempt=record.attempt,
        client_op_id=ignored.client_op_id,
        sent_at=ignored.sent_at,
        problems=ignored.problems,
    )


def _timed_out(
    record: WaitRecord,
    action: OnTimeoutAction,
    default_ref: InlineValue | None,
    stamp: EventStamp,
) -> RunEvent:
    return NodeWaitTimedOut(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=record.address,
        attempt=record.attempt,
        on_timeout=action,
        default_ref=default_ref,
    )


def _escalated(from_attempt: int, record: WaitRecord, stamp: EventStamp) -> RunEvent:
    return NodeWaitEscalated(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=record.address,
        from_attempt=from_attempt,
        attempt=record.attempt,
        assignee=record.assignee,
        deadline_at=record.deadline_at,
    )


def suspended_event(record: WaitRecord) -> EventBuilder:
    return partial(_suspended, record)


def resumed_event(record: WaitRecord, resolved_by: ClientOpId) -> EventBuilder:
    return partial(_resumed, record, resolved_by)


def ignored_event(record: WaitRecord, ignored: IgnoredAnswer) -> EventBuilder:
    return partial(_ignored, record, ignored)


def timed_out_event(record: WaitRecord, action: OnTimeoutAction, default_ref: InlineValue | None) -> EventBuilder:
    return partial(_timed_out, record, action, default_ref)


def escalated_event(from_attempt: int, record: WaitRecord) -> EventBuilder:
    return partial(_escalated, from_attempt, record)
