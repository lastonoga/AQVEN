from datetime import datetime
from typing import Annotated, Final

from pydantic import AwareDatetime, Field, JsonValue, TypeAdapter

from aqven.runtime.address import ClientOpId, ExecutionAddress, JsonObject, Problem, RequestModel, RunId
from aqven.runtime.human import HumanWait, HumanWaitAttempt, HumanWaitDetail, IgnoredAnswer
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import OnTimeoutAction, WaitKind, WaitState
from aqven.spec import TypeId

UNKNOWN_CLIENT_OP: Final = ClientOpId("unknown")


class AnswerEnvelope(RequestModel):
    payload: JsonValue
    idempotency_key: ClientOpId
    sent_at: AwareDatetime


ENVELOPE_ADAPTER: Final[TypeAdapter[AnswerEnvelope]] = TypeAdapter(AnswerEnvelope)


class WaitOpening(RequestModel):
    attempt: Annotated[int, Field(ge=1)]
    assignee: str
    waiting_since: AwareDatetime
    deadline_at: AwareDatetime
    on_timeout: OnTimeoutAction
    topic: str


class WaitRecord(RequestModel):
    run_id: RunId
    workflow_id: str
    address: ExecutionAddress
    wait_kind: WaitKind
    form_type_id: TypeId
    form_schema: JsonObject
    suspend_data: JsonValue
    topic: str
    attempt: Annotated[int, Field(ge=1)]
    assignee: str
    waiting_since: AwareDatetime
    deadline_at: AwareDatetime
    on_timeout: OnTimeoutAction
    state: WaitState
    attempts: tuple[HumanWaitAttempt, ...]
    resolved_by: ClientOpId | None = None
    resolved_at: AwareDatetime | None = None
    answer: JsonValue = None
    ignored_answers: tuple[IgnoredAnswer, ...] = ()


RECORD_ADAPTER: Final[TypeAdapter[WaitRecord]] = TypeAdapter(WaitRecord)


class WaitSubject(RequestModel):
    run_id: RunId
    workflow_id: str
    address: ExecutionAddress
    wait_kind: WaitKind
    form_type_id: TypeId
    form_schema: JsonObject
    suspend_data: JsonValue


def attempt_of(opening: WaitOpening) -> HumanWaitAttempt:
    return HumanWaitAttempt(
        attempt=opening.attempt,
        assignee=opening.assignee,
        waiting_since=opening.waiting_since,
        deadline_at=opening.deadline_at,
        state="waiting",
        resolved_at=None,
    )


def opened_record(subject: WaitSubject, opening: WaitOpening) -> WaitRecord:
    return WaitRecord(
        **subject.model_dump(),
        **opening.model_dump(),
        state="waiting",
        attempts=(attempt_of(opening),),
    )


def escalated_record(record: WaitRecord, opening: WaitOpening) -> WaitRecord:
    return record.model_copy(
        update={
            **opening.model_dump(),
            "state": "waiting",
            "resolved_at": None,
            "attempts": (*record.attempts, attempt_of(opening)),
        }
    )


def _closed_attempts(record: WaitRecord, state: WaitState, at: datetime) -> tuple[HumanWaitAttempt, ...]:
    closed = record.attempts[-1].model_copy(update={"state": state, "resolved_at": at})
    return (*record.attempts[:-1], closed)


def resolved_record(record: WaitRecord, envelope: AnswerEnvelope, answer: JsonValue, at: datetime) -> WaitRecord:
    return record.model_copy(
        update={
            "state": "resolved",
            "attempts": _closed_attempts(record, "resolved", at),
            "resolved_by": envelope.idempotency_key,
            "resolved_at": at,
            "answer": answer,
        }
    )


def timed_out_record(record: WaitRecord, at: datetime) -> WaitRecord:
    return record.model_copy(
        update={"state": "timed_out", "attempts": _closed_attempts(record, "timed_out", at), "resolved_at": at}
    )


def ignored_record(record: WaitRecord, ignored: IgnoredAnswer) -> WaitRecord:
    return record.model_copy(update={"ignored_answers": (*record.ignored_answers, ignored)})


def record_json(record: WaitRecord) -> JsonObject:
    return record.model_dump(mode="json")


def human_wait(record: WaitRecord) -> HumanWait:
    return HumanWait(
        address=record.address,
        wait_kind=record.wait_kind,
        attempt=record.attempt,
        state=record.state,
        assignee=record.assignee,
        waiting_since=record.waiting_since,
        deadline_at=record.deadline_at,
        on_timeout=record.on_timeout,
        form_type_id=record.form_type_id,
    )


def _answer_ref(record: WaitRecord) -> InlineValue | None:
    if record.state != "resolved":
        return None
    return InlineValue(value=record.answer)


def human_wait_detail(record: WaitRecord) -> HumanWaitDetail:
    return HumanWaitDetail(
        **human_wait(record).model_dump(),
        form_schema=record.form_schema,
        suspend_data=InlineValue(value=record.suspend_data),
        attempts=record.attempts,
        resolved_by=record.resolved_by,
        answer_ref=_answer_ref(record),
        ignored_answers=record.ignored_answers,
    )


def ignored_answer(client_op_id: ClientOpId, sent_at: datetime, problems: tuple[Problem, ...]) -> IgnoredAnswer:
    return IgnoredAnswer(client_op_id=client_op_id, sent_at=sent_at, problems=problems)
