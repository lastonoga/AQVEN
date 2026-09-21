from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Final

import pytest
from human_harness import APPROVAL_SPEC, harness_scope

from aqven.engine.addressing import address_key
from aqven.engine.assembly.approvals import HumanApprovalGate
from aqven.engine.human.approval import PendingToolCall, ToolApprovalFailed, ToolApprovalGate, ToolApprovalGranted
from aqven.engine.human.records import AnswerEnvelope, WaitRecord
from aqven.engine.llm.ports import ApprovalRequest
from aqven.engine.llm.segments import PendingToolCall as LlmToolCall
from aqven.runtime import RunId, ScriptedAnswer, ToolApprovalDecision, node_address
from aqven.testing import ScriptedHuman

pytestmark = pytest.mark.anyio

NODE: Final = "resolve"
ADDRESS: Final = node_address(NODE)
RUN_ID: Final = RunId("run-approval-rounds")
CALLS: Final = (
    PendingToolCall(tool_call_id="call-credit-1", tool_name="issue_store_credit", args={"order_id": "LUM-1"}),
)
LLM_CALLS: Final = (
    LlmToolCall(tool_call_id="call-credit-1", tool_name="issue_store_credit", args={"order_id": "LUM-1"}),
)
CLOCK_START: Final = datetime(2026, 9, 17, 12, tzinfo=UTC)
CLOCK_STEP: Final = timedelta(seconds=1)


@dataclass(slots=True)
class MemoryJournal:
    moment: datetime = CLOCK_START
    published: list[WaitRecord] = field(default_factory=list[WaitRecord])
    queues: dict[str, list[AnswerEnvelope]] = field(default_factory=dict[str, list[AnswerEnvelope]])
    keys: set[tuple[str, str]] = field(default_factory=set[tuple[str, str]])

    def workflow_id(self) -> str:
        return RUN_ID

    async def now(self) -> datetime:
        self.moment = self.moment + CLOCK_STEP
        return self.moment

    async def publish(self, record: WaitRecord) -> None:
        self.published.append(record)

    async def receive(self, topic: str, timeout_seconds: float) -> object:
        queue = self.queues.get(topic, [])
        if not queue:
            return None
        return queue.pop(0).model_dump(mode="json")

    async def deliver(self, topic: str, envelope: AnswerEnvelope) -> None:
        marker = (topic, envelope.idempotency_key)
        if marker in self.keys:
            return
        self.keys.add(marker)
        self.queues.setdefault(topic, []).append(envelope)

    def topics(self) -> list[str]:
        return [record.topic for record in self.published if record.state == "waiting"]


def topic(attempt: int) -> str:
    return f"human:{address_key(ADDRESS)}:{attempt}"


def scripted(*decisions: bool) -> tuple[ScriptedAnswer, ...]:
    human = ScriptedHuman()
    for index, approve in enumerate(decisions):
        human.approve_tools(NODE, approve=approve, attempt=index + 1, message=None if approve else "denied")
    return human.answers()


def granted(outcome: ToolApprovalGranted | ToolApprovalFailed) -> ToolApprovalGranted:
    assert isinstance(outcome, ToolApprovalGranted)
    return outcome


async def decide(journal: MemoryJournal, answers: tuple[ScriptedAnswer, ...], attempt: int) -> ToolApprovalGranted:
    gate = ToolApprovalGate(journal)
    scope = harness_scope(RUN_ID, ADDRESS, answers)
    return granted(await gate.decide(scope, APPROVAL_SPEC, CALLS, attempt))


async def test_two_approval_rounds_open_separate_waits() -> None:
    journal = MemoryJournal()
    answers = scripted(True, False)

    first = await decide(journal, answers, 1)
    second = await decide(journal, answers, 2)

    assert journal.topics() == [topic(1), topic(2)]
    assert (first.attempt, second.attempt) == (1, 2)
    assert first.answer.approve is True
    assert second.answer.approve is False
    assert second.answer.message == "denied"


async def test_a_second_round_does_not_reuse_the_first_answer() -> None:
    journal = MemoryJournal()
    answers = scripted(True)

    first = await decide(journal, answers, 1)
    gate = ToolApprovalGate(journal)
    scope = harness_scope(RUN_ID, ADDRESS, answers)
    second = await gate.decide(scope, APPROVAL_SPEC, CALLS, 2)

    assert first.answer.approve is True
    assert isinstance(second, ToolApprovalFailed)
    assert second.error.code == "HUMAN_TIMED_OUT"


async def test_the_first_round_keeps_the_first_attempt_by_default() -> None:
    journal = MemoryJournal()
    gate = ToolApprovalGate(journal)
    scope = harness_scope(RUN_ID, ADDRESS, scripted(True))

    outcome = granted(await gate.decide(scope, APPROVAL_SPEC, CALLS))

    assert outcome.attempt == 1
    assert journal.topics() == [topic(1)]


async def test_the_answer_of_a_round_decides_each_call() -> None:
    journal = MemoryJournal()
    answer = ScriptedHuman().approve_tools(NODE, approve=True, attempt=2).answers()

    outcome = await decide(journal, answer, 2)

    assert outcome.answer.calls == {}
    assert ToolApprovalDecision(approve=outcome.answer.approve, message=outcome.answer.message).approve is True


async def test_the_llm_gate_forwards_the_round_of_the_request() -> None:
    journal = MemoryJournal()
    gate = HumanApprovalGate(ToolApprovalGate(journal))
    scope = harness_scope(RUN_ID, ADDRESS, scripted(True, False))
    request = ApprovalRequest(address=ADDRESS, attempt=2, spec=APPROVAL_SPEC, calls=LLM_CALLS)

    decisions = await gate.decide(scope, request)

    assert journal.topics() == [topic(2)]
    assert decisions[CALLS[0].tool_call_id].approve is False
