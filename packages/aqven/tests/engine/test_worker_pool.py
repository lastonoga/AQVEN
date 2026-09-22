import asyncio
from dataclasses import dataclass, field, replace
from typing import cast

import pytest

from aqven.engine.registry import throttled_executors
from aqven.engine.throttle import WorkerPool
from aqven.ports.execution import ExecutionScope, NodeExecutor, NodeExecutors, NodeOutcome, NodeSucceeded

CONTROL_KINDS = ("parallel", "map", "switch", "loop", "call")
LEAF_KINDS = ("llm", "code", "tool")


@dataclass(slots=True)
class Recorder:
    label: str
    log: list[str]
    gate: asyncio.Event | None = None

    async def execute(self, node: object, scope: ExecutionScope) -> NodeOutcome:
        self.log.append(f"start:{self.label}")
        if self.gate is not None:
            await self.gate.wait()
        self.log.append(f"stop:{self.label}")
        return NodeSucceeded(output=None)


@dataclass(slots=True)
class Fakes:
    log: list[str] = field(default_factory=list[str])

    def executor(self, label: str, gate: asyncio.Event | None = None) -> Recorder:
        return Recorder(label, self.log, gate)

    def executors(self, **named: Recorder) -> NodeExecutors:
        made = {kind: named.get(kind) or self.executor(kind) for kind in NodeExecutors.__dataclass_fields__}
        return NodeExecutors(**made)


def nowhere() -> ExecutionScope:
    return cast(ExecutionScope, None)


async def run[N](executor: NodeExecutor[N]) -> NodeOutcome:
    return await executor.execute(cast(N, None), nowhere())


def test_without_a_pool_the_executors_are_left_alone() -> None:
    executors = Fakes().executors()

    assert throttled_executors(executors, None) is executors


def test_control_nodes_and_waiting_for_a_person_are_left_unwrapped() -> None:
    executors = Fakes().executors()

    throttled = throttled_executors(executors, WorkerPool(2))

    assert all(getattr(throttled, kind) is not getattr(executors, kind) for kind in LEAF_KINDS)
    assert all(getattr(throttled, kind) is getattr(executors, kind) for kind in CONTROL_KINDS)
    assert throttled.human is executors.human
    assert throttled.narrow is executors.narrow


@pytest.mark.asyncio
async def test_a_third_leaf_waits_until_a_slot_frees() -> None:
    fakes = Fakes()
    gate = asyncio.Event()
    executors = fakes.executors(llm=fakes.executor("first", gate), code=fakes.executor("second", gate))
    throttled = throttled_executors(executors, WorkerPool(2))

    busy = [asyncio.create_task(run(throttled.llm)), asyncio.create_task(run(throttled.code))]
    await asyncio.sleep(0)
    third = asyncio.create_task(run(throttled.tool))
    await asyncio.sleep(0)
    blocked = "start:tool" not in fakes.log
    gate.set()
    await asyncio.gather(*busy, third)

    assert blocked
    assert "stop:tool" in fakes.log


@pytest.mark.asyncio
async def test_a_node_waiting_for_a_person_never_holds_a_worker() -> None:
    fakes = Fakes()
    forever = asyncio.Event()
    executors = fakes.executors(human=fakes.executor("human", forever))
    throttled = throttled_executors(executors, WorkerPool(1))

    waiting = asyncio.create_task(run(throttled.human))
    await asyncio.sleep(0)
    await run(throttled.code)
    forever.set()
    await waiting

    assert "stop:code" in fakes.log


@pytest.mark.asyncio
async def test_a_leaf_that_fails_gives_its_slot_back() -> None:
    class Failing:
        async def execute(self, node: object, scope: ExecutionScope) -> NodeOutcome:
            raise RuntimeError("node blew up")

    fakes = Fakes()
    executors = fakes.executors()
    throttled = throttled_executors(replace(executors, llm=Failing()), WorkerPool(1))

    with pytest.raises(RuntimeError):
        await run(throttled.llm)
    await run(throttled.code)

    assert "stop:code" in fakes.log
