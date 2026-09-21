from dataclasses import dataclass, field
from typing import assert_never

from pydantic import JsonValue

from aqven.engine.control.binding import bind_outputs
from aqven.engine.control.children import ChildLaunch, run_launch
from aqven.engine.control.events import iteration_finished, loop_exited
from aqven.engine.control.outcomes import BUDGET_ERROR_CODES, UsageTally, policy_failure
from aqven.engine.policies import PolicyError, PolicyFactory, SelectRule, StopRule
from aqven.ir import CompiledLoopNode
from aqven.loader import local_node_id
from aqven.policies import LoopState, Stop
from aqven.policies.paths import number
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
from aqven.runtime.address import JsonObject
from aqven.spec import LoopStopReason, NodeId

type Interruption = NodeFailed | NodeCancelled


@dataclass(frozen=True, slots=True)
class LoopExecutor:
    policies: PolicyFactory
    budget_codes: frozenset[str] = BUDGET_ERROR_CODES

    async def execute(self, node: CompiledLoopNode, scope: ExecutionScope) -> NodeOutcome:
        try:
            stops = tuple(self.policies.stop(policy) for policy in node.stop)
            select = self.policies.select(node.select)
        except PolicyError as error:
            return policy_failure(scope, error, UsageTally())
        return await LoopRun(node, scope, stops, select, self.budget_codes).execute()


@dataclass(slots=True)
class LoopRun:
    node: CompiledLoopNode
    scope: ExecutionScope
    stops: tuple[StopRule, ...]
    select: SelectRule
    budget_codes: frozenset[str]
    iterations: list[JsonObject] = field(default_factory=list[JsonObject])
    usage: UsageTally = field(default_factory=UsageTally)

    @property
    def state(self) -> LoopState:
        return LoopState(tuple(self.iterations))

    async def execute(self) -> NodeOutcome:
        try:
            return await self._iterate()
        except PolicyError as error:
            return policy_failure(self.scope, error, self.usage)

    async def _iterate(self) -> NodeOutcome:
        for iteration in range(self.node.max_iter):
            record = await self._body(iteration)
            if isinstance(record, NodeFailed | NodeCancelled):
                return await self._interrupted(record)
            self.iterations.append(record)
            stop = self._stop()
            await self._iteration_finished(iteration, _iteration_reason(stop, iteration, self.node.max_iter))
            if stop is not None:
                return await self._exit(LoopStopReason.POLICY)
        return await self._exit(LoopStopReason.MAX_ITER)

    async def _body(self, iteration: int) -> JsonObject | Interruption:
        record: JsonObject = {}
        frame = self.scope.frame.model_copy(update={"acc": self._acc()})
        for node_id in self.node.body:
            launch = ChildLaunch(node_id, ChildEntry(iteration=iteration, frame=frame), self._init(node_id, iteration))
            outcome = await run_launch(self.scope, launch)
            self.usage.add(outcome)
            value = _body_value(outcome)
            if isinstance(value, NodeFailed | NodeCancelled):
                return value
            record[local_node_id(node_id)] = value
        return record

    def _acc(self) -> JsonObject:
        if self.iterations:
            return self.iterations[-1]
        return {local_node_id(node_id): None for node_id in self.node.body}

    def _init(self, node_id: NodeId, iteration: int) -> JsonObject | None:
        if iteration > 0:
            return None
        bindings = self.node.init.get(node_id) or self.node.init.get(local_node_id(node_id))
        if not bindings:
            return None
        return self.scope.bind(bindings)

    def _stop(self) -> Stop | None:
        state = self.state
        for rule in self.stops:
            decision = rule.decide(state)
            if isinstance(decision, Stop):
                return decision
        return None

    async def _interrupted(self, outcome: Interruption) -> NodeOutcome:
        if isinstance(outcome, NodeCancelled):
            return outcome
        if outcome.error.code not in self.budget_codes or not self.iterations:
            return NodeFailed(error=outcome.error, usage=self.usage.total, attempt=outcome.attempt, model=outcome.model)
        return await self._exit(LoopStopReason.BUDGET)

    async def _iteration_finished(self, iteration: int, reason: LoopStopReason | None) -> None:
        address = self.scope.address.model_copy(update={"iteration": iteration})
        await self.scope.events.emit(iteration_finished(address, self._score(), reason))

    async def _exit(self, reason: LoopStopReason) -> NodeOutcome:
        selected = self.select.choose(self.state)
        await self.scope.events.emit(loop_exited(self.scope.address, reason, selected))
        loop: JsonObject = {"iterations": len(self.iterations), "stop_reason": reason.value}
        output = bind_outputs(self.scope, self.node.outputs, ScopeFrame(iter=self.iterations[selected], loop=loop))
        return NodeSucceeded(output=output, usage=self.usage.total)

    def _score(self) -> float | None:
        paths = [rule.path for rule in (self.select, *self.stops) if rule.path is not None]
        if not paths:
            return None
        return number(self.state.read(paths[0]))


def _body_value(outcome: NodeOutcome) -> JsonValue | Interruption:
    match outcome:
        case NodeSucceeded():
            return {"out": outcome.output}
        case NodeSkipped():
            return {"out": None}
        case NodeFailed() | NodeCancelled():
            return outcome
        case _:
            assert_never(outcome)


def _iteration_reason(stop: Stop | None, iteration: int, max_iter: int) -> LoopStopReason | None:
    if stop is not None:
        return LoopStopReason.POLICY
    if iteration + 1 >= max_iter:
        return LoopStopReason.MAX_ITER
    return None
