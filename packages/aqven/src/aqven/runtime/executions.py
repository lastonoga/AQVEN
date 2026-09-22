from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, JsonValue

from aqven.runtime.address import ExecutionAddress, JsonObject, Problem, ResourceModel
from aqven.runtime.human import HumanWaitDetail
from aqven.runtime.values import ValueRef
from aqven.runtime.vocabulary import (
    AttemptAction,
    AttemptCauseKind,
    CallOutcome,
    ExecutionStatus,
    PromptPartKind,
    PromptRole,
    ResolvedOutputMode,
)
from aqven.spec import MediaValue, NodeKind, OnFail, PromptLevel, TypeId


class ModelErrorDetails(ResourceModel):
    agent: str | None = None
    model: str | None = None
    output_mode: ResolvedOutputMode | None = None
    attempt: Annotated[int, Field(ge=1)] | None = None
    raw_excerpt: str | None = None
    violations: tuple[Problem, ...] = ()


class RunError(ResourceModel):
    code: str
    message: str
    address: ExecutionAddress | None
    hint: str | None = None
    details: ModelErrorDetails | None = None


class AttemptCause(ResourceModel):
    kind: AttemptCauseKind
    message: str
    schema_errors: tuple[Problem, ...]
    code: str | None = None
    hint: str | None = None
    details: ModelErrorDetails | None = None


class Attempt(ResourceModel):
    attempt: Annotated[int, Field(ge=1)]
    cause: AttemptCause | None
    action: AttemptAction
    model: str | None
    latency_ms: Annotated[int, Field(ge=0)] | None
    cost_usd: Decimal
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]
    prompt_ref: ValueRef | None
    response_ref: ValueRef | None


class NodeExecution(ResourceModel):
    address: ExecutionAddress
    kind: NodeKind
    status: ExecutionStatus
    attempts_count: Annotated[int, Field(ge=0)]
    started_at: AwareDatetime | None
    finished_at: AwareDatetime | None
    latency_ms: Annotated[int, Field(ge=0)] | None
    agent: str | None
    inference: str | None
    model: str | None
    profile: str | None
    cost_usd: Decimal
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]
    cache_hit: bool
    degraded: bool
    summary: str | None
    input_ref: ValueRef | None
    output_ref: ValueRef | None
    trace_id: str | None
    span_id: str | None


class SlotProvenance(ResourceModel):
    from_: str = Field(validation_alias="from", serialization_alias="from")
    need_id: str | None
    kind: str


class PromptPart(ResourceModel):
    kind: PromptPartKind
    text: str | None
    media: MediaValue | None


class PromptTraceMessage(ResourceModel):
    role: PromptRole
    parts: tuple[PromptPart, ...]


class SlotRange(ResourceModel):
    slot: str
    message_index: Annotated[int, Field(ge=0)]
    part_index: Annotated[int, Field(ge=0)]
    offset: Annotated[int, Field(ge=0)]
    length: Annotated[int, Field(ge=0)]


class PromptTrace(ResourceModel):
    level: PromptLevel
    template_sha256: str | None
    rendered_sha256: str
    rendered_ref: ValueRef | None
    messages: tuple[PromptTraceMessage, ...]
    slot_ranges: tuple[SlotRange, ...]
    variants: dict[str, str]
    output_schema_sent: JsonObject | None


class ResponseTrace(ResourceModel):
    outcome: CallOutcome
    raw_ref: ValueRef | None
    parsed_ref: ValueRef | None


class CheckOutcome(ResourceModel):
    check: str
    on_fail: OnFail
    passed: bool
    feedback: str | None
    attempt: Annotated[int, Field(ge=1)]


class AllowedSetMember(ResourceModel):
    value: str
    label: str | None


class ResolvedAllowedSet(ResourceModel):
    type_id: TypeId
    source: str
    labels_from: str | None
    members: tuple[AllowedSetMember, ...]


class ExecutionDetail(NodeExecution):
    provenance: dict[str, SlotProvenance]
    input_schema: JsonValue = None
    output_schema: JsonValue = None
    schema_source: Literal["run", "current", "unavailable"] = "unavailable"
    allowed_sets: tuple[ResolvedAllowedSet, ...] = ()
    prompt: PromptTrace | None
    response: ResponseTrace | None
    attempts: tuple[Attempt, ...]
    checks: tuple[CheckOutcome, ...]
    rule_firings: tuple[JsonObject, ...]
    error: RunError | None
    human: HumanWaitDetail | None
