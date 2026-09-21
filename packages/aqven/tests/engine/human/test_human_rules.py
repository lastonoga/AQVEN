from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final

import pytest
from human_harness import FORMS, REFUND_FORM
from pydantic_ai import ToolApproved, ToolDenied

from aqven.engine.human import (
    AcceptedAnswer,
    AnswerEnvelope,
    FormRejected,
    ScriptedAnswerBook,
    SqliteWaitIndex,
    ToolApprovalAnswer,
    WaitQuery,
    WaitRecord,
    address_key,
    answer_statuses,
    child_workflow_id,
    first_rejection,
    index_entry,
    judge_answer,
    scripted_answer_problems,
    scripted_key,
    wait_topic,
)
from aqven.engine.human.approval import PendingToolCall, deferred_tool_results
from aqven.engine.human.records import WaitOpening, WaitSubject, opened_record, resolved_record, timed_out_record
from aqven.engine.human.resume import ResumeCheck
from aqven.ir import CompiledFlow, CompiledHumanNode, CompiledProject, LiteralBinding, RefBinding
from aqven.runtime import ClientOpId, RunId, ScriptedAnswer, node_address
from aqven.runtime.human import IgnoredAnswer, ResumeRequest
from aqven.spec import FailOnTimeout, FlowId, NodeId

NOW: Final = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
ADDRESS: Final = node_address("review")


def waiting_record(run_id: str = "run-1", assignee: str = "support", deadline_seconds: int = 60) -> WaitRecord:
    subject = WaitSubject(
        run_id=RunId(run_id),
        workflow_id=run_id,
        address=ADDRESS,
        wait_kind="form",
        form_type_id=REFUND_FORM,
        form_schema={},
        suspend_data=None,
    )
    opening = WaitOpening(
        attempt=1,
        assignee=assignee,
        waiting_since=NOW,
        deadline_at=NOW + timedelta(seconds=deadline_seconds),
        on_timeout="fail",
        topic=wait_topic(ADDRESS, 1),
    )
    return opened_record(subject, opening)


def resume(attempt: int = 1, payload: object = None) -> ResumeRequest:
    body = {"verdict": "approve"} if payload is None else payload
    return ResumeRequest.model_validate(
        {"address": ADDRESS.model_dump(), "attempt": attempt, "payload": body, "client_op_id": "k1"}
    )


def envelope(payload: object, sent_at: datetime) -> dict[str, object]:
    return {"payload": payload, "idempotency_key": "k1", "sent_at": sent_at.isoformat()}


def test_address_key_is_canonical_and_distinguishes_null_from_zero() -> None:
    with_null = node_address("loop_body", iteration=None)
    with_zero = node_address("loop_body", iteration=0)

    assert address_key(with_null) == '{"branch_key":null,"item_index":null,"iteration":null,"node_id":"loop_body"}'
    assert address_key(with_null) != address_key(with_zero)
    assert wait_topic(with_zero, 2) == f"human:{address_key(with_zero)}:2"
    assert child_workflow_id("run-1", with_zero) == f"run-1::{address_key(with_zero)}"


def test_resume_guards_reject_in_documented_order() -> None:
    record = waiting_record()
    form = FORMS.form(REFUND_FORM)
    settled = timed_out_record(record, NOW)
    late = NOW + timedelta(minutes=5)
    bad_payload = {"verdict": "maybe"}

    codes = [
        first_rejection(ResumeCheck(resume(attempt=2, payload=bad_payload), settled, late, form)),
        first_rejection(ResumeCheck(resume(attempt=2, payload=bad_payload), record, late, form)),
        first_rejection(ResumeCheck(resume(payload=bad_payload), record, late, form)),
        first_rejection(ResumeCheck(resume(payload=bad_payload), record, NOW, form)),
        first_rejection(ResumeCheck(resume(), record, NOW, form)),
    ]

    assert [None if error is None else error.code for error in codes] == [
        "RUN_TIMED_OUT",
        "WAIT_ATTEMPT_STALE",
        "RUN_TIMED_OUT",
        "INPUT_INVALID",
        None,
    ]


def test_resolved_wait_rejects_other_key_as_already_resumed() -> None:
    record = waiting_record()
    answer = AnswerEnvelope(payload={"verdict": "approve"}, idempotency_key=ClientOpId("k0"), sent_at=NOW)
    resolved = resolved_record(record, answer, {"verdict": "approve"}, NOW)

    error = first_rejection(ResumeCheck(resume(), resolved, NOW, FORMS.form(REFUND_FORM)))

    assert error is not None and error.code == "ALREADY_RESUMED"


def test_judge_answer_ignores_malformed_late_and_invalid_messages() -> None:
    record = waiting_record()
    form = FORMS.form(REFUND_FORM)
    after_deadline = NOW + timedelta(minutes=2)

    malformed = judge_answer(form, record, "not an envelope", NOW)
    late = judge_answer(form, record, envelope({"verdict": "approve"}, after_deadline), after_deadline)
    invalid = judge_answer(form, record, envelope({"verdict": "maybe"}, NOW), NOW)
    accepted = judge_answer(form, record, envelope({"verdict": "approve"}, NOW), NOW)

    assert isinstance(malformed, IgnoredAnswer) and malformed.client_op_id == "unknown"
    assert isinstance(late, IgnoredAnswer) and [problem.code for problem in late.problems] == ["answer_late"]
    assert isinstance(invalid, IgnoredAnswer) and invalid.problems[0].path == ("payload", "verdict")
    assert isinstance(accepted, AcceptedAnswer) and accepted.value == {"verdict": "approve", "comment": ""}


def test_form_rejects_unknown_fields() -> None:
    verdict = FORMS.form(REFUND_FORM).check({"verdict": "approve", "extra": 1})

    assert isinstance(verdict, FormRejected)
    assert [problem.code for problem in verdict.problems] == ["extra_forbidden"]


def test_tool_approval_answer_maps_to_deferred_results() -> None:
    calls = (
        PendingToolCall(tool_call_id="a", tool_name="refund", args={"amount": 1}),
        PendingToolCall(tool_call_id="b", tool_name="refund", args={"amount": 2}),
        PendingToolCall(tool_call_id="c", tool_name="refund", args={"amount": 3}),
    )
    answer = ToolApprovalAnswer.model_validate(
        {
            "approve": True,
            "calls": {
                "b": {"approve": False, "message": "too much"},
                "c": {"approve": True, "override_args": {"amount": 1}},
            },
        }
    )

    approvals = deferred_tool_results(answer, calls).approvals

    assert approvals == {
        "a": ToolApproved(),
        "b": ToolDenied("too much"),
        "c": ToolApproved(override_args={"amount": 1}),
    }


def test_blanket_denial_uses_default_message() -> None:
    call = PendingToolCall(tool_call_id="a", tool_name="refund", args={})

    approvals = deferred_tool_results(ToolApprovalAnswer(approve=False), (call,)).approvals

    assert approvals == {"a": ToolDenied("The tool call was denied.")}


def scripted_project() -> CompiledProject:
    human = CompiledHumanNode(
        node_id=NodeId("review"),
        description="review",
        output_schema={},
        inputs=(LiteralBinding(name="ticket", value="T-1"),),
        input_schema={},
        form=REFUND_FORM,
        assignee="support",
        timeout_seconds=60,
        on_timeout=FailOnTimeout(policy="fail"),
    )
    flow = CompiledFlow(
        flow_id=FlowId("refunds"),
        description="refunds",
        input_type="RefundDecision",
        output_type="RefundDecision",
        input_schema={},
        output_schema={},
        returns=(RefBinding(name="verdict", ref="$review.out.verdict"),),
        order=(human.node_id,),
        nodes={human.node_id: human},
    )
    return CompiledProject(package="shop", description="shop", flows={flow.flow_id: flow})


def test_scripted_answer_problems_cover_duplicates_unknown_nodes_and_payloads() -> None:
    answers = (
        ScriptedAnswer(address=ADDRESS, payload={"verdict": "approve"}),
        ScriptedAnswer(address=ADDRESS, payload={"verdict": "maybe"}),
        ScriptedAnswer(address=node_address("missing"), payload={}),
    )

    problems = scripted_answer_problems(answers, scripted_project(), FORMS)

    assert [(problem.path, problem.code) for problem in problems] == [
        (("human_answers", 0), "duplicate_answer"),
        (("human_answers", 1), "duplicate_answer"),
        (("human_answers", 1, "payload", "verdict"), "literal_error"),
        (("human_answers", 2, "address"), "not_a_wait_node"),
    ]


def test_scripted_book_keys_answers_by_address_and_attempt() -> None:
    book = ScriptedAnswerBook(
        (
            ScriptedAnswer(address=ADDRESS, payload={"verdict": "approve"}),
            ScriptedAnswer(address=ADDRESS, attempt=2, payload={"verdict": "reject"}),
        )
    )

    second = book.lookup(ADDRESS, 2)

    assert second is not None and second.client_op_id == scripted_key(1)
    assert second.payload == {"verdict": "reject"}
    assert book.lookup(node_address("review", branch_key="x"), 1) is None


def test_answer_statuses_mark_consumed_scripted_answers() -> None:
    answers = (
        ScriptedAnswer(address=ADDRESS, payload={"verdict": "approve"}),
        ScriptedAnswer(address=node_address("other"), payload={"verdict": "reject"}),
    )
    delivered = AnswerEnvelope(payload={"verdict": "approve"}, idempotency_key=scripted_key(0), sent_at=NOW)
    resolved = resolved_record(waiting_record(), delivered, {"verdict": "approve"}, NOW)

    statuses = answer_statuses(answers, (resolved,))

    assert [status.consumed for status in statuses] == [True, False]


@pytest.mark.asyncio
async def test_sqlite_index_filters_open_waits(tmp_path: Path) -> None:
    index = SqliteWaitIndex.open(tmp_path / "app.sqlite")
    soon = waiting_record("run-a", "finance", 10)
    later = waiting_record("run-b", "legal", 600)
    closed = timed_out_record(waiting_record("run-c", "finance", 5), NOW)
    for record in (later, soon, closed):
        await index.record(index_entry(record))

    open_waits = await index.search(WaitQuery())
    named_me = await index.search(WaitQuery(assignee="me"))
    finance = await index.search(WaitQuery(assignee="finance"))
    before = await index.search(WaitQuery(deadline_before=NOW + timedelta(seconds=30)))
    run_waits = await index.search(WaitQuery(run_id=RunId("run-c"), state=None))
    found = await index.find(RunId("run-b"), ADDRESS)

    assert [entry.run_id for entry in open_waits] == ["run-a", "run-b"]
    assert named_me == ()
    assert [entry.run_id for entry in finance] == ["run-a"]
    assert [entry.run_id for entry in before] == ["run-a"]
    assert [entry.state for entry in run_waits] == ["timed_out"]
    assert found is not None and found.assignee == "legal"
