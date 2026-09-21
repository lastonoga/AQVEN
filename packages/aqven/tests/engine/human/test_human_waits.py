import asyncio
import uuid
from datetime import UTC, datetime
from typing import Final

import pytest
from dbos import DBOS, SetWorkflowID, WorkflowHandleAsync
from human_harness import (
    APPROVAL_NODE,
    FORMS,
    HARNESS,
    HumanTestbed,
    human_node_workflow,
    parallel_waits_workflow,
    refund_node,
    tool_approval_workflow,
    wait_workflow,
)
from pydantic import JsonValue, TypeAdapter

from aqven.engine.human import HUMAN_TIMED_OUT, AnswerEnvelope, HumanWaits, wait_topic
from aqven.engine.human.dbos_adapters import CLOCK_STEP_NAME, DbosAnswerChannel, DbosStatusReader, IndexedRunStatus
from aqven.ports.engine import EngineError
from aqven.ports.execution import NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime import ClientOpId, JsonObject, RunId, node_address
from aqven.runtime.human import ResumeRequest
from aqven.testing.human import HumanResponder, ScriptedHuman

pytestmark = pytest.mark.asyncio(loop_scope="package")

RESULT_POLL: Final = 0.02
OUTCOME_ADAPTER: Final[TypeAdapter[NodeOutcome]] = TypeAdapter(NodeOutcome)
REVIEW: Final = node_address("review")
REFUND: Final = node_address("approve_refund")
APPROVAL: Final = node_address(APPROVAL_NODE)


def new_run() -> RunId:
    return RunId(f"run-{uuid.uuid4().hex}")


def op(name: str) -> ClientOpId:
    return ClientOpId(f"{name}-{uuid.uuid4().hex[:8]}")


def event_types(run_id: RunId) -> list[str]:
    return [event.type for event in HARNESS.events[run_id]]


async def start_wait(run_id: RunId, spec: JsonObject) -> WorkflowHandleAsync[JsonObject]:
    with SetWorkflowID(run_id):
        return await DBOS.start_workflow_async(wait_workflow, spec)


async def start_node(
    run_id: RunId, timeout_seconds: int = 60, answers: list[JsonObject] | None = None
) -> WorkflowHandleAsync[JsonObject]:
    node = refund_node(timeout_seconds).model_dump(mode="json")
    with SetWorkflowID(run_id):
        return await DBOS.start_workflow_async(human_node_workflow, node, answers or [])


async def outcome_of(handle: WorkflowHandleAsync[JsonObject]) -> NodeOutcome:
    return OUTCOME_ADAPTER.validate_python(await handle.get_result(polling_interval_sec=RESULT_POLL))


def succeeded(outcome: NodeOutcome) -> NodeSucceeded:
    assert isinstance(outcome, NodeSucceeded)
    return outcome


async def rejection(testbed: HumanTestbed, run_id: RunId, request: ResumeRequest) -> EngineError:
    with pytest.raises(EngineError) as caught:
        await testbed.waits.resume(run_id, request)
    return caught.value


async def test_approve_resumes_node(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id)

    result = await human_testbed.responder.respond(run_id, REFUND, {"verdict": "approve", "comment": "ok"})
    outcome = succeeded(await outcome_of(handle))

    assert result.outcome == "accepted"
    assert outcome.output == {"verdict": "approve", "comment": "ok"}
    assert event_types(run_id) == ["node_suspended", "node_resumed"]
    detail = await human_testbed.waits.wait_detail(run_id, REFUND)
    assert detail.state == "resolved"
    assert detail.resolved_by is not None
    assert detail.suspend_data is not None and detail.suspend_data.model_dump()["value"] == {"ticket": "T-1"}


async def test_fork_replays_recorded_answer_and_reasks_from_node_start(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id)
    await human_testbed.responder.respond(run_id, REFUND, {"verdict": "approve", "comment": "first"})
    original = succeeded(await outcome_of(handle))
    steps = await DBOS.list_workflow_steps_async(run_id)
    node_start = min(step["function_id"] for step in steps if step["function_name"] == CLOCK_STEP_NAME)

    replay: WorkflowHandleAsync[JsonObject] = await DBOS.fork_workflow_async(run_id, len(steps) + 1)
    replayed = succeeded(await outcome_of(replay))
    reask: WorkflowHandleAsync[JsonObject] = await DBOS.fork_workflow_async(run_id, node_start)
    fork_id = RunId(reask.get_workflow_id())
    await human_testbed.responder.respond(fork_id, REFUND, {"verdict": "reject", "comment": "second"})
    reasked = succeeded(await outcome_of(reask))

    assert replayed.output == original.output
    assert reasked.output == {"verdict": "reject", "comment": "second"}
    assert (await human_testbed.waits.wait_detail(run_id, REFUND)).answer_ref is not None


async def test_reject_resumes_node_through_in_process_adapters(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id)
    waits = HumanWaits(
        index=human_testbed.index,
        channel=DbosAnswerChannel(),
        forms=FORMS,
        statuses=IndexedRunStatus(DbosStatusReader(), human_testbed.index),
        confirm_poll_seconds=RESULT_POLL,
    )

    result = await HumanResponder(waits).respond(run_id, REFUND, {"verdict": "reject", "comment": "fraud"})

    assert result.outcome == "accepted"

    assert succeeded(await outcome_of(handle)).output == {"verdict": "reject", "comment": "fraud"}
    assert await human_testbed.waits.waits(run_id) == ()


async def test_invalid_payload_is_rejected_before_send_and_ignored_inside(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id)
    entry = await human_testbed.responder.reached(run_id, REFUND)
    invalid = ResumeRequest(
        address=REFUND, attempt=1, payload={"verdict": "maybe", "extra": True}, client_op_id=op("bad")
    )

    error = await rejection(human_testbed, run_id, invalid)
    raw = {"payload": {"verdict": "maybe"}, "idempotency_key": "raw-1", "sent_at": datetime.now(UTC).isoformat()}
    await human_testbed.client.send_async(entry.workflow_id, raw, wait_topic(REFUND, 1), "raw-1")
    await wait_until_ignored(human_testbed, run_id, 1)
    status = await human_testbed.waits.statuses.status(run_id)
    result = await human_testbed.responder.respond(run_id, REFUND, {"verdict": "approve"})

    assert error.code == "INPUT_INVALID"
    assert {problem.code for problem in error.problems} == {"literal_error", "extra_forbidden"}
    assert ("payload", "verdict") in {problem.path for problem in error.problems}
    assert status == "suspended"
    assert result.outcome == "accepted"
    assert succeeded(await outcome_of(handle)).output == {"verdict": "approve", "comment": ""}
    assert "node_answer_ignored" in event_types(run_id)


async def wait_until_ignored(testbed: HumanTestbed, run_id: RunId, count: int) -> None:
    for _ in range(250):
        detail = await testbed.waits.wait_detail(run_id, REFUND)
        if len(detail.ignored_answers) >= count:
            return
        await asyncio.sleep(RESULT_POLL)
    raise AssertionError("workflow did not discard the raw answer")


async def test_timeout_applies_default(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    default: JsonValue = {"verdict": "reject", "comment": "auto-timeout"}
    handle = await start_wait(run_id, {"timeout_seconds": 0.3, "plan": {"policy": "default", "value": default}})

    outcome = succeeded(await outcome_of(handle))
    late = ResumeRequest(address=REVIEW, attempt=1, payload={"verdict": "approve"}, client_op_id=op("late"))
    error = await rejection(human_testbed, run_id, late)

    assert outcome.output == default
    assert outcome.degraded
    assert event_types(run_id) == ["node_suspended", "node_wait_timed_out"]
    assert error.code == "RUN_TIMED_OUT"


async def test_timeout_fails_node(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id, timeout_seconds=1)

    outcome = await outcome_of(handle)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == HUMAN_TIMED_OUT
    assert event_types(run_id) == ["node_suspended", "node_wait_timed_out"]
    assert (await human_testbed.waits.wait_detail(run_id, REFUND)).state == "timed_out"


async def test_timeout_escalates_to_next_assignee(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    plan: JsonObject = {"policy": "escalate", "assignee": "lead", "timeout_seconds": 30}
    handle = await start_wait(run_id, {"timeout_seconds": 0.3, "plan": plan})

    escalated = await human_testbed.responder.reached(run_id, REVIEW, attempt=2)
    stale = ResumeRequest(address=REVIEW, attempt=1, payload={"verdict": "approve"}, client_op_id=op("stale"))
    error = await rejection(human_testbed, run_id, stale)
    result = await human_testbed.responder.respond(run_id, REVIEW, {"verdict": "approve", "comment": "lead"}, attempt=2)
    outcome = succeeded(await outcome_of(handle))
    detail = await human_testbed.waits.wait_detail(run_id, REVIEW)

    assert escalated.assignee == "lead"
    assert error.code == "WAIT_ATTEMPT_STALE"
    assert result.outcome == "accepted"
    assert outcome.output == {"verdict": "approve", "comment": "lead"}
    assert outcome.attempt == 2
    assert [attempt.state for attempt in detail.attempts] == ["timed_out", "resolved"]
    assert event_types(run_id) == [
        "node_suspended",
        "node_wait_timed_out",
        "node_wait_escalated",
        "node_suspended",
        "node_resumed",
    ]


async def test_escalated_wait_fails_when_silent(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    plan: JsonObject = {"policy": "escalate", "assignee": "lead", "timeout_seconds": 0.3}
    handle = await start_wait(run_id, {"timeout_seconds": 0.3, "plan": plan})

    outcome = await outcome_of(handle)

    assert isinstance(outcome, NodeFailed)
    assert outcome.attempt == 2
    assert outcome.error.code == HUMAN_TIMED_OUT


async def test_scripted_answer_is_delivered_without_responder(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    human = ScriptedHuman().answer("approve_refund", {"verdict": "approve", "comment": "scripted"})
    answers: list[JsonObject] = [answer.model_dump(mode="json") for answer in human.answers()]
    handle = await start_node(run_id, answers=answers)

    outcome = succeeded(await outcome_of(handle))
    detail = await human_testbed.waits.wait_detail(run_id, REFUND)

    assert outcome.output == {"verdict": "approve", "comment": "scripted"}
    assert detail.resolved_by == "scripted:0"


async def test_answer_sent_before_wait_is_buffered(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_wait(run_id, {"delay_seconds": 0.5})
    envelope = AnswerEnvelope(payload={"verdict": "reject"}, idempotency_key=op("early"), sent_at=datetime.now(UTC))

    await human_testbed.client.send_async(
        run_id, envelope.model_dump(mode="json"), wait_topic(REVIEW, 1), envelope.idempotency_key
    )
    outcome = succeeded(await outcome_of(handle))
    detail = await human_testbed.waits.wait_detail(run_id, REVIEW)

    assert outcome.output == {"verdict": "reject", "comment": ""}
    assert detail.resolved_by == envelope.idempotency_key


async def test_double_resume_replays_and_rejects_other_key(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id)
    first_key = op("first")

    first = await human_testbed.responder.respond(run_id, REFUND, {"verdict": "approve"}, client_op_id=first_key)
    await outcome_of(handle)
    replayed = await human_testbed.waits.resume(
        run_id, ResumeRequest(address=REFUND, attempt=1, payload={"verdict": "approve"}, client_op_id=first_key)
    )
    other = ResumeRequest(address=REFUND, attempt=1, payload={"verdict": "reject"}, client_op_id=op("second"))
    error = await rejection(human_testbed, run_id, other)

    assert first.outcome == "accepted"
    assert replayed.outcome == "replayed"
    assert replayed.status == "completed"
    assert error.code == "ALREADY_RESUMED"


async def test_concurrent_resumes_accept_exactly_one(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_node(run_id)
    await human_testbed.responder.reached(run_id, REFUND)
    requests = [
        ResumeRequest(address=REFUND, attempt=1, payload={"verdict": verdict}, client_op_id=op(verdict))
        for verdict in ("approve", "reject")
    ]

    results = await asyncio.gather(
        *(human_testbed.waits.resume(run_id, request) for request in requests), return_exceptions=True
    )
    await outcome_of(handle)

    accepted = [result for result in results if not isinstance(result, BaseException)]
    rejected = [result for result in results if isinstance(result, EngineError)]
    assert [result.outcome for result in accepted] == ["accepted"]
    assert [error.code for error in rejected] == ["ALREADY_RESUMED"]


async def test_parallel_waits_resume_in_any_order(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    branches: list[JsonObject] = [
        {"branch_key": "finance", "assignee": "finance"},
        {"branch_key": "legal", "assignee": "legal"},
    ]
    with SetWorkflowID(run_id):
        handle = await DBOS.start_workflow_async(parallel_waits_workflow, branches)
    finance = node_address("review", branch_key="finance")
    legal = node_address("review", branch_key="legal")

    await human_testbed.responder.reached(run_id, finance)
    await human_testbed.responder.reached(run_id, legal)
    open_waits = await human_testbed.waits.waits(run_id)
    legal_result = await human_testbed.responder.respond(run_id, legal, {"verdict": "reject", "comment": "legal"})
    parent_status = await human_testbed.waits.statuses.status(run_id)
    finance_result = await human_testbed.responder.respond(run_id, finance, {"verdict": "approve", "comment": "fin"})
    result = await handle.get_result(polling_interval_sec=RESULT_POLL)

    assert {wait.assignee for wait in open_waits} == {"finance", "legal"}
    assert legal_result.outcome == "accepted"
    assert parent_status == "suspended"
    assert finance_result.outcome == "accepted"
    outputs = [succeeded(OUTCOME_ADAPTER.validate_python(item)).output for item in branch_results(result)]
    assert outputs == [{"verdict": "approve", "comment": "fin"}, {"verdict": "reject", "comment": "legal"}]


def branch_results(result: JsonObject) -> list[JsonValue]:
    items = result["results"]
    assert isinstance(items, list)
    return items


async def start_approval(run_id: RunId, answers: list[JsonObject]) -> WorkflowHandleAsync[JsonObject]:
    with SetWorkflowID(run_id):
        return await DBOS.start_workflow_async(tool_approval_workflow, "refund T-10", answers)


async def test_tool_approval_runs_tool_after_approve(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    handle = await start_approval(run_id, [])

    entry = await human_testbed.responder.reached(run_id, APPROVAL)
    detail = await human_testbed.waits.wait_detail(run_id, APPROVAL)
    result = await human_testbed.responder.respond(run_id, APPROVAL, {"approve": True})
    output = await handle.get_result(polling_interval_sec=RESULT_POLL)

    assert entry.wait_kind == "tool_approval"
    assert entry.assignee == "finance"
    assert detail.suspend_data is not None
    assert detail.suspend_data.model_dump()["value"] == {
        "calls": [{"tool_call_id": "call-refund-1", "tool_name": "refund", "args": {"ticket": "T-10", "amount": 42}}]
    }
    assert result.outcome == "accepted"
    assert output == {"output": "final: refunded 42 for T-10", "attempt": 1}


async def test_tool_approval_denial_reaches_model(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    refunds_before = len(HARNESS.refunds)
    handle = await start_approval(run_id, [])

    await human_testbed.responder.respond(
        run_id,
        APPROVAL,
        {"approve": True, "calls": {"call-refund-1": {"approve": False, "message": "not today"}}},
    )
    output = await handle.get_result(polling_interval_sec=RESULT_POLL)

    assert output == {"output": "final: not today", "attempt": 1}
    assert len(HARNESS.refunds) == refunds_before


async def test_tool_approval_scripted_answer(human_testbed: HumanTestbed) -> None:
    run_id = new_run()
    human = ScriptedHuman().approve_tools(APPROVAL_NODE, approve=True)
    handle = await start_approval(run_id, [answer.model_dump(mode="json") for answer in human.answers()])

    output = await handle.get_result(polling_interval_sec=RESULT_POLL)

    assert output == {"output": "final: refunded 42 for T-10", "attempt": 1}
