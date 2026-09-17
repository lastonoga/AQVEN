from dataclasses import dataclass
from datetime import datetime
from typing import Final

from pydantic import JsonValue, ValidationError

from aqven.engine.human.forms import FormModel, FormRejected, prefixed_problems, validation_problems
from aqven.engine.human.records import ENVELOPE_ADAPTER, UNKNOWN_CLIENT_OP, AnswerEnvelope, WaitRecord, ignored_answer
from aqven.runtime.address import Problem
from aqven.runtime.human import IgnoredAnswer

ENVELOPE_PATH: Final = ("envelope",)
PAYLOAD_PATH: Final = ("payload",)
LATE_ANSWER: Final = Problem(path=("sent_at",), code="answer_late", message="answer was sent after the wait deadline")


@dataclass(frozen=True, slots=True)
class AcceptedAnswer:
    envelope: AnswerEnvelope
    value: JsonValue


type JudgedAnswer = AcceptedAnswer | IgnoredAnswer


def parse_envelope(message: object, received_at: datetime) -> AnswerEnvelope | IgnoredAnswer:
    try:
        return ENVELOPE_ADAPTER.validate_python(message)
    except ValidationError as error:
        return ignored_answer(UNKNOWN_CLIENT_OP, received_at, validation_problems(error, ENVELOPE_PATH))


def judge_answer(form: FormModel, record: WaitRecord, message: object, received_at: datetime) -> JudgedAnswer:
    envelope = parse_envelope(message, received_at)
    if isinstance(envelope, IgnoredAnswer):
        return envelope
    if envelope.sent_at > record.deadline_at:
        return ignored_answer(envelope.idempotency_key, envelope.sent_at, (LATE_ANSWER,))
    verdict = form.check(envelope.payload)
    if isinstance(verdict, FormRejected):
        problems = prefixed_problems(verdict.problems, PAYLOAD_PATH)
        return ignored_answer(envelope.idempotency_key, envelope.sent_at, problems)
    return AcceptedAnswer(envelope, verdict.value)
