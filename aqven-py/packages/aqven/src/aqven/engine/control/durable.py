from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from typing import Final

from dbos import DBOS, WorkflowHandleAsync
from dbos import error as dbos_errors
from pydantic import JsonValue, TypeAdapter

from aqven.engine.control.children import ChildLaunch, ChildSupervisor, ChildTicket, SupervisorFactory
from aqven.ports.execution import ExecutionScope, NodeCancelled, NodeOutcome

CHILD_POLLING_INTERVAL_SEC: Final = 0.05
NODE_OUTCOME_ADAPTER: Final[TypeAdapter[NodeOutcome]] = TypeAdapter(NodeOutcome)

type ChildHandle = WorkflowHandleAsync[JsonValue]
type ChildWorkflowStarter = Callable[[ChildLaunch], Awaitable[ChildHandle]]
type ScopedChildWorkflowStarter = Callable[[ExecutionScope, ChildLaunch], Awaitable[ChildHandle]]


def outcome_json(outcome: NodeOutcome) -> JsonValue:
    return NODE_OUTCOME_ADAPTER.dump_python(outcome, mode="json")


@dataclass(slots=True)
class DbosChildSupervisor:
    starter: ChildWorkflowStarter
    polling_interval_sec: float = CHILD_POLLING_INTERVAL_SEC
    handles: dict[int, ChildHandle] = field(default_factory=dict[int, ChildHandle])

    async def start(self, launch: ChildLaunch) -> ChildTicket:
        ticket = ChildTicket(len(self.handles), launch)
        self.handles[ticket.ordinal] = await self.starter(launch)
        return ticket

    async def first_finished(self, tickets: Sequence[ChildTicket]) -> ChildTicket:
        by_workflow = {self.handles[ticket.ordinal].workflow_id: ticket for ticket in tickets}
        waiting = [self.handles[ticket.ordinal] for ticket in tickets]
        finished = await DBOS.wait_first_async(waiting, polling_interval_sec=self.polling_interval_sec)
        return by_workflow[finished.workflow_id]

    async def outcome(self, ticket: ChildTicket) -> NodeOutcome:
        handle = self.handles[ticket.ordinal]
        try:
            result = await handle.get_result(polling_interval_sec=self.polling_interval_sec)
        except dbos_errors.DBOSAwaitedWorkflowCancelledError:
            return NodeCancelled(reason=f"child workflow {handle.workflow_id} was cancelled")
        return NODE_OUTCOME_ADAPTER.validate_python(result)

    async def cancel(self, tickets: Sequence[ChildTicket]) -> None:
        workflow_ids = [self.handles[ticket.ordinal].workflow_id for ticket in tickets]
        if not workflow_ids:
            return
        await DBOS.cancel_workflows_async(workflow_ids, cancel_children=True)


def durable_supervisors(
    start: ScopedChildWorkflowStarter, *, polling_interval_sec: float = CHILD_POLLING_INTERVAL_SEC
) -> SupervisorFactory:
    def supervisor(scope: ExecutionScope) -> ChildSupervisor:
        async def starter(launch: ChildLaunch) -> ChildHandle:
            return await start(scope, launch)

        return DbosChildSupervisor(starter, polling_interval_sec)

    return supervisor
