from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Final

from dbos import DBOS

from aqven.engine.control.children import ChildLaunch, ChildSupervisor, ChildTicket, in_process_supervisor
from aqven.engine.interpreter import NodeScope, StartedBranch
from aqven.ports.execution import ExecutionScope, NodeOutcome

BRANCH_POLLING_INTERVAL_SEC: Final = 0.05
ORDERED_JOIN_MODES: Final = frozenset({"replay"})


@dataclass(slots=True)
class BranchSupervisor:
    scope: NodeScope
    polling_interval_sec: float = BRANCH_POLLING_INTERVAL_SEC
    started: dict[int, StartedBranch] = field(default_factory=dict[int, StartedBranch])

    async def start(self, launch: ChildLaunch) -> ChildTicket:
        ticket = ChildTicket(len(self.started), launch)
        self.started[ticket.ordinal] = await self.scope.start_child(launch.node_id, launch.entry, launch.inputs)
        return ticket

    async def first_finished(self, tickets: Sequence[ChildTicket]) -> ChildTicket:
        if self.scope.mode in ORDERED_JOIN_MODES:
            return min(tickets, key=ticket_ordinal)
        by_workflow = {self.started[ticket.ordinal].workflow_id: ticket for ticket in tickets}
        handles = [self.started[ticket.ordinal].handle for ticket in tickets]
        finished = await DBOS.wait_first_async(handles, polling_interval_sec=self.polling_interval_sec)
        return by_workflow[finished.workflow_id]

    async def outcome(self, ticket: ChildTicket) -> NodeOutcome:
        return await self.scope.collect_child(self.started[ticket.ordinal])

    async def cancel(self, tickets: Sequence[ChildTicket]) -> None:
        workflow_ids = [self.started[ticket.ordinal].workflow_id for ticket in tickets]
        if not workflow_ids:
            return
        await DBOS.cancel_workflows_async(workflow_ids, cancel_children=True)


def ticket_ordinal(ticket: ChildTicket) -> int:
    return ticket.ordinal


def branch_supervisor(scope: ExecutionScope) -> ChildSupervisor:
    if isinstance(scope, NodeScope) and scope.launches_branches:
        return BranchSupervisor(scope)
    return in_process_supervisor(scope)
