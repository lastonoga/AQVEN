from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, JsonValue

from aqven.spec.common import Limits, SpecModel
from aqven.spec.names import (
    PROVIDER_NAME_PATTERN,
    CodeRef,
    Modality,
    PiiDetector,
    ProviderName,
    Retention,
    SecretRef,
    TrustLevel,
)

type ProviderNameField = Annotated[ProviderName, Field(pattern=PROVIDER_NAME_PATTERN)]
type ProviderKind = Literal["catalog", "code", "openai_compatible"]

type RenameKind = Literal[
    "flow",
    "node",
    "type",
    "prompt",
    "dataset",
    "eval",
    "field",
    "inference",
    "agent",
    "tool",
    "mcp_server",
]


class PiiPolicy(SpecModel):
    mask_in_traces: bool
    redact: list[PiiDetector]


class TrustPolicy(SpecModel):
    default_in: TrustLevel


class ProjectPolicies(SpecModel):
    pii: PiiPolicy | None = None
    trust: TrustPolicy | None = None


class DataPolicy(SpecModel):
    allows_pii: bool
    allows_sensitive: bool
    retention: Retention


class OpenRouterRouting(SpecModel):
    data_collection: Literal["allow", "deny"]
    zdr: bool


class ProviderCapabilitiesSpec(SpecModel):
    input: list[Modality] | None = None
    output: list[Modality] | None = None
    tools: bool | None = None
    json_schema_output: bool | None = None


class ProviderLimits(SpecModel):
    rpm: int | None = Field(default=None, ge=1)


class ProviderSpec(SpecModel):
    id: ProviderNameField
    kind: ProviderKind = "catalog"
    api_key: SecretRef | None = None
    run: CodeRef | None = None
    params: dict[str, JsonValue] | None = None
    capabilities: ProviderCapabilitiesSpec | None = None
    base_url: str | None = None
    data_policy: DataPolicy
    routing: OpenRouterRouting | None = None
    limits: ProviderLimits | None = None


class Rename(SpecModel):
    kind: RenameKind
    from_: str = Field(alias="from")
    to: str
    at: datetime


class ProjectSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Project"]
    description: str = Field(min_length=1)
    package: str
    providers: list[ProviderSpec] = Field(min_length=1)
    policies: ProjectPolicies | None = None
    limits: Limits | None = None
    renames: list[Rename] | None = None
