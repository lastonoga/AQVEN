from dataclasses import dataclass
from typing import ClassVar, Final, assert_never

from pydantic import JsonValue

from aqven.runtime.address import ClientOpId, ExecutionAddress, Problem
from aqven.runtime.executions import RunError
from aqven.runtime.vocabulary import OnTimeoutAction
from aqven.spec import DefaultOnTimeout, EscalateOnTimeout, FailOnTimeout, TimeoutPolicy

HUMAN_TIMED_OUT: Final = "HUMAN_TIMED_OUT"
HUMAN_DEFAULT_INVALID: Final = "HUMAN_DEFAULT_INVALID"


@dataclass(frozen=True, slots=True)
class FailOnExpiry:
    action: ClassVar[OnTimeoutAction] = "fail"


@dataclass(frozen=True, slots=True)
class DefaultOnExpiry:
    value: JsonValue
    action: ClassVar[OnTimeoutAction] = "default"


@dataclass(frozen=True, slots=True)
class EscalateOnExpiry:
    assignee: str
    timeout_seconds: float
    action: ClassVar[OnTimeoutAction] = "escalate"


type ExpiryPlan = FailOnExpiry | DefaultOnExpiry | EscalateOnExpiry

FAIL_ON_EXPIRY: Final = FailOnExpiry()


def expiry_plan(policy: TimeoutPolicy) -> ExpiryPlan:
    match policy:
        case FailOnTimeout():
            return FAIL_ON_EXPIRY
        case DefaultOnTimeout():
            return DefaultOnExpiry(policy.value)
        case EscalateOnTimeout():
            return EscalateOnExpiry(policy.assignee, float(policy.timeout_seconds))
        case _:
            assert_never(policy)


@dataclass(frozen=True, slots=True)
class HumanAnswered:
    value: JsonValue
    attempt: int
    resolved_by: ClientOpId


@dataclass(frozen=True, slots=True)
class HumanDefaulted:
    value: JsonValue
    attempt: int


@dataclass(frozen=True, slots=True)
class HumanExpired:
    attempt: int


@dataclass(frozen=True, slots=True)
class HumanDefaultRejected:
    attempt: int
    problems: tuple[Problem, ...]


type WaitOutcome = HumanAnswered | HumanDefaulted | HumanExpired | HumanDefaultRejected
type WaitFailure = HumanExpired | HumanDefaultRejected


def wait_error(address: ExecutionAddress, failure: WaitFailure) -> RunError:
    match failure:
        case HumanExpired():
            return RunError(
                code=HUMAN_TIMED_OUT,
                message=f"no human answer before the deadline, attempt {failure.attempt}",
                address=address,
            )
        case HumanDefaultRejected():
            return RunError(
                code=HUMAN_DEFAULT_INVALID,
                message="default answer does not match the form model",
                address=address,
            )
        case _:
            assert_never(failure)
