from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, JsonValue

from aqven.ports.execution import NodeUsage
from aqven.runtime.address import JsonObject, ResourceModel
from aqven.runtime.executions import AttemptCause, CheckOutcome, ModelErrorDetails
from aqven.runtime.human import ToolApprovalDecision
from aqven.runtime.vocabulary import AttemptAction
from aqven.spec import OnFail


class PendingToolCall(ResourceModel):
    tool_call_id: str
    tool_name: str
    args: JsonObject = Field(default_factory=dict[str, JsonValue])


class ToolCallReturned(ResourceModel):
    kind: Literal["returned"] = "returned"
    value: JsonValue


class ToolCallRetried(ResourceModel):
    kind: Literal["retried"] = "retried"
    message: str


type ToolCallResult = Annotated[ToolCallReturned | ToolCallRetried, Field(discriminator="kind")]


class SegmentCompleted(ResourceModel):
    status: Literal["completed"] = "completed"
    output: JsonObject
    model: str | None = None
    checks: tuple[CheckOutcome, ...] = ()
    variants: dict[str, str] = Field(default_factory=dict[str, str])
    final_attempt: Annotated[int, Field(ge=0)] = 0

    @property
    def checks_failed(self) -> int:
        return sum(
            1
            for outcome in self.checks
            if not outcome.passed and outcome.on_fail == OnFail.FLAG and outcome.attempt == self.final_attempt
        )


class SegmentDeferred(ResourceModel):
    status: Literal["deferred"] = "deferred"
    approvals: tuple[PendingToolCall, ...] = ()
    calls: tuple[PendingToolCall, ...] = ()
    messages_json: str


class SegmentFailed(ResourceModel):
    status: Literal["failed"] = "failed"
    code: str
    message: str
    hint: str | None = None
    details: ModelErrorDetails | None = None


class AttemptFailure(ResourceModel):
    attempt: Annotated[int, Field(ge=1)]
    cause: AttemptCause
    action: AttemptAction


type SegmentOutcome = Annotated[SegmentCompleted | SegmentDeferred | SegmentFailed, Field(discriminator="status")]


class SegmentResult(ResourceModel):
    outcome: SegmentOutcome
    usage: NodeUsage = Field(default_factory=NodeUsage)
    attempts: Annotated[int, Field(ge=0)] = 0
    failures: tuple[AttemptFailure, ...] = ()


class SegmentState(ResourceModel):
    segment: Annotated[int, Field(ge=1)] = 1
    attempt_offset: Annotated[int, Field(ge=0)] = 0
    messages_json: str | None = None
    approvals: dict[str, ToolApprovalDecision] = Field(default_factory=dict[str, ToolApprovalDecision])
    call_results: dict[str, ToolCallResult] = Field(default_factory=dict[str, ToolCallResult])


def add_usage(left: NodeUsage, right: NodeUsage) -> NodeUsage:
    return NodeUsage(
        cost_usd=Decimal(left.cost_usd) + Decimal(right.cost_usd),
        tokens_in=left.tokens_in + right.tokens_in,
        tokens_out=left.tokens_out + right.tokens_out,
        requests=left.requests + right.requests,
        tool_calls=left.tool_calls + right.tool_calls,
    )
