from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Final, Protocol

from pydantic import JsonValue

from aqven.engine.extensions import RunAwareScope
from aqven.engine.human.forms import TOOL_APPROVAL_TYPE_ID, FormAccepted, FormRegistry, prefixed_problems
from aqven.engine.human.records import WaitRecord
from aqven.ir import CompiledHumanNode, CompiledLlmNode, CompiledNode, CompiledProject
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import ClientOpId, ExecutionAddress, Problem, RunId
from aqven.runtime.human import ScriptedAnswer
from aqven.runtime.runs import HumanAnswerStatus
from aqven.spec import NodeId, TypeId

SCRIPTED_KEY_PREFIX: Final = "scripted:"
HUMAN_ANSWERS_FIELD: Final = "human_answers"


def scripted_key(index: int) -> ClientOpId:
    return ClientOpId(f"{SCRIPTED_KEY_PREFIX}{index}")


@dataclass(frozen=True, slots=True)
class ScriptedDelivery:
    client_op_id: ClientOpId
    payload: JsonValue


@dataclass(frozen=True, slots=True)
class ScriptedAnswerBook:
    answers: tuple[ScriptedAnswer, ...] = ()

    def lookup(self, address: ExecutionAddress, attempt: int) -> ScriptedDelivery | None:
        matches = (
            ScriptedDelivery(scripted_key(index), answer.payload)
            for index, answer in enumerate(self.answers)
            if answer.address == address and answer.attempt == attempt
        )
        return next(matches, None)


EMPTY_BOOK: Final = ScriptedAnswerBook()


class ScriptedAnswerSource(Protocol):
    async def book(self, scope: ExecutionScope) -> ScriptedAnswerBook: ...


def wait_run_id(scope: ExecutionScope) -> RunId:
    if isinstance(scope, RunAwareScope):
        return scope.root_run_id
    return scope.run_id


@dataclass(frozen=True, slots=True)
class StaticScriptedAnswers:
    books: Mapping[RunId, ScriptedAnswerBook] = field(default_factory=dict[RunId, ScriptedAnswerBook])

    async def book(self, scope: ExecutionScope) -> ScriptedAnswerBook:
        return self.books.get(wait_run_id(scope), EMPTY_BOOK)


@dataclass(frozen=True, slots=True)
class RunSpecScriptedAnswers:
    async def book(self, scope: ExecutionScope) -> ScriptedAnswerBook:
        if isinstance(scope, RunAwareScope):
            return ScriptedAnswerBook(scope.run_spec.human_answers)
        return EMPTY_BOOK


NO_SCRIPTED_ANSWERS: Final = StaticScriptedAnswers()
RUN_SPEC_ANSWERS: Final = RunSpecScriptedAnswers()


def _approval_form(node: CompiledLlmNode, project: CompiledProject) -> TypeId | None:
    agent = project.agents.get(node.agent)
    if agent is None or agent.approval is None:
        return None
    return TOOL_APPROVAL_TYPE_ID


def wait_form_of(node: CompiledNode, project: CompiledProject) -> TypeId | None:
    match node:
        case CompiledHumanNode():
            return node.form
        case CompiledLlmNode():
            return _approval_form(node, project)
        case _:
            return None


def _project_nodes(project: CompiledProject) -> Mapping[NodeId, CompiledNode]:
    return {node_id: node for flow in project.flows.values() for node_id, node in flow.nodes.items()}


def _duplicate_problems(answers: tuple[ScriptedAnswer, ...]) -> Iterable[Problem]:
    counts = Counter((answer.address, answer.attempt) for answer in answers)
    return (
        Problem(
            path=(HUMAN_ANSWERS_FIELD, index),
            code="duplicate_answer",
            message="an answer for this address and attempt is already scripted",
        )
        for index, answer in enumerate(answers)
        if counts[(answer.address, answer.attempt)] > 1
    )


def _answer_problems(
    index: int,
    answer: ScriptedAnswer,
    nodes: Mapping[NodeId, CompiledNode],
    project: CompiledProject,
    forms: FormRegistry,
) -> tuple[Problem, ...]:
    path = (HUMAN_ANSWERS_FIELD, index)
    node = nodes.get(NodeId(answer.address.node_id))
    form_type = None if node is None else wait_form_of(node, project)
    if form_type is None:
        return (
            Problem(path=(*path, "address"), code="not_a_wait_node", message="node does not wait for a human answer"),
        )
    verdict = forms.form(form_type).check(answer.payload)
    if isinstance(verdict, FormAccepted):
        return ()
    return prefixed_problems(verdict.problems, (*path, "payload"))


def scripted_answer_problems(
    answers: tuple[ScriptedAnswer, ...],
    project: CompiledProject,
    forms: FormRegistry,
) -> tuple[Problem, ...]:
    nodes = _project_nodes(project)
    checked = (
        problem
        for index, answer in enumerate(answers)
        for problem in _answer_problems(index, answer, nodes, project, forms)
    )
    return (*_duplicate_problems(answers), *checked)


def answer_statuses(
    answers: tuple[ScriptedAnswer, ...],
    records: Iterable[WaitRecord],
) -> tuple[HumanAnswerStatus, ...]:
    consumed = {record.resolved_by for record in records if record.resolved_by is not None}
    return tuple(
        HumanAnswerStatus(address=answer.address, attempt=answer.attempt, consumed=scripted_key(index) in consumed)
        for index, answer in enumerate(answers)
    )
