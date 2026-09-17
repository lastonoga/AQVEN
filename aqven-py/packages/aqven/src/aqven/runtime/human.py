from typing import Annotated

from pydantic import AwareDatetime, Field, JsonValue

from aqven.runtime.address import ClientOpId, ExecutionAddress, JsonObject, Problem, RequestModel, ResourceModel
from aqven.runtime.values import ValueRef
from aqven.runtime.vocabulary import OnTimeoutAction, ResumeOutcome, RunStatus, WaitKind, WaitState
from aqven.spec import TypeId


class HumanWait(ResourceModel):
    address: ExecutionAddress
    wait_kind: WaitKind
    attempt: Annotated[int, Field(ge=1)]
    state: WaitState
    assignee: str
    waiting_since: AwareDatetime
    deadline_at: AwareDatetime
    on_timeout: OnTimeoutAction
    form_type_id: TypeId


class HumanWaitAttempt(ResourceModel):
    attempt: Annotated[int, Field(ge=1)]
    assignee: str
    waiting_since: AwareDatetime
    deadline_at: AwareDatetime
    state: WaitState
    resolved_at: AwareDatetime | None


class IgnoredAnswer(ResourceModel):
    client_op_id: ClientOpId
    sent_at: AwareDatetime
    problems: tuple[Problem, ...]


class HumanWaitDetail(HumanWait):
    form_schema: JsonObject
    suspend_data: ValueRef | None
    attempts: tuple[HumanWaitAttempt, ...]
    resolved_by: ClientOpId | None
    answer_ref: ValueRef | None
    ignored_answers: tuple[IgnoredAnswer, ...]


class ScriptedAnswer(RequestModel):
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)] = 1
    payload: JsonValue


class ToolApprovalDecision(RequestModel):
    approve: bool
    message: str | None = None


class ResumeRequest(RequestModel):
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    payload: JsonValue
    client_op_id: ClientOpId


class ResumeResult(ResourceModel):
    outcome: ResumeOutcome
    status: RunStatus
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
