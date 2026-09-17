from collections.abc import Mapping
from dataclasses import dataclass
from typing import assert_never

from aqven.engine.human.approval import (
    PendingToolCall,
    ToolApprovalFailed,
    ToolApprovalGate,
    ToolApprovalGranted,
    call_decision,
)
from aqven.engine.human.forms import ToolApprovalAnswer
from aqven.engine.llm.errors import LlmNodeError, failure_code_of
from aqven.engine.llm.ports import ApprovalRequest
from aqven.ports.execution import ExecutionScope
from aqven.runtime.human import ToolApprovalDecision


def human_calls(request: ApprovalRequest) -> tuple[PendingToolCall, ...]:
    return tuple(
        PendingToolCall(tool_call_id=call.tool_call_id, tool_name=call.tool_name, args=call.args)
        for call in request.calls
    )


def decisions(answer: ToolApprovalAnswer, calls: tuple[PendingToolCall, ...]) -> dict[str, ToolApprovalDecision]:
    return {
        call.tool_call_id: ToolApprovalDecision(
            approve=call_decision(answer, call).approve, message=call_decision(answer, call).message
        )
        for call in calls
    }


@dataclass(frozen=True, slots=True)
class HumanApprovalGate:
    gate: ToolApprovalGate

    async def decide(self, scope: ExecutionScope, request: ApprovalRequest) -> Mapping[str, ToolApprovalDecision]:
        calls = human_calls(request)
        outcome = await self.gate.decide(scope, request.spec, calls)
        match outcome:
            case ToolApprovalGranted():
                return decisions(outcome.answer, calls)
            case ToolApprovalFailed():
                raise LlmNodeError(failure_code_of(outcome.error.code), outcome.error.message)
            case _:
                assert_never(outcome)
