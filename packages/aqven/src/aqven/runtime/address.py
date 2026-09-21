from typing import Annotated, NewType

from pydantic import BaseModel, ConfigDict, Field, JsonValue

RunId = NewType("RunId", str)
ClientOpId = NewType("ClientOpId", str)

REQUEST_CONFIG = ConfigDict(
    extra="forbid",
    frozen=True,
    validate_by_alias=True,
    validate_by_name=True,
    serialize_by_alias=True,
)
RESOURCE_CONFIG = ConfigDict(
    extra="ignore",
    frozen=True,
    validate_by_alias=True,
    validate_by_name=True,
    serialize_by_alias=True,
)


class RequestModel(BaseModel):
    model_config = REQUEST_CONFIG


class ResourceModel(BaseModel):
    model_config = RESOURCE_CONFIG


class ExecutionAddress(RequestModel):
    node_id: str
    branch_key: str | None
    iteration: Annotated[int, Field(ge=0)] | None
    item_index: Annotated[int, Field(ge=0)] | None


def node_address(
    node_id: str,
    *,
    branch_key: str | None = None,
    iteration: int | None = None,
    item_index: int | None = None,
) -> ExecutionAddress:
    return ExecutionAddress(node_id=node_id, branch_key=branch_key, iteration=iteration, item_index=item_index)


class Problem(ResourceModel):
    path: tuple[str | int, ...]
    code: str
    message: str


type JsonObject = dict[str, JsonValue]
