from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.failures import run_error
from aqven.engine.loading import CodeLoader
from aqven.ir import CompiledNarrowNode
from aqven.ports.execution import ExecutionScope, NodeFailed, NodeOutcome, NodeSucceeded

NARROW_MISMATCH: Final = "NARROW_MISMATCH"
DYNAMIC_KEYS: Final = frozenset({"value", "fields", "schema_hash"})


def dynamic_payload(value: JsonValue) -> JsonValue:
    if not isinstance(value, dict) or frozenset(value) != DYNAMIC_KEYS:
        return value
    return value["value"]


@dataclass(frozen=True, slots=True)
class NarrowExecutor:
    loader: CodeLoader

    async def execute(self, node: CompiledNarrowNode, scope: ExecutionScope) -> NodeOutcome:
        value = dynamic_payload(scope.resolve(node.source))
        adapter: TypeAdapter[object] = TypeAdapter(self.loader.type_annotation(scope.project.package, node.to))
        try:
            narrowed = adapter.validate_python(value)
        except ValidationError as error:
            message = f"value {node.source} does not narrow to {node.to}: {error}"
            return NodeFailed(error=run_error(NARROW_MISMATCH, message, scope.address))
        output: JsonValue = adapter.dump_python(narrowed, mode="json", by_alias=True)
        return NodeSucceeded(output=output)
