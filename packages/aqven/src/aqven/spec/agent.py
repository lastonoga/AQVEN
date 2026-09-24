from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, JsonValue

from aqven.spec.common import Limits, SpecModel
from aqven.spec.names import (
    INSTRUCTIONS_PATTERN,
    MODEL_PATTERN,
    AgentId,
    InferenceId,
    McpServerId,
    ModelString,
    OutcomePolicy,
    ToolId,
)

type ModelField = Annotated[ModelString, Field(pattern=MODEL_PATTERN)]


class ModelSettingsSpec(SpecModel):
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, gt=0, le=1)
    max_tokens: int | None = Field(default=None, ge=1)
    seed: int | None = Field(default=None, ge=0)
    provider_options: dict[str, JsonValue] | None = None


type StructuredMode = Literal["tool", "native", "prompted"]
type OutputModeSource = Literal["declared", "profile", "known_model", "fallback_models"]


class OutputModeSetting(StrEnum):
    AUTO = "auto"
    TOOL = "tool"
    NATIVE = "native"
    PROMPTED = "prompted"


class AgentOutputSpec(SpecModel):
    mode: OutputModeSetting = OutputModeSetting.AUTO
    strict: bool = True
    retries: int = Field(default=1, ge=0, le=5)
    on_error: OutcomePolicy = OutcomePolicy.RETRY
    on_refusal: OutcomePolicy = OutcomePolicy.FAIL
    on_truncated: OutcomePolicy = OutcomePolicy.FAIL


class SubagentSpec(SpecModel):
    name: str
    description: str = Field(min_length=1)
    agent: AgentId
    inference: InferenceId


class FailOnTimeout(SpecModel):
    policy: Literal["fail"]


class DefaultOnTimeout(SpecModel):
    policy: Literal["default"]
    value: JsonValue


class EscalateOnTimeout(SpecModel):
    policy: Literal["escalate"]
    assignee: str = Field(min_length=1)
    timeout_seconds: int = Field(ge=1)


type TimeoutPolicy = Annotated[FailOnTimeout | DefaultOnTimeout | EscalateOnTimeout, Field(discriminator="policy")]


class ToolApprovalSpec(SpecModel):
    tools: list[ToolId] = Field(min_length=1)
    assignee: str = Field(min_length=1)
    timeout_seconds: int = Field(ge=1)
    on_timeout: TimeoutPolicy


class AgentSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Agent"]
    description: str = Field(min_length=1)
    model: ModelField
    fallback_models: list[ModelField] | None = None
    settings: ModelSettingsSpec | None = None
    output: AgentOutputSpec = Field(default_factory=AgentOutputSpec)
    instructions: str | None = Field(default=None, pattern=INSTRUCTIONS_PATTERN)
    tools: list[ToolId] | None = None
    mcp_servers: list[McpServerId] | None = None
    subagents: list[SubagentSpec] | None = None
    approval: ToolApprovalSpec | None = None
    limits: Limits | None = None
