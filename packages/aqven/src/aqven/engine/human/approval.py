from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final, assert_never

from pydantic_ai import DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied

from aqven.engine.human.forms import TOOL_APPROVAL_FORM, TOOL_APPROVAL_TYPE_ID, ToolApprovalAnswer, ToolCallDecision
from aqven.engine.human.journal import WaitJournal
from aqven.engine.human.keys import FIRST_ATTEMPT
from aqven.engine.human.outcomes import (
    HumanAnswered,
    HumanDefaulted,
    HumanDefaultRejected,
    HumanExpired,
    WaitOutcome,
    expiry_plan,
    wait_error,
)
from aqven.engine.human.scripted import RUN_SPEC_ANSWERS, ScriptedAnswerSource, wait_run_id
from aqven.engine.human.waiter import HumanWaiter, WaitRequest
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import ExecutionAddress, JsonObject, RequestModel
from aqven.runtime.executions import RunError
from aqven.spec import ToolApprovalSpec

DEFAULT_DENIAL: Final = "The tool call was denied."


class PendingToolCall(RequestModel):
    tool_call_id: str
    tool_name: str
    args: JsonObject


class ToolApprovalSuspendData(RequestModel):
    calls: tuple[PendingToolCall, ...]


@dataclass(frozen=True, slots=True)
class ToolApprovalGranted:
    answer: ToolApprovalAnswer
    attempt: int
    degraded: bool


@dataclass(frozen=True, slots=True)
class ToolApprovalFailed:
    error: RunError
    attempt: int


type ToolApprovalOutcome = ToolApprovalGranted | ToolApprovalFailed
type ApprovalVerdict = ToolApproved | ToolDenied


def pending_approvals(requests: DeferredToolRequests) -> tuple[PendingToolCall, ...]:
    return tuple(
        PendingToolCall(tool_call_id=part.tool_call_id, tool_name=part.tool_name, args=part.args_as_dict())
        for part in requests.approvals
    )


def _approved(decision: ToolCallDecision) -> ApprovalVerdict:
    return ToolApproved(override_args=decision.override_args)


def _denied(decision: ToolCallDecision) -> ApprovalVerdict:
    return ToolDenied(decision.message or DEFAULT_DENIAL)


APPROVAL_VERDICTS: Final[Mapping[bool, Callable[[ToolCallDecision], ApprovalVerdict]]] = {
    True: _approved,
    False: _denied,
}


def call_decision(answer: ToolApprovalAnswer, call: PendingToolCall) -> ToolCallDecision:
    blanket = ToolCallDecision(approve=answer.approve, message=answer.message)
    return answer.calls.get(call.tool_call_id, blanket)


def approval_verdict(answer: ToolApprovalAnswer, call: PendingToolCall) -> ApprovalVerdict:
    decision = call_decision(answer, call)
    return APPROVAL_VERDICTS[decision.approve](decision)


def deferred_tool_results(answer: ToolApprovalAnswer, calls: tuple[PendingToolCall, ...]) -> DeferredToolResults:
    approvals: dict[str, bool | ToolApproved | ToolDenied] = {
        call.tool_call_id: approval_verdict(answer, call) for call in calls
    }
    return DeferredToolResults(approvals=approvals)


def approval_outcome(address: ExecutionAddress, outcome: WaitOutcome) -> ToolApprovalOutcome:
    match outcome:
        case HumanAnswered():
            return ToolApprovalGranted(ToolApprovalAnswer.model_validate(outcome.value), outcome.attempt, False)
        case HumanDefaulted():
            return ToolApprovalGranted(ToolApprovalAnswer.model_validate(outcome.value), outcome.attempt, True)
        case HumanExpired() | HumanDefaultRejected():
            return ToolApprovalFailed(wait_error(address, outcome), outcome.attempt)
        case _:
            assert_never(outcome)


@dataclass(frozen=True, slots=True)
class ToolApprovalGate:
    journal: WaitJournal
    scripted: ScriptedAnswerSource = RUN_SPEC_ANSWERS

    async def decide(
        self,
        scope: ExecutionScope,
        approval: ToolApprovalSpec,
        calls: tuple[PendingToolCall, ...],
        attempt: int = FIRST_ATTEMPT,
    ) -> ToolApprovalOutcome:
        request = WaitRequest(
            run_id=wait_run_id(scope),
            address=scope.address,
            wait_kind="tool_approval",
            form=TOOL_APPROVAL_FORM,
            form_type_id=TOOL_APPROVAL_TYPE_ID,
            form_schema=TOOL_APPROVAL_FORM.json_schema(),
            suspend_data=ToolApprovalSuspendData(calls=calls).model_dump(mode="json"),
            assignee=approval.assignee,
            timeout_seconds=float(approval.timeout_seconds),
            expiry=expiry_plan(approval.on_timeout),
            attempt=attempt,
        )
        waiter = HumanWaiter(self.journal, scope.events, await self.scripted.book(scope))
        return approval_outcome(scope.address, await waiter.wait(request))
