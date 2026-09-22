from dataclasses import dataclass

from aqven.ir import CompiledCallNode
from aqven.ports.execution import ExecutionScope, NodeOutcome


@dataclass(frozen=True, slots=True)
class CallExecutor:
    async def execute(self, node: CompiledCallNode, scope: ExecutionScope) -> NodeOutcome:
        return await scope.run_flow(node.flow, scope.bind(node.inputs))
