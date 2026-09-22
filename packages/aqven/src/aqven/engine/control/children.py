import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Protocol

from aqven.engine.control.outcomes import control_error
from aqven.ports.execution import ChildEntry, ExecutionScope, InputOverlayScope, NodeFailed, NodeOutcome
from aqven.runtime.address import JsonObject
from aqven.spec import NodeId


@dataclass(frozen=True, slots=True)
class ChildLaunch:
    node_id: NodeId
    entry: ChildEntry
    inputs: JsonObject | None = None


@dataclass(frozen=True, slots=True)
class ChildTicket:
    ordinal: int
    launch: ChildLaunch


class ChildSupervisor(Protocol):
    async def start(self, launch: ChildLaunch) -> ChildTicket: ...

    async def first_finished(self, tickets: Sequence[ChildTicket]) -> ChildTicket: ...

    async def outcome(self, ticket: ChildTicket) -> NodeOutcome: ...

    async def cancel(self, tickets: Sequence[ChildTicket]) -> None: ...


type SupervisorFactory = Callable[[ExecutionScope], ChildSupervisor]


async def run_launch(scope: ExecutionScope, launch: ChildLaunch) -> NodeOutcome:
    if launch.inputs is None:
        return await scope.run_child(launch.node_id, launch.entry)
    if isinstance(scope, InputOverlayScope):
        return await scope.run_child_with_inputs(launch.node_id, launch.entry, launch.inputs)
    message = f"node {launch.node_id} needs init inputs, but the execution scope does not overlay inputs on bindings"
    return NodeFailed(error=control_error(scope, "E_INPUT_OVERLAY_UNSUPPORTED", message))


@dataclass(slots=True)
class InProcessSupervisor:
    scope: ExecutionScope
    tasks: dict[int, asyncio.Task[NodeOutcome]] = field(default_factory=dict[int, asyncio.Task[NodeOutcome]])

    async def start(self, launch: ChildLaunch) -> ChildTicket:
        ticket = ChildTicket(len(self.tasks), launch)
        self.tasks[ticket.ordinal] = asyncio.create_task(run_launch(self.scope, launch))
        return ticket

    async def first_finished(self, tickets: Sequence[ChildTicket]) -> ChildTicket:
        waiting = [self.tasks[ticket.ordinal] for ticket in tickets]
        if not any(task.done() for task in waiting):
            await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
        return min((ticket for ticket in tickets if self.tasks[ticket.ordinal].done()), key=_ordinal)

    async def outcome(self, ticket: ChildTicket) -> NodeOutcome:
        return await self.tasks[ticket.ordinal]

    async def cancel(self, tickets: Sequence[ChildTicket]) -> None:
        running = [self.tasks[ticket.ordinal] for ticket in tickets]
        if not running:
            return
        for task in running:
            task.cancel()
        await asyncio.wait(running)
        for task in running:
            _retrieve(task)


def in_process_supervisor(scope: ExecutionScope) -> ChildSupervisor:
    return InProcessSupervisor(scope)


def _ordinal(ticket: ChildTicket) -> int:
    return ticket.ordinal


def _retrieve(task: asyncio.Task[NodeOutcome]) -> None:
    if task.cancelled():
        return
    task.exception()
