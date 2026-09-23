from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, JsonValue

from aqven.diagnostics import Diagnostic
from aqven.ir import AgentModel, CompiledAgentOutput
from aqven.ir.nodes import CompiledNode
from aqven.ir.plan import CompiledProject
from aqven.runtime.address import ResourceModel, RunId
from aqven.runtime.vocabulary import RunStatus
from aqven.spec import (
    AgentSpec,
    DynamicLimits,
    EnumValue,
    FlowSpec,
    InferenceSpec,
    NodeKind,
    NodeSpec,
    RunContextKey,
    TypeSpec,
)

type CompileStatus = Literal["ok", "not_runnable", "invalid", "unreadable"]
type FileKind = Literal[
    "Project",
    "Type",
    "Flow",
    "Node",
    "Dataset",
    "Experiment",
    "Inference",
    "Agent",
    "Tool",
    "McpServer",
    "prompt",
    "code",
    "lock",
    "other",
]
type ParseStatus = Literal["ok", "invalid", "unreadable"]
type SyncState = Literal["ok", "quarantined", "unreadable"]
type IndexStatus = Literal["ready", "building", "degraded"]
type TypeKind = Literal["record", "enum", "union", "id", "value"]
type PromptLevel = Literal[1, 2, 3]
type Count = Annotated[int, Field(ge=0)]


class ReadyState(ResourceModel):
    status: Literal["ready"] = "ready"
    engine_version: str


class FileRef(ResourceModel):
    path: str
    file_hash: str


class ProblemCounts(ResourceModel):
    error: Count
    warning: Count
    info: Count


class IndexState(ResourceModel):
    status: IndexStatus
    generation: Annotated[int, Field(ge=1)]
    indexed_at: AwareDatetime
    pending_files: Count


class ProjectInfo(ResourceModel):
    root: str
    package: str | None
    engine_version: str
    tree_hash: str
    project_file: FileRef | None
    lock_file: FileRef | None
    index: IndexState
    problems: ProblemCounts
    quarantined_files: tuple[str, ...]
    spec_seq: Count
    mcp_url: str | None


class FileEntry(ResourceModel):
    path: str
    kind: FileKind
    file_hash: str
    size_bytes: Count
    mtime_ns: Count
    parse_status: ParseStatus
    sync_state: SyncState
    problems_count: Count
    last_good_content_hash: str | None


class FileDetail(FileEntry):
    problems: tuple[Diagnostic, ...]


class RunBrief(ResourceModel):
    run_id: RunId
    status: RunStatus
    started_at: AwareDatetime


class FlowSummary(ResourceModel):
    flow_id: str
    root_path: str
    compile_status: CompileStatus
    problems: ProblemCounts
    first_problem: Diagnostic | None
    node_count: Count
    input_type: str | None
    output_type: str | None
    context: tuple[RunContextKey, ...]
    content_hash: str | None
    last_run: RunBrief | None


class FlowDetail(FlowSummary):
    description: str | None
    files: tuple[FileRef, ...]
    tree_hash: str
    order: tuple[str, ...]
    diagnostics: tuple[Diagnostic, ...]
    layout_rev: str | None


class FlowSpecView(ResourceModel):
    flow_id: str
    flow: FlowSpec | None
    builder_path: str | None
    nodes: dict[str, NodeSpec]


class FlowIr(ResourceModel):
    flow_id: str
    content_hash: str
    ir: CompiledProject


class NodeSchemas(ResourceModel):
    in_: JsonValue = Field(default=None, alias="in")
    out: JsonValue = None
    form: JsonValue = None


class FlowSchemas(ResourceModel):
    flow_id: str
    input: JsonValue
    output: JsonValue
    context: tuple[RunContextKey, ...]
    nodes: dict[str, NodeSchemas]


class NodeSummary(ResourceModel):
    node_id: str
    local_id: str
    parent: str | None
    kind: NodeKind
    path: str
    file_hash: str
    agent: str | None
    inference: str | None
    prompt_level: PromptLevel | None
    code_ref: str | None
    problems_count: Count
    upstream: tuple[str, ...]
    downstream: tuple[str, ...]


class NodeBindingView(ResourceModel):
    slot: str
    ref: str | None
    value: JsonValue = None


class NodePromptRef(ResourceModel):
    inference_id: str
    level: PromptLevel | None
    path: str | None
    builder_ref: str | None


class NodeCode(ResourceModel):
    ref: str
    declared_in: JsonValue
    declared_out: JsonValue


class DynamicSlot(ResourceModel):
    path: tuple[str, ...]
    schema_from: str
    limits: DynamicLimits | None


class NodeDisplaySource(ResourceModel):
    path: str
    text: str


class NodeAgentRuntime(ResourceModel):
    models: tuple[AgentModel, ...] | None
    output: CompiledAgentOutput | None
    instructions: str | None


class NodeValueShape(ResourceModel):
    type_id: str
    spec: TypeSpec
    json_schema: JsonValue


class NodeDetail(NodeSummary):
    spec: NodeSpec
    ir_node: CompiledNode | None
    in_schema: JsonValue
    out_schema: JsonValue
    form_schema: JsonValue
    bindings: tuple[NodeBindingView, ...]
    prompt: NodePromptRef | None
    code: NodeCode | None
    dynamic_slots: tuple[DynamicSlot, ...]
    value_shapes: dict[str, NodeValueShape] = Field(default_factory=dict[str, NodeValueShape])
    problems: tuple[Diagnostic, ...]
    inference_spec: InferenceSpec | None = None
    inference_path: str | None = None
    agent_spec: AgentSpec | None = None
    agent_runtime: NodeAgentRuntime | None = None
    agent_path: str | None = None
    display_sources: dict[str, NodeDisplaySource] = Field(default_factory=dict[str, NodeDisplaySource])
    allowed_set_descriptions: dict[str, str] = Field(default_factory=dict[str, str])


class TypeSummary(ResourceModel):
    type_id: str
    path: str
    kind: TypeKind
    usage_count: Count
    status: Literal["ok", "invalid"]


class TypeDetail(ResourceModel):
    type_id: str
    path: str
    file_hash: str
    spec: TypeSpec
    json_schema: JsonValue
    enum_values: tuple[EnumValue, ...]


class PromptSourceText(ResourceModel):
    text: str
    file_hash: str | None


class PromptAnalysis(ResourceModel):
    variables: tuple[str, ...]
    globals: tuple[str, ...]
    filters: tuple[str, ...]
    tags: tuple[str, ...]


class PromptSlot(ResourceModel):
    name: str
    type_id: str
    used: bool


class PromptSummary(ResourceModel):
    flow_id: str
    node_id: str
    inference_id: str
    level: PromptLevel | None
    path: str | None
    file_hash: str | None
    builder_ref: str | None
    has_draft: bool
    draft_stale: bool
    problems_count: Count


class PromptDetail(PromptSummary):
    source: PromptSourceText | None
    analysis: PromptAnalysis | None
    slots: tuple[PromptSlot, ...]
    unused_inputs: tuple[str, ...]
    variant_files: tuple[str, ...]
    problems: tuple[Diagnostic, ...]
