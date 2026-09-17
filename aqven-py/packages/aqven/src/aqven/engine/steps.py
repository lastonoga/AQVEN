from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from dbos import DBOS

from aqven.engine.failures import failure_of
from aqven.engine.protocol import EXECUTE_NODE_STEP, NODE_BOUNDARY_STEP
from aqven.engine.request import NODE_OUTCOME_ADAPTER
from aqven.ports.execution import ExecutionScope, NodeExecutor, NodeOutcome
from aqven.runtime.address import JsonObject

type NodeWork = Callable[[], Awaitable[NodeOutcome]]


@DBOS.step(name=NODE_BOUNDARY_STEP)
async def node_boundary(address: JsonObject, attempt: int) -> JsonObject:
    return {"address": address, "attempt": attempt}


@DBOS.step(name=EXECUTE_NODE_STEP)
async def execute_isolated(work: NodeWork) -> JsonObject:
    outcome = await work()
    return outcome.model_dump(mode="json", by_alias=True)


@dataclass(frozen=True, slots=True)
class StepIsolated[N]:
    inner: NodeExecutor[N]

    async def execute(self, node: N, scope: ExecutionScope) -> NodeOutcome:
        async def work() -> NodeOutcome:
            outcome = await self._guarded(node, scope)
            await scope.output.flush()
            return outcome

        return NODE_OUTCOME_ADAPTER.validate_python(await execute_isolated(work))

    async def _guarded(self, node: N, scope: ExecutionScope) -> NodeOutcome:
        try:
            return await self.inner.execute(node, scope)
        except Exception as error:
            return failure_of(error, scope.address)
