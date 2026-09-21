import asyncio
from dataclasses import dataclass
from functools import partial

from aqven.engine.loading import CodeLoader, json_result, typed_arguments
from aqven.ir import CompiledCodeNode
from aqven.ports.execution import ExecutionScope, NodeOutcome, NodeSucceeded


@dataclass(frozen=True, slots=True)
class CodeExecutor:
    loader: CodeLoader

    async def execute(self, node: CompiledCodeNode, scope: ExecutionScope) -> NodeOutcome:
        inputs = scope.bind(node.inputs)
        function = self.loader.function(node.run)
        arguments = typed_arguments(function, node.run, inputs, skip=0)
        result = await asyncio.to_thread(partial(function, **arguments))
        return NodeSucceeded(output=json_result(function, node.run, result))
