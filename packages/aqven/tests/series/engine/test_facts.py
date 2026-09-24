import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

import pytest

from aqven.engine import RunRecord, RunUsageTotals
from aqven.engine.checking import JudgeReply, JudgeRequest
from aqven.ir import CompiledCodeNode, CompiledFlow, FieldIr, RefBinding
from aqven.runtime.address import ExecutionAddress, RunId, node_address
from aqven.runtime.events import (
    InferenceChecksCaptured,
    NodeAttemptFailed,
    NodeFinished,
    NodeStarted,
    RunEvent,
)
from aqven.runtime.executions import AttemptCause, CheckOutcome, ModelErrorDetails, RunError
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import AttemptCauseKind, FinishedExecutionStatus
from aqven.series.facts import NO_SPEND, RunSpend, RunTrace, event_spend, outcome_of, run_facts, total_spend
from aqven.series.model import (
    CaseSnapshot,
    CheckPlan,
    CheckState,
    CheckValue,
    OutcomeClass,
    VariantPlanRecord,
    VariantRole,
)
from aqven.series.scoring import AttemptScorer, AttemptScoring, PrecomputedJudges, attempt_passed
from aqven.spec import (
    AgentId,
    CodeRef,
    FlowId,
    InferenceId,
    MetricKind,
    NodeId,
    NodeKind,
    OnFail,
    SeriesSplit,
    TypeId,
    VariantId,
)

AT: Final = datetime(2026, 9, 23, 12, 0, tzinfo=UTC)
RUN: Final = RunId("run-1")
CLASSIFY: Final = node_address("classify")
TIDY: Final = node_address("tidy")
NESTED: Final = node_address("classify", branch_key="left")


def flow() -> CompiledFlow:
    node = CompiledCodeNode(
        node_id=NodeId("classify"),
        description="classify",
        output_schema={"type": "object"},
        input_schema={"type": "object"},
        run=CodeRef("series_shop.code:classify"),
        output_fields=(FieldIr(name="label", type="Text", description="Label"),),
    )
    tidy = node.model_copy(update={"node_id": NodeId("tidy"), "description": "tidy"})
    return CompiledFlow(
        flow_id=FlowId("triage"),
        description="triage",
        input_type="Ticket",
        output_type="Label",
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        returns=(RefBinding(name="label", ref="$tidy.out.label"),),
        order=(NodeId("classify"), NodeId("tidy")),
        nodes={NodeId("classify"): node, NodeId("tidy"): tidy},
    )


def started(seq: int, address: ExecutionAddress, kind: NodeKind) -> NodeStarted:
    return NodeStarted(seq=seq, at=AT, run_id=RUN, address=address, kind=kind, attempt=1, queued_ms=0)


def finished(
    seq: int,
    address: ExecutionAddress,
    cost: str,
    latency: int,
    wait: int,
    status: FinishedExecutionStatus = "ok",
    model: str | None = None,
    unpriced: int = 0,
) -> NodeFinished:
    return NodeFinished(
        seq=seq,
        at=AT,
        run_id=RUN,
        address=address,
        status=status,
        attempt=1,
        output_ref=InlineValue(value={"label": address.node_id}) if status == "ok" else None,
        cost_usd=Decimal(cost),
        tokens_in=10,
        tokens_out=5,
        latency_ms=latency,
        wait_ms=wait,
        model=model,
        cache_hit=False,
        degraded=False,
        checks_failed=0,
        cost_source="unknown" if unpriced else "provider",
        unpriced_calls=unpriced,
    )


def attempt_failed(seq: int, attempt: int, kind: AttemptCauseKind) -> NodeAttemptFailed:
    cause = AttemptCause(kind=kind, message="broken", schema_errors=())
    return NodeAttemptFailed(seq=seq, at=AT, run_id=RUN, address=CLASSIFY, attempt=attempt, cause=cause, action="retry")


def checks_captured(seq: int, passed: bool, attempt: int) -> InferenceChecksCaptured:
    outcome = CheckOutcome(check="short", on_fail=OnFail.RETRY, passed=passed, feedback=None, attempt=attempt)
    return InferenceChecksCaptured(seq=seq, at=AT, run_id=RUN, address=CLASSIFY, checks=(outcome,))


def events(
    first_cause: AttemptCauseKind = "rate_limited", tidy_status: FinishedExecutionStatus = "ok"
) -> tuple[RunEvent, ...]:
    return (
        started(1, CLASSIFY, NodeKind.LLM),
        attempt_failed(2, 1, first_cause),
        checks_captured(3, False, 1),
        checks_captured(4, True, 2),
        finished(5, CLASSIFY, "0.010", 900, 300, model="openai:gpt-4o-mini"),
        started(6, NESTED, NodeKind.LLM),
        finished(7, NESTED, "0.002", 400, 0, model="openai:gpt-4.1-mini", unpriced=2),
        started(8, TIDY, NodeKind.CODE),
        finished(9, TIDY, "0.001", 50, 0, status=tidy_status),
    )


def test_a_completed_run_counts_top_level_work_without_waits_and_actual_models() -> None:
    usage = RunUsageTotals(cost_usd=Decimal("0.013"), tokens_in=30, tokens_out=15, unpriced_calls=3)
    record = RunRecord(status="completed", output={"label": "tidy"}, usage=usage)

    facts = run_facts(RunTrace(events=events("schema_invalid"), flow=flow()), record)

    assert facts.outcome is OutcomeClass.OK
    assert (facts.cost_usd, facts.tokens_in, facts.tokens_out) == (Decimal("0.013"), 30, 15)
    assert facts.unpriced_calls == 3
    assert (facts.latency_ms, facts.wait_ms) == (650, 300)
    assert facts.models == {"classify": "openai:gpt-4.1-mini"}
    assert facts.schema_valid_first_try is False
    assert [(item.check, item.failed_first_try) for item in facts.runtime_checks] == [("short", True)]
    assert facts.first_failed_node is None


def test_a_failed_run_costs_the_sum_of_its_nodes_including_the_failed_one() -> None:
    error = RunError(code="MODEL_SCHEMA_MISMATCH", message="bad output", address=TIDY)
    record = RunRecord(status="failed", error=error)

    facts = run_facts(RunTrace(events=events(tidy_status="failed"), flow=flow()), record)

    assert facts.outcome is OutcomeClass.SCHEMA_INVALID
    assert facts.cost_usd == Decimal("0.013")
    assert (facts.tokens_in, facts.tokens_out) == (30, 15)
    assert facts.unpriced_calls == 2
    assert (facts.error_code, facts.first_failed_node) == ("MODEL_SCHEMA_MISMATCH", "tidy")
    assert facts.schema_valid_first_try is True


@pytest.mark.parametrize(
    ("status", "code", "outcome"),
    [
        ("completed", None, OutcomeClass.OK),
        ("cancelled", None, OutcomeClass.CANCELLED),
        ("failed", "check_failed", OutcomeClass.MODEL_FAIL),
        ("failed", "refusal", OutcomeClass.REFUSAL),
        ("failed", "budget_exceeded", OutcomeClass.BUDGET_CUT),
        ("failed", "provider_error", OutcomeClass.INFRA_ERROR),
        ("failed", "code_invalid", OutcomeClass.INFRA_ERROR),
        ("failed", "something_new", OutcomeClass.INFRA_ERROR),
    ],
)
def test_the_outcome_follows_the_run_status_and_error_code(
    status: str, code: str | None, outcome: OutcomeClass
) -> None:
    error = None if code is None else RunError(code=code, message="x", address=None)
    record = RunRecord.model_validate({"status": status, "error": None if error is None else error.model_dump()})

    assert outcome_of(record) is outcome


def test_uncounted_outcomes_have_no_first_try_schema_fact() -> None:
    record = RunRecord(status="failed", error=RunError(code="provider_error", message="x", address=None))

    facts = run_facts(RunTrace(events=events("schema_invalid"), flow=flow()), record)

    assert facts.schema_valid_first_try is None


def provider_failure(status: int) -> RunError:
    details = ModelErrorDetails(model="openrouter:google/gemma-3-27b-it", status_code=status)
    return RunError(code="provider_error", message=f"answered HTTP {status}", address=CLASSIFY, details=details)


def test_a_run_that_failed_on_a_rate_limit_is_marked_rate_limited() -> None:
    trace = RunTrace(events=events(), flow=flow())

    limited = run_facts(trace, RunRecord(status="failed", error=provider_failure(429)))
    overloaded = run_facts(trace, RunRecord(status="failed", error=provider_failure(503)))
    completed = run_facts(trace, RunRecord(status="completed"))

    assert (limited.rate_limited, limited.outcome) == (True, OutcomeClass.INFRA_ERROR)
    assert (overloaded.rate_limited, completed.rate_limited) == (False, False)


def test_a_rate_limited_step_marks_the_run_when_the_run_error_carries_no_details() -> None:
    limited_step = finished(9, TIDY, "0", 50, 0, status="failed").model_copy(update={"error": provider_failure(429)})
    trace = RunTrace(events=(*events()[:-1], limited_step), flow=flow())
    record = RunRecord(status="failed", error=RunError(code="provider_error", message="map failed", address=None))

    assert run_facts(trace, record).rate_limited is True


def test_event_spend_sums_the_cost_and_unpriced_calls_of_work_nodes_only() -> None:
    assert event_spend(events()) == RunSpend(cost_usd=Decimal("0.013"), unpriced_calls=2)


def test_total_spend_adds_runs_and_is_empty_without_runs() -> None:
    spends = [RunSpend(Decimal("0.01"), 1), RunSpend(Decimal("0.002"), 0), RunSpend(Decimal("0.003"), 2)]

    assert total_spend(spends) == RunSpend(Decimal("0.015"), 3)
    assert total_spend([]) == NO_SPEND


def plan(check_id: str, kind: MetricKind, only_with_expected: bool = False) -> CheckPlan:
    return CheckPlan(
        check_id=check_id,
        kind=kind,
        evaluator={"kind": "builtin", "use": "expected"},
        only_with_expected=only_with_expected,
    )


def scoring(outcome: OutcomeClass, checks: tuple[CheckPlan, ...], expected: str | None) -> AttemptScoring:
    variant = VariantPlanRecord(
        variant_id=VariantId("writer"),
        role=VariantRole.OTHER,
        arm_id=None,
        flow_id=FlowId("triage"),
        ir_hash="",
        flow_hash="",
        input_type=TypeId("Ticket"),
        output_type=None,
        assignments=(),
    )
    case = CaseSnapshot(
        case_index=0,
        name="always_1",
        split=SeriesSplit.DEV,
        inputs={"text": "always"},
        expected_output=None if expected is None else {"label": expected},
    )
    return AttemptScoring(
        checks=checks,
        case=case,
        variant=variant,
        repeat=1,
        outcome=outcome,
        error_code=outcome.value,
        subject_input=case.inputs,
        subject_output={"label": "ok"},
        documents=(),
        top_outputs={},
        cost_usd=Decimal(0),
        latency_ms=None,
        package="series_shop",
        input_type=None,
    )


class NoTypes:
    def type_annotation(self, package: str, type_ref: str) -> object:
        return dict

    def function(self, ref: str) -> object:
        return None


def score(outcome: OutcomeClass, checks: tuple[CheckPlan, ...], expected: str | None) -> tuple[CheckValue, ...]:
    return asyncio.run(AttemptScorer(types=NoTypes(), code=NoTypes()).score(scoring(outcome, checks, expected), {}))


def states(values: tuple[CheckValue, ...]) -> list[CheckState]:
    return [value.state for value in values]


def test_checks_run_only_on_an_ok_outcome_and_compare_the_expected_output() -> None:
    checks = (plan("matches", MetricKind.BINARY),)

    assert states(score(OutcomeClass.OK, checks, "ok")) == [CheckState.PASSED]
    assert states(score(OutcomeClass.OK, checks, "bad")) == [CheckState.FAILED]


def test_a_run_without_output_fails_binary_checks_and_skips_scored_ones() -> None:
    checks = (plan("matches", MetricKind.BINARY), plan("grade", MetricKind.CONTINUOUS))

    values = score(OutcomeClass.SCHEMA_INVALID, checks, "ok")

    assert states(values) == [CheckState.FAILED, CheckState.SKIPPED]
    assert values[0].reason == "the run produced no output: schema_invalid"


def test_an_infrastructure_error_skips_every_check() -> None:
    checks = (plan("matches", MetricKind.BINARY), plan("grade", MetricKind.CONTINUOUS))

    assert states(score(OutcomeClass.INFRA_ERROR, checks, "ok")) == [CheckState.SKIPPED, CheckState.SKIPPED]


def test_an_implicit_expected_check_skips_cases_without_an_expected_output() -> None:
    assert states(score(OutcomeClass.OK, (plan("expected", MetricKind.BINARY, True),), None)) == [CheckState.SKIPPED]


def test_passed_needs_an_ok_run_and_every_decided_binary_check() -> None:
    passed = CheckValue(check_id="a", kind=MetricKind.BINARY, state=CheckState.PASSED, value=1.0)
    failed = passed.model_copy(update={"state": CheckState.FAILED})
    skipped = passed.model_copy(update={"state": CheckState.SKIPPED})
    scored = passed.model_copy(update={"kind": MetricKind.CONTINUOUS, "state": CheckState.FAILED})

    assert attempt_passed(OutcomeClass.OK, (passed, skipped, scored)) is True
    assert attempt_passed(OutcomeClass.OK, (passed, failed)) is False
    assert attempt_passed(OutcomeClass.OK, ()) is True
    assert attempt_passed(OutcomeClass.REFUSAL, ()) is False
    assert attempt_passed(OutcomeClass.INFRA_ERROR, ()) is None


def test_precomputed_judges_answer_by_check_and_report_a_missing_run() -> None:
    reply = JudgeReply(output={"score": 0.9}, cost_usd=Decimal("0.002"))
    judges = PrecomputedJudges({"grade": reply})

    known = asyncio.run(judges.judge(JudgeRequest("grade", InferenceId("grade"), AgentId("critic"), {})))
    missing = asyncio.run(judges.judge(JudgeRequest("other", InferenceId("grade"), AgentId("critic"), {})))

    assert known == reply
    assert (missing.output, missing.error) == (None, "the judge did not run for this attempt")
