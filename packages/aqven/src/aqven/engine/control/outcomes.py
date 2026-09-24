from dataclasses import dataclass, field
from typing import Final, Literal

from aqven.engine.policies import PolicyError
from aqven.ports.execution import (
    ExecutionScope,
    NodeCancelled,
    NodeFailed,
    NodeOutcome,
    NodeSkipped,
    NodeSucceeded,
    NodeUsage,
    combined_usage,
)
from aqven.runtime.executions import RunError

type ControlErrorCode = Literal[
    "E_JOIN_FAILED",
    "E_JOIN_UNDECIDED",
    "E_MAP_OVER_NOT_LIST",
    "E_MAP_ITEM_FAILED",
    "E_INPUT_OVERLAY_UNSUPPORTED",
]

BUDGET_ERROR_CODES: Final[frozenset[str]] = frozenset({"budget_exceeded"})
SKIPPED_CODE: Final = "E_CHILD_SKIPPED"
CANCELLED_CODE: Final = "E_CHILD_CANCELLED"


@dataclass(slots=True)
class UsageTally:
    parts: list[NodeUsage] = field(default_factory=list[NodeUsage])

    def add(self, outcome: NodeOutcome) -> None:
        if isinstance(outcome, NodeSucceeded | NodeFailed):
            self.parts.append(outcome.usage)

    @property
    def total(self) -> NodeUsage:
        return combined_usage(self.parts)


def control_error(scope: ExecutionScope, code: ControlErrorCode, message: str) -> RunError:
    return RunError(code=code, message=message, address=scope.address)


def failure(scope: ExecutionScope, code: ControlErrorCode, message: str, usage: UsageTally) -> NodeFailed:
    return NodeFailed(error=control_error(scope, code, message), usage=usage.total)


def policy_failure(scope: ExecutionScope, error: PolicyError, usage: UsageTally) -> NodeFailed:
    return NodeFailed(error=RunError(code=error.code, message=error.message, address=scope.address), usage=usage.total)


def outcome_error(outcome: NodeFailed | NodeSkipped | NodeCancelled) -> tuple[str, str]:
    match outcome:
        case NodeFailed():
            return outcome.error.code, outcome.error.message
        case NodeSkipped():
            return SKIPPED_CODE, outcome.reason
        case NodeCancelled():
            return CANCELLED_CODE, outcome.reason or "child execution was cancelled"
