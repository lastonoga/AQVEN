from typing import Literal

from pydantic import Field

from aqven.spec.common import SpecModel
from aqven.spec.names import SecretRef


class SecretHeader(SpecModel):
    name: str = Field(min_length=1)
    value: SecretRef


class McpServerSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["McpServer"]
    description: str = Field(min_length=1)
    transport: Literal["streamable_http"]
    url: str = Field(min_length=1)
    headers: list[SecretHeader] | None = None
    schema_hash: str | None = None
