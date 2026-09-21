from collections.abc import Sequence
from typing import Annotated, Final

from pydantic import Field, JsonValue

from aqven.runtime.address import ExecutionAddress, RequestModel

OVERRIDE_CODE: Final = "NODE_OUTPUT_OVERRIDE"


class NodeOutputError(RequestModel):
    code: Annotated[str, Field(min_length=1)] = OVERRIDE_CODE
    message: Annotated[str, Field(min_length=1)]


class NodeOutputOverride(RequestModel):
    node_id: Annotated[str, Field(min_length=1)]
    branch_key: str | None = None
    iteration: Annotated[int, Field(ge=0)] | None = None
    item_index: Annotated[int, Field(ge=0)] | None = None
    output: JsonValue = None
    error: NodeOutputError | None = None

    def matches(self, address: ExecutionAddress) -> bool:
        return (
            self.node_id == address.node_id
            and _wanted(self.branch_key, address.branch_key)
            and _wanted(self.iteration, address.iteration)
            and _wanted(self.item_index, address.item_index)
        )


def node_output(
    node_id: str,
    output: JsonValue,
    *,
    branch_key: str | None = None,
    iteration: int | None = None,
    item_index: int | None = None,
) -> NodeOutputOverride:
    return NodeOutputOverride(
        node_id=node_id, branch_key=branch_key, iteration=iteration, item_index=item_index, output=output
    )


def node_failure(
    node_id: str,
    message: str,
    *,
    code: str = OVERRIDE_CODE,
    branch_key: str | None = None,
    iteration: int | None = None,
    item_index: int | None = None,
) -> NodeOutputOverride:
    return NodeOutputOverride(
        node_id=node_id,
        branch_key=branch_key,
        iteration=iteration,
        item_index=item_index,
        error=NodeOutputError(code=code, message=message),
    )


def override_for(overrides: Sequence[NodeOutputOverride], address: ExecutionAddress) -> NodeOutputOverride | None:
    return next((item for item in overrides if item.matches(address)), None)


def _wanted[T: (str, int)](wanted: T | None, actual: T | None) -> bool:
    return wanted is None or wanted == actual
