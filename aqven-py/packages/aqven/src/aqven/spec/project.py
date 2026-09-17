from datetime import datetime
from typing import Literal

from pydantic import Field

from aqven.spec.common import Limits, SpecModel
from aqven.spec.names import PiiDetector, ProviderName, Retention, SecretRef, TrustLevel

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


class ProviderSpec(SpecModel):
    id: ProviderName
    api_key: SecretRef
    base_url: str | None = None
    data_policy: DataPolicy
    routing: OpenRouterRouting | None = None


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
