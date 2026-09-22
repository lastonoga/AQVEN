import asyncio
from dataclasses import dataclass, field
from typing import Final

from aqven.ports.execution import ExecutionScope, NodeExecutor, NodeOutcome

MINIMUM_WORKERS: Final = 1


@dataclass(slots=True)
class WorkerPool:
    workers: int
    slots: asyncio.Semaphore = field(init=False)

    def __post_init__(self) -> None:
        if self.workers < MINIMUM_WORKERS:
            raise ValueError(f"max_parallel must be at least {MINIMUM_WORKERS}, got {self.workers}")
        self.slots = asyncio.Semaphore(self.workers)


@dataclass(frozen=True, slots=True)
class ThrottledExecutor[N]:
    inner: NodeExecutor[N]
    pool: WorkerPool

    async def execute(self, node: N, scope: ExecutionScope) -> NodeOutcome:
        async with self.pool.slots:
            return await self.inner.execute(node, scope)
