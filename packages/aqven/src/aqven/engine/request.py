from decimal import Decimal
from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, TypeAdapter

from aqven.ports.execution import NodeOutcome, NodeUsage
from aqven.runtime.address import JsonObject
from aqven.runtime.executions import RunError
from aqven.runtime.human import ScriptedAnswer
from aqven.runtime.options import CassetteConfig, ModelProfile, RunContext, RunOptions
from aqven.runtime.overrides import NodeOutputOverride
from aqven.runtime.replay import McpToolStub, ProviderFault
from aqven.runtime.vocabulary import RunMode, TerminalRunStatus
from aqven.spec import ArmId, ExperimentId, FlowId, Limits, NodeId

RECORD_CONFIG: Final = ConfigDict(extra="forbid", frozen=True)


class SeriesTag(BaseModel):
    model_config = RECORD_CONFIG
    series_id: str
    attempt_id: str
    role: Literal["subject", "judge"]
    variant_id: str
    case_name: str
    repeat: int = Field(ge=1)
    check_id: str | None = None
    experiment_id: ExperimentId | None = None
    arm_id: ArmId | None = None


class RunSpec(BaseModel):
    model_config = RECORD_CONFIG
    flow_id: FlowId
    mode: RunMode = "live"
    dataset_item_id: str | None = None
    context: RunContext | None = None
    selected_nodes: tuple[NodeId, ...] | None = None
    start_node: NodeId | None = None
    end_node: NodeId | None = None
    node_outputs: dict[NodeId, JsonValue] = Field(default_factory=dict[NodeId, JsonValue])
    cassettes: CassetteConfig | None = None
    human_answers: tuple[ScriptedAnswer, ...] = ()
    mcp_stubs: tuple[McpToolStub, ...] = ()
    faults: tuple[ProviderFault, ...] = ()
    limits: Limits | None = None
    models: ModelProfile | None = None
    outputs: tuple[NodeOutputOverride, ...] = ()
    series: SeriesTag | None = None
    output_deltas: bool = True

    def run_context(self) -> JsonObject:
        if self.context is None:
            return {}
        return self.context.model_dump(mode="json", exclude_none=True)


def run_spec_of(flow_id: FlowId, options: RunOptions) -> RunSpec:
    return RunSpec(
        flow_id=flow_id,
        mode=options.mode,
        context=options.context,
        cassettes=options.cassettes,
        human_answers=options.human_answers,
        mcp_stubs=options.mcp_stubs,
        faults=options.faults,
        limits=options.limits,
        models=options.models,
        outputs=options.outputs,
    )


class RunUsageTotals(BaseModel):
    model_config = RECORD_CONFIG
    cost_usd: Decimal = Decimal(0)
    tokens_in: Annotated[int, Field(ge=0)] = 0
    tokens_out: Annotated[int, Field(ge=0)] = 0

    def plus_node(self, usage: NodeUsage) -> RunUsageTotals:
        return RunUsageTotals(
            cost_usd=self.cost_usd + usage.cost_usd,
            tokens_in=self.tokens_in + usage.tokens_in,
            tokens_out=self.tokens_out + usage.tokens_out,
        )

    def plus(self, other: RunUsageTotals) -> RunUsageTotals:
        return RunUsageTotals(
            cost_usd=self.cost_usd + other.cost_usd,
            tokens_in=self.tokens_in + other.tokens_in,
            tokens_out=self.tokens_out + other.tokens_out,
        )


class RunRecord(BaseModel):
    model_config = RECORD_CONFIG
    status: TerminalRunStatus
    output: JsonValue = None
    error: RunError | None = None
    usage: RunUsageTotals = Field(default_factory=RunUsageTotals)


class RunCall(BaseModel):
    model_config = RECORD_CONFIG
    ir_hash: str
    flow_input: JsonObject
    spec: RunSpec


class BranchTicket(BaseModel):
    model_config = RECORD_CONFIG
    run_id: str
    spec: RunSpec
    flow_id: FlowId
    flow_input: JsonObject
    prefix: str
    node_id: str
    chain: tuple[tuple[str | None, int | None, int | None], ...]
    frame: JsonObject
    values: dict[str, JsonValue]
    attempts: dict[str, int]
    overlay: JsonObject | None = None


class BranchResult(BaseModel):
    model_config = RECORD_CONFIG
    outcome: JsonObject
    events: tuple[JsonObject, ...]
    values: dict[str, JsonValue]
    attempts: dict[str, int]
    usage: RunUsageTotals


NODE_OUTCOME_ADAPTER: Final[TypeAdapter[NodeOutcome]] = TypeAdapter(NodeOutcome)
RUN_CALL_ARGUMENTS: Final[TypeAdapter[tuple[str, JsonObject, JsonObject]]] = TypeAdapter(
    tuple[str, JsonObject, JsonObject]
)
