from dataclasses import dataclass
from typing import assert_never

from aqven.engine.human.forms import FormModel, FormRegistry
from aqven.engine.human.journal import WaitJournal
from aqven.engine.human.outcomes import (
    HumanAnswered,
    HumanDefaulted,
    HumanDefaultRejected,
    HumanExpired,
    WaitOutcome,
    expiry_plan,
    wait_error,
)
from aqven.engine.human.scripted import RUN_SPEC_ANSWERS, ScriptedAnswerSource, wait_run_id
from aqven.engine.human.waiter import HumanWaiter, WaitRequest
from aqven.ir import CompiledHumanNode, CompiledProject
from aqven.ports.execution import ExecutionScope, NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime.address import ExecutionAddress, JsonObject
from aqven.spec import TypeId


def form_schema_of(project: CompiledProject, type_id: TypeId, form: FormModel) -> JsonObject:
    compiled = project.type_schemas.get(type_id)
    if compiled is None:
        return form.json_schema()
    return compiled


def node_outcome(address: ExecutionAddress, outcome: WaitOutcome) -> NodeOutcome:
    match outcome:
        case HumanAnswered():
            return NodeSucceeded(output=outcome.value, attempt=outcome.attempt)
        case HumanDefaulted():
            return NodeSucceeded(output=outcome.value, attempt=outcome.attempt, degraded=True)
        case HumanExpired() | HumanDefaultRejected():
            return NodeFailed(error=wait_error(address, outcome), attempt=outcome.attempt)
        case _:
            assert_never(outcome)


@dataclass(frozen=True, slots=True)
class HumanNodeExecutor:
    journal: WaitJournal
    forms: FormRegistry
    scripted: ScriptedAnswerSource = RUN_SPEC_ANSWERS

    async def execute(self, node: CompiledHumanNode, scope: ExecutionScope) -> NodeOutcome:
        form = self.forms.form(node.form)
        request = WaitRequest(
            run_id=wait_run_id(scope),
            address=scope.address,
            wait_kind="form",
            form=form,
            form_type_id=node.form,
            form_schema=form_schema_of(scope.project, node.form, form),
            suspend_data=scope.bind(node.inputs),
            assignee=node.assignee,
            timeout_seconds=float(node.timeout_seconds),
            expiry=expiry_plan(node.on_timeout),
        )
        waiter = HumanWaiter(self.journal, scope.events, await self.scripted.book(scope))
        return node_outcome(scope.address, await waiter.wait(request))
