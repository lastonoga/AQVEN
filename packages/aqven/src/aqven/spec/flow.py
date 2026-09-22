from typing import Annotated, Literal

from pydantic import Field

from aqven.spec.common import Limits, SpecModel
from aqven.spec.fields import FieldBinding
from aqven.spec.names import NodeId, RunContextKey


class FamiliesDistinct(SpecModel):
    rule: Literal["families_distinct"]
    nodes: list[NodeId] = Field(min_length=1)
    min: int = Field(ge=1)


class FamilyDisjointFromInput(SpecModel):
    rule: Literal["family_disjoint_from_input"]
    nodes: list[NodeId] = Field(min_length=1)
    input: str


class FieldBefore(SpecModel):
    rule: Literal["field_before"]
    nodes: list[NodeId] = Field(min_length=1)
    first: str
    second: str


type ContractPredicate = Annotated[
    FamiliesDistinct | FamilyDisjointFromInput | FieldBefore,
    Field(discriminator="rule"),
]


class FlowSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Flow"]
    description: str = Field(min_length=1)
    input: str
    output: str
    returns: list[FieldBinding]
    context: list[RunContextKey] | None = None
    limits: Limits | None = None
    order: list[NodeId] = Field(min_length=1)
    requires: list[ContractPredicate] | None = None
