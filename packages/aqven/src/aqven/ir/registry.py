from typing import Annotated, Final, Literal, Self, assert_never

from pydantic import Field, model_validator

from aqven.ir.common import (
    AbsoluteCodeRef,
    CompiledCheck,
    DynamicOutput,
    FieldIr,
    IrModel,
    JsonSchema,
    JudgeEvaluator,
    RefText,
)
from aqven.spec import (
    MODEL_PATTERN,
    PROVIDER_NAME_PATTERN,
    AgentId,
    Effect,
    ExampleSpec,
    InferenceId,
    Limits,
    McpServerId,
    ModelSettingsSpec,
    ModelString,
    OutcomePolicy,
    OutputModeSetting,
    OutputModeSource,
    ProviderName,
    SecretBinding,
    SecretHeader,
    StructuredMode,
    SubagentSpec,
    ToolApprovalSpec,
    ToolId,
    TypeId,
)
from aqven.spec.builtins import absent

type ModelText = Annotated[ModelString, Field(pattern=MODEL_PATTERN)]
type ProviderText = Annotated[ProviderName, Field(pattern=PROVIDER_NAME_PATTERN)]
type PromptLevelText = Literal[1, 2]

PROFILE_DEFAULT_REASON: Final = "Pydantic AI profile default"


class AgentModel(IrModel):
    model: ModelText
    provider: ProviderText


class CompiledAgentOutput(IrModel):
    mode: StructuredMode = "tool"
    declared_mode: OutputModeSetting = OutputModeSetting.AUTO
    mode_source: OutputModeSource = "profile"
    mode_reason: Annotated[str, Field(min_length=1)] = PROFILE_DEFAULT_REASON
    instruction: str | None = None
    strict: bool = True
    retries: Annotated[int, Field(ge=0, le=5)] = 1
    on_error: OutcomePolicy = OutcomePolicy.RETRY
    on_refusal: OutcomePolicy = OutcomePolicy.FAIL
    on_truncated: OutcomePolicy = OutcomePolicy.FAIL


class CompiledAgent(IrModel):
    agent_id: AgentId
    description: Annotated[str, Field(min_length=1)]
    models: Annotated[tuple[AgentModel, ...], Field(min_length=1)]
    settings: ModelSettingsSpec | None = None
    output: CompiledAgentOutput = Field(default_factory=CompiledAgentOutput)
    file: str | None = None
    instructions: str | None = None
    tools: tuple[ToolId, ...] = ()
    mcp_servers: tuple[McpServerId, ...] = ()
    subagents: tuple[SubagentSpec, ...] = ()
    approval: ToolApprovalSpec | None = None
    limits: Limits | None = None

    @property
    def primary(self) -> AgentModel:
        return self.models[0]

    @property
    def fallbacks(self) -> tuple[AgentModel, ...]:
        return self.models[1:]


class TemplatePrompt(IrModel):
    kind: Literal["template"] = "template"
    level: PromptLevelText
    template: Annotated[str, Field(min_length=1)]
    partials: dict[str, str] = Field(default_factory=dict[str, str])


class CodePrompt(IrModel):
    kind: Literal["code"] = "code"
    run: AbsoluteCodeRef


type CompiledPrompt = Annotated[TemplatePrompt | CodePrompt, Field(discriminator="kind")]


class CompiledVariantSlot(IrModel):
    on: RefText
    cases: Annotated[dict[str, str], Field(min_length=1)]
    default: str | None = None


class CompiledAllowedSet(IrModel):
    type_id: TypeId
    source: RefText
    labels_from: RefText | None = None


class CompiledDisplayFormatter(IrModel):
    run: AbsoluteCodeRef | None = None
    template: str | None = None
    variables: dict[str, RefText] = Field(default_factory=dict[str, RefText])

    @model_validator(mode="after")
    def one_source(self) -> Self:
        if (self.run is None) == (self.template is None):
            raise ValueError("exactly one of run and template is required")
        return self


class CompiledInferenceDisplay(IrModel):
    input: CompiledDisplayFormatter | None = None
    output: CompiledDisplayFormatter | None = None


class CompiledInference(IrModel):
    inference_id: InferenceId
    description: Annotated[str, Field(min_length=1)]
    input_fields: tuple[FieldIr, ...] = ()
    output_fields: Annotated[tuple[FieldIr, ...], Field(min_length=1)]
    input_schema: JsonSchema
    output_schema: JsonSchema
    dynamic_outputs: tuple[DynamicOutput, ...] = ()
    prompt: CompiledPrompt | None = None
    variants: dict[str, CompiledVariantSlot] = Field(default_factory=dict[str, CompiledVariantSlot])
    allowed_sets: tuple[CompiledAllowedSet, ...] = ()
    examples: tuple[ExampleSpec, ...] = ()
    checks: tuple[CompiledCheck, ...] = ()
    display: CompiledInferenceDisplay | None = None
    file: str | None = None
    origin: InferenceId | None = Field(default=None, exclude_if=absent)


class CodeToolSource(IrModel):
    kind: Literal["code"] = "code"
    run: AbsoluteCodeRef


class McpToolSource(IrModel):
    kind: Literal["mcp"] = "mcp"
    server: McpServerId
    tool: Annotated[str, Field(min_length=1)]


type CompiledToolSource = Annotated[CodeToolSource | McpToolSource, Field(discriminator="kind")]


class CompiledJobWait(IrModel):
    poll: AbsoluteCodeRef
    interval_seconds: Annotated[int, Field(ge=1)]
    timeout_seconds: Annotated[int, Field(ge=1)]


class CompiledTool(IrModel):
    tool_id: ToolId
    description: Annotated[str, Field(min_length=1)]
    source: CompiledToolSource
    effect: Effect
    idempotency_key: tuple[str, ...] = ()
    secrets: tuple[SecretBinding, ...] = ()
    wait: CompiledJobWait | None = None
    input_fields: tuple[FieldIr, ...] = ()
    output_fields: tuple[FieldIr, ...] = ()
    input_schema: JsonSchema | None = None
    output_schema: JsonSchema | None = None
    dynamic_outputs: tuple[DynamicOutput, ...] = ()


class CompiledMcpServer(IrModel):
    server_id: McpServerId
    description: Annotated[str, Field(min_length=1)]
    transport: Literal["streamable_http"] = "streamable_http"
    url: Annotated[str, Field(min_length=1)]
    headers: tuple[SecretHeader, ...] = ()
    schema_hash: str | None = None


def judges_of(inference: CompiledInference) -> tuple[JudgeEvaluator, ...]:
    return tuple(check.evaluator for check in inference.checks if isinstance(check.evaluator, JudgeEvaluator))


def tool_server_ids(tool: CompiledTool) -> tuple[McpServerId, ...]:
    match tool.source:
        case McpToolSource():
            return (tool.source.server,)
        case CodeToolSource():
            return ()
        case _:
            assert_never(tool.source)
