from typing import Literal

from pydantic import Field, JsonValue

from aqven.spec.common import SpecModel
from aqven.spec.names import FlowId, NodeId


class DatasetCase(SpecModel):
    name: str = Field(min_length=1)
    inputs: JsonValue
    context: dict[str, JsonValue] | None = None
    node_outputs: dict[NodeId, JsonValue] | None = None
    metadata: dict[str, JsonValue] | None = None
    tags: dict[str, str] | None = None
    expected_output: JsonValue = None


class DatasetFile(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Dataset"]
    flow: FlowId | None = None
    cases: list[DatasetCase] = Field(min_length=1)
