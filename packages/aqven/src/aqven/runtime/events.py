from decimal import Decimal
from typing import Annotated, Final, Literal, get_args

from pydantic import AwareDatetime, Field, TypeAdapter

from aqven.runtime.address import ClientOpId, ExecutionAddress, Problem, ResourceModel, RunId
from aqven.runtime.costs import EXACT_COST
from aqven.runtime.executions import AttemptCause, CheckOutcome, ItemRecovery, PromptTrace, RunError
from aqven.runtime.values import InlineValue, ValueRef
from aqven.runtime.vocabulary import (
    AttemptAction,
    AttemptCauseKind,
    CostSource,
    FinishedExecutionStatus,
    OnTimeoutAction,
    RunMode,
    TerminalRunStatus,
    WaitKind,
)
from aqven.spec import AgentId, FlowId, InferenceId, LoopStopReason, NodeKind, TypeId

OUTPUT_DELTA_BATCH_MS: Final[int] = 80

type OutputPartKind = Literal["text", "reasoning", "tool_call_args", "output_json"]


class RunEventBase(ResourceModel):
    seq: Annotated[int, Field(ge=1)]
    at: AwareDatetime
    run_id: RunId


class RunStartedEvent(RunEventBase):
    type: Literal["run_started"] = "run_started"
    flow_id: FlowId
    content_hash: str
    mode: RunMode
    order: tuple[str, ...]
    input_ref: ValueRef | None


class NodeStarted(RunEventBase):
    type: Literal["node_started"] = "node_started"
    address: ExecutionAddress
    kind: NodeKind
    attempt: Annotated[int, Field(ge=1)]
    queued_ms: Annotated[int, Field(ge=0)]


class InferenceInputCaptured(RunEventBase):
    type: Literal["inference_input_captured"] = "inference_input_captured"
    address: ExecutionAddress
    stage: Literal["bound", "normalized"]
    agent: AgentId
    inference: InferenceId
    input_ref: InlineValue
    variants: dict[str, str]


class InferencePromptCaptured(RunEventBase):
    type: Literal["inference_prompt_captured"] = "inference_prompt_captured"
    address: ExecutionAddress
    prompt: PromptTrace


class InferenceChecksCaptured(RunEventBase):
    type: Literal["inference_checks_captured"] = "inference_checks_captured"
    address: ExecutionAddress
    checks: tuple[CheckOutcome, ...]


class NodeAttemptFailed(RunEventBase):
    type: Literal["node_attempt_failed"] = "node_attempt_failed"
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    cause: AttemptCause
    action: AttemptAction


class NodeProgress(RunEventBase):
    type: Literal["node_progress"] = "node_progress"
    address: ExecutionAddress
    done: Annotated[int, Field(ge=0)]
    total: Annotated[int, Field(ge=0)]


class MapItemRecovered(RunEventBase):
    type: Literal["map_item_recovered"] = "map_item_recovered"
    address: ExecutionAddress
    recovery: ItemRecovery


class NodeOutputDelta(RunEventBase):
    type: Literal["node_output_delta"] = "node_output_delta"
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    part_kind: OutputPartKind
    part_index: Annotated[int, Field(ge=0)]
    tool_call_id: str | None = None
    tool_name: str | None = None
    delta: Annotated[str, Field(min_length=1)]
    cumulative_length: Annotated[int, Field(ge=1)]


class NodeAttemptDiscarded(RunEventBase):
    type: Literal["node_attempt_discarded"] = "node_attempt_discarded"
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    cause: AttemptCauseKind
    discarded_parts: Annotated[int, Field(ge=0)]


class NodeSuspended(RunEventBase):
    type: Literal["node_suspended"] = "node_suspended"
    address: ExecutionAddress
    wait_kind: WaitKind
    attempt: Annotated[int, Field(ge=1)]
    form_type_id: TypeId
    assignee: str
    waiting_since: AwareDatetime
    deadline_at: AwareDatetime
    on_timeout: OnTimeoutAction


class NodeResumed(RunEventBase):
    type: Literal["node_resumed"] = "node_resumed"
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    resolved_by: ClientOpId
    answer_ref: ValueRef | None


class NodeAnswerIgnored(RunEventBase):
    type: Literal["node_answer_ignored"] = "node_answer_ignored"
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    client_op_id: ClientOpId
    sent_at: AwareDatetime
    problems: tuple[Problem, ...]


class NodeWaitTimedOut(RunEventBase):
    type: Literal["node_wait_timed_out"] = "node_wait_timed_out"
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    on_timeout: OnTimeoutAction
    default_ref: ValueRef | None


class NodeWaitEscalated(RunEventBase):
    type: Literal["node_wait_escalated"] = "node_wait_escalated"
    address: ExecutionAddress
    from_attempt: Annotated[int, Field(ge=1)]
    attempt: Annotated[int, Field(ge=1)]
    assignee: str
    deadline_at: AwareDatetime


class NodeFinished(RunEventBase):
    type: Literal["node_finished"] = "node_finished"
    address: ExecutionAddress
    status: FinishedExecutionStatus
    attempt: Annotated[int, Field(ge=1)]
    output_ref: ValueRef | None
    cost_usd: Decimal
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]
    latency_ms: Annotated[int, Field(ge=0)]
    wait_ms: Annotated[int, Field(ge=0)] = 0
    model: str | None
    cache_hit: bool
    degraded: bool
    checks_failed: Annotated[int, Field(ge=0)]
    error: RunError | None = None
    cost_source: CostSource = EXACT_COST
    unpriced_calls: Annotated[int, Field(ge=0)] = 0


class LoopIterationFinished(RunEventBase):
    type: Literal["loop_iteration_finished"] = "loop_iteration_finished"
    address: ExecutionAddress
    score: float | None
    stop_reason: LoopStopReason | None


class LoopExited(RunEventBase):
    type: Literal["loop_exited"] = "loop_exited"
    address: ExecutionAddress
    reason: LoopStopReason
    selected_iteration: Annotated[int, Field(ge=0)] | None


class RunSuspended(RunEventBase):
    type: Literal["run_suspended"] = "run_suspended"
    address: ExecutionAddress


class RunResumed(RunEventBase):
    type: Literal["run_resumed"] = "run_resumed"
    address: ExecutionAddress


class RunFinished(RunEventBase):
    type: Literal["run_finished"] = "run_finished"
    status: TerminalRunStatus
    output_ref: ValueRef | None
    error: RunError | None
    cost_usd: Decimal
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]


type RunEvent = Annotated[
    RunStartedEvent
    | NodeStarted
    | InferenceInputCaptured
    | InferencePromptCaptured
    | InferenceChecksCaptured
    | NodeAttemptFailed
    | NodeProgress
    | MapItemRecovered
    | NodeOutputDelta
    | NodeAttemptDiscarded
    | NodeSuspended
    | NodeResumed
    | NodeAnswerIgnored
    | NodeWaitTimedOut
    | NodeWaitEscalated
    | NodeFinished
    | LoopIterationFinished
    | LoopExited
    | RunSuspended
    | RunResumed
    | RunFinished,
    Field(discriminator="type"),
]

type RunEventType = Literal[
    "run_started",
    "node_started",
    "inference_input_captured",
    "inference_prompt_captured",
    "inference_checks_captured",
    "node_attempt_failed",
    "node_progress",
    "map_item_recovered",
    "node_output_delta",
    "node_attempt_discarded",
    "node_suspended",
    "node_resumed",
    "node_answer_ignored",
    "node_wait_timed_out",
    "node_wait_escalated",
    "node_finished",
    "loop_iteration_finished",
    "loop_exited",
    "run_suspended",
    "run_resumed",
    "run_finished",
]

RUN_EVENT_TYPES: Final[frozenset[str]] = frozenset(get_args(RunEventType.__value__))

RUN_EVENT_ADAPTER: Final[TypeAdapter[RunEvent]] = TypeAdapter(RunEvent)
