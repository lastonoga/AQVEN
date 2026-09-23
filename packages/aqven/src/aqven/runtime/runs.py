from decimal import Decimal
from typing import Annotated, Self

from pydantic import AwareDatetime, Field, JsonValue, model_validator

from aqven.runtime.address import ExecutionAddress, JsonObject, Problem, RequestModel, ResourceModel, RunId
from aqven.runtime.executions import NodeExecution, RunError
from aqven.runtime.human import HumanWait, ScriptedAnswer
from aqven.runtime.options import RunContext
from aqven.runtime.values import ValueRef
from aqven.runtime.vocabulary import ForkBase, LineageRelation, PromptSource, RunMode, RunStatus, SpecOrigin
from aqven.spec import AgentId, FlowId, Limits, NodeId

WORKING_COPY = "working"


class RunInputConflict(ValueError):
    def __init__(self) -> None:
        super().__init__("exactly one of input and dataset_item_id is required")


class RunStartRequest(RequestModel):
    flow_id: FlowId
    at: str = WORKING_COPY
    mode: RunMode
    context: RunContext | None = None
    input: JsonValue = None
    dataset_item_id: str | None = None
    selected_nodes: tuple[NodeId, ...] | None = None
    start_node: NodeId | None = None
    end_node: NodeId | None = None
    node_outputs: dict[NodeId, JsonValue] = Field(default_factory=dict[NodeId, JsonValue])
    cassette_id: str | None = None
    human_answers: tuple[ScriptedAnswer, ...] | None = None

    @model_validator(mode="after")
    def exactly_one_input_source(self) -> Self:
        if (self.input is None) == (self.dataset_item_id is None):
            raise RunInputConflict()
        if (self.start_node is None) != (self.end_node is None):
            raise ValueError("start_node and end_node must be provided together")
        if self.start_node is not None and self.selected_nodes is not None:
            raise ValueError("selected_nodes and a node range cannot be combined")
        if self.start_node is None and self.node_outputs:
            raise ValueError("node_outputs can only be used with a node range")
        return self


class RunStarted(ResourceModel):
    run_id: RunId
    status: RunStatus
    content_hash: str
    spec_version_id: str
    last_seq: Annotated[int, Field(ge=0)]
    ui_url: str
    warnings: tuple[Problem, ...] = ()


class NodeCounts(ResourceModel):
    pending: Annotated[int, Field(ge=0)]
    running: Annotated[int, Field(ge=0)]
    ok: Annotated[int, Field(ge=0)]
    failed: Annotated[int, Field(ge=0)]
    skipped: Annotated[int, Field(ge=0)]
    suspended: Annotated[int, Field(ge=0)]
    cancelled: Annotated[int, Field(ge=0)]


class Lineage(ResourceModel):
    relation: LineageRelation
    parent_run_id: RunId


class RunSummary(ResourceModel):
    run_id: RunId
    flow_id: FlowId
    status: RunStatus
    mode: RunMode
    started_at: AwareDatetime
    finished_at: AwareDatetime | None
    cost_usd: Decimal
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]
    node_counts: NodeCounts
    content_hash: str
    definition_changed: bool
    waits: tuple[HumanWait, ...]
    lineage: Lineage | None
    dataset_item_id: str | None = None
    selected_nodes: tuple[NodeId, ...] | None = None
    start_node: NodeId | None = None
    end_node: NodeId | None = None
    series_id: str | None = None


class SpecVersionInfo(ResourceModel):
    id: str
    content_hash: str
    release_hash: str | None
    git_commit: str | None
    origin: SpecOrigin
    sources: dict[str, str]


class HumanAnswerStatus(ResourceModel):
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    consumed: bool


class RunSnapshot(RunSummary):
    execution_id: str
    context: RunContext | None
    node_outputs: dict[NodeId, JsonValue] = Field(default_factory=dict[NodeId, JsonValue])
    spec_version: SpecVersionInfo
    input_ref: ValueRef | None
    output_ref: ValueRef | None
    error: RunError | None
    seed: int | None
    cassette_id: str | None
    catalog_snapshot_at: AwareDatetime | None
    effective_config: JsonObject
    config_hash: str
    limits: Limits | None
    trace_id: str | None
    order: tuple[str, ...]
    executions: tuple[NodeExecution, ...]
    human_answers: tuple[HumanAnswerStatus, ...]
    last_seq: Annotated[int, Field(ge=0)]


class ForkOverrides(RequestModel):
    input: JsonValue = None
    agent: AgentId | None = None
    prompt_source: PromptSource | None = None


class ForkRequest(RequestModel):
    from_: ExecutionAddress = Field(validation_alias="from", serialization_alias="from")
    overrides: ForkOverrides | None = None
    at: ForkBase = "original"


class RunForked(ResourceModel):
    run_id: RunId
    lineage_parent: RunId


class CancelRequest(RequestModel):
    reason: str


class CancelResult(ResourceModel):
    status: RunStatus


class Page[T](ResourceModel):
    items: tuple[T, ...]
    next_cursor: str | None
    total_estimate: Annotated[int, Field(ge=0)] | None
