from dataclasses import dataclass, field
from typing import assert_never

from pydantic import JsonValue

from aqven.engine.control.binding import bind_outputs
from aqven.engine.control.children import ChildLaunch, ChildSupervisor, ChildTicket, SupervisorFactory
from aqven.engine.control.outcomes import UsageTally, failure, outcome_error, policy_failure
from aqven.engine.policies import JoinRule, PolicyError, PolicyFactory
from aqven.ir import CompiledParallelNode
from aqven.policies import BranchResult, Done, Fail, JoinDecision, JoinState, Wait
from aqven.ports.execution import (
    ChildEntry,
    ExecutionScope,
    NodeOutcome,
    NodeSucceeded,
    ScopeFrame,
)


@dataclass(frozen=True, slots=True)
class ParallelExecutor:
    policies: PolicyFactory
    supervisors: SupervisorFactory

    async def execute(self, node: CompiledParallelNode, scope: ExecutionScope) -> NodeOutcome:
        try:
            rule = self.policies.join(node.join)
        except PolicyError as error:
            return policy_failure(scope, error, UsageTally())
        return await ParallelRun(node, scope, rule, self.supervisors(scope)).execute()


@dataclass(slots=True)
class ParallelRun:
    node: CompiledParallelNode
    scope: ExecutionScope
    rule: JoinRule
    supervisor: ChildSupervisor
    pending: list[ChildTicket] = field(default_factory=list[ChildTicket])
    completed: list[BranchResult[JsonValue]] = field(default_factory=list[BranchResult[JsonValue]])
    outputs: dict[str, JsonValue] = field(default_factory=dict[str, JsonValue])
    usage: UsageTally = field(default_factory=UsageTally)

    async def execute(self) -> NodeOutcome:
        try:
            await self._start()
            return await self._join()
        except PolicyError as error:
            return policy_failure(self.scope, error, self.usage)
        finally:
            await self.supervisor.cancel(self.pending)

    async def _start(self) -> None:
        for key, node_id in self.node.branches.items():
            launch = ChildLaunch(node_id, ChildEntry(branch_key=key, frame=self.scope.frame))
            self.pending.append(await self.supervisor.start(launch))

    async def _join(self) -> NodeOutcome:
        while self.pending:
            ticket = await self.supervisor.first_finished(self.pending)
            self.pending.remove(ticket)
            outcome = await self.supervisor.outcome(ticket)
            self.usage.add(outcome)
            self.completed.append(self._branch_result(_key(ticket), outcome))
            decided = self._decided(self.rule.decide(JoinState(tuple(self.completed), self._pending_keys())))
            if decided is not None:
                return decided
        message = f"join policy {self.rule.label} made no decision after all branches finished"
        return failure(self.scope, "E_JOIN_UNDECIDED", message, self.usage)

    def _branch_result(self, key: str, outcome: NodeOutcome) -> BranchResult[JsonValue]:
        if isinstance(outcome, NodeSucceeded):
            self.outputs[key] = outcome.output
            return BranchResult(key, outcome.output)
        code, message = outcome_error(outcome)
        return BranchResult[JsonValue](key, None, f"{code}: {message}")

    def _decided(self, decision: JoinDecision[JsonValue]) -> NodeOutcome | None:
        match decision:
            case Wait():
                return None
            case Done():
                frame = ScopeFrame(ok=decision.value, branch=dict(self.outputs))
                output = bind_outputs(self.scope, self.node.outputs, frame)
                return NodeSucceeded(output=output, usage=self.usage.total)
            case Fail():
                return failure(self.scope, "E_JOIN_FAILED", decision.reason, self.usage)
            case _:
                assert_never(decision)

    def _pending_keys(self) -> tuple[str, ...]:
        return tuple(_key(ticket) for ticket in self.pending)


def _key(ticket: ChildTicket) -> str:
    return ticket.launch.entry.branch_key or ""
