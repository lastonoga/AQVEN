from dataclasses import dataclass
from typing import Final

from aqven.ir.hashing import canonical_json
from aqven.ports.execution import ChildEntry
from aqven.runtime.address import ExecutionAddress
from aqven.spec import NodeId

CHILD_WORKFLOW_SEPARATOR: Final = "::"
NODE_ID_SEPARATOR: Final = "__"


def address_key(address: ExecutionAddress) -> str:
    return canonical_json(address.model_dump(mode="json")).decode()


def child_workflow_id(parent_workflow_id: str, address: ExecutionAddress) -> str:
    return f"{parent_workflow_id}{CHILD_WORKFLOW_SEPARATOR}{address_key(address)}"


def prefixed_node_id(prefix: str, node_id: str) -> NodeId:
    return NodeId(f"{prefix}{node_id}")


def call_prefix(address: ExecutionAddress) -> str:
    return f"{address.node_id}{NODE_ID_SEPARATOR}"


@dataclass(frozen=True, slots=True)
class AddressContext:
    branch_key: str | None = None
    iteration: int | None = None
    item_index: int | None = None

    def at(self, node_id: str) -> ExecutionAddress:
        return ExecutionAddress(
            node_id=node_id,
            branch_key=self.branch_key,
            iteration=self.iteration,
            item_index=self.item_index,
        )

    def enter(self, entry: ChildEntry) -> AddressContext:
        return AddressContext(
            branch_key=_override(self.branch_key, entry.branch_key),
            iteration=_override(self.iteration, entry.iteration),
            item_index=_override(self.item_index, entry.item_index),
        )


ROOT_CONTEXT: Final = AddressContext()


def context_of(address: ExecutionAddress) -> AddressContext:
    return AddressContext(branch_key=address.branch_key, iteration=address.iteration, item_index=address.item_index)


def _override[T](current: T | None, entered: T | None) -> T | None:
    return current if entered is None else entered
