from dataclasses import dataclass, field
from typing import Final, assert_never

from pydantic import JsonValue

from aqven.engine.control.binding import bind_outputs
from aqven.engine.control.children import ChildLaunch, ChildSupervisor, ChildTicket, SupervisorFactory
from aqven.engine.control.events import progress
from aqven.engine.control.outcomes import UsageTally, failure, outcome_error, policy_failure
from aqven.engine.policies import ItemErrorRule, PolicyError, PolicyFactory
from aqven.ir import CompiledMapNode
from aqven.policies import Default, Fail, ItemDecision, Skip
from aqven.ports.execution import (
    ChildEntry,
    ExecutionScope,
    NodeCancelled,
    NodeFailed,
    NodeOutcome,
    NodeSkipped,
    NodeSucceeded,
    ScopeFrame,
)
from aqven.spec import MapItemError

ERROR_CODE_LIMIT: Final = 64
ERROR_MESSAGE_LIMIT: Final = 400


@dataclass(frozen=True, slots=True)
class MapExecutor:
    policies: PolicyFactory
    supervisors: SupervisorFactory

    async def execute(self, node: CompiledMapNode, scope: ExecutionScope) -> NodeOutcome:
        over = scope.resolve(node.over)
        if not isinstance(over, list):
            message = f"over {node.over} must be a list, got {type(over).__name__}"
            return failure(scope, "E_MAP_OVER_NOT_LIST", message, UsageTally())
        try:
            rule = self.policies.item_error(node.on_item_error)
        except PolicyError as error:
            return policy_failure(scope, error, UsageTally())
        return await MapRun(node, scope, rule, self.supervisors(scope), over).execute()


@dataclass(slots=True)
class MapRun:
    node: CompiledMapNode
    scope: ExecutionScope
    rule: ItemErrorRule
    supervisor: ChildSupervisor
    items: list[JsonValue]
    active: list[ChildTicket] = field(default_factory=list[ChildTicket])
    values: dict[int, JsonValue] = field(default_factory=dict[int, JsonValue])
    failed: dict[int, MapItemError] = field(default_factory=dict[int, MapItemError])
    usage: UsageTally = field(default_factory=UsageTally)
    started: int = 0
    done: int = 0

    @property
    def limit(self) -> int:
        return max(self.node.concurrency or len(self.items), 1)

    async def execute(self) -> NodeOutcome:
        await self._progress()
        try:
            return await self._drain()
        except PolicyError as error:
            return policy_failure(self.scope, error, self.usage)
        finally:
            await self.supervisor.cancel(self.active)

    async def _drain(self) -> NodeOutcome:
        while self.started < len(self.items) or self.active:
            await self._fill()
            ticket = await self.supervisor.first_finished(self.active)
            self.active.remove(ticket)
            outcome = await self.supervisor.outcome(ticket)
            self.usage.add(outcome)
            stopped = self._settle(_index(ticket), outcome)
            if stopped is not None:
                return stopped
            self.done += 1
            await self._progress()
        return self._finish()

    async def _fill(self) -> None:
        while self.started < len(self.items) and len(self.active) < self.limit:
            index = self.started
            frame = self.scope.frame.model_copy(update={"item": self.items[index], "index": index})
            launch = ChildLaunch(self.node.body, ChildEntry(item_index=index, frame=frame))
            self.active.append(await self.supervisor.start(launch))
            self.started += 1

    def _settle(self, index: int, outcome: NodeOutcome) -> NodeOutcome | None:
        match outcome:
            case NodeSucceeded():
                self.values[index] = outcome.output
                return None
            case NodeFailed() | NodeSkipped() | NodeCancelled():
                code, message = outcome_error(outcome)
                return self._apply(index, code, message)
            case _:
                assert_never(outcome)

    def _apply(self, index: int, code: str, message: str) -> NodeOutcome | None:
        error = MapItemError(index=index, code=code[:ERROR_CODE_LIMIT], message=message[:ERROR_MESSAGE_LIMIT])
        decision: ItemDecision[JsonValue] = self.rule.decide(self.items[index], error)
        match decision:
            case Skip():
                self.failed[index] = error
                return None
            case Default():
                self.failed[index] = error
                self.values[index] = decision.value
                return None
            case Fail():
                return failure(self.scope, "E_MAP_ITEM_FAILED", f"item {index}: {decision.reason}", self.usage)
            case _:
                assert_never(decision)

    def _finish(self) -> NodeOutcome:
        ok = tuple(self.values[index] for index in sorted(self.values))
        failed = tuple(self.failed[index].model_dump(mode="json") for index in sorted(self.failed))
        output = bind_outputs(self.scope, self.node.outputs, ScopeFrame(ok=ok, failed=failed))
        return NodeSucceeded(output=output, usage=self.usage.total)

    async def _progress(self) -> None:
        await self.scope.events.emit(progress(self.scope.address, self.done, len(self.items)))


def _index(ticket: ChildTicket) -> int:
    return ticket.launch.entry.item_index or 0
