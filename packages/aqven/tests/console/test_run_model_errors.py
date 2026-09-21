from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from aqven.console.run import text_line
from aqven.runtime import (
    AttemptCause,
    ModelErrorDetails,
    NodeAttemptFailed,
    NodeFinished,
    RunError,
    RunFinished,
)
from aqven.runtime.address import Problem, RunId, node_address
from aqven.spec import NodeId

AT: Final = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
RUN: Final = RunId("run-1")
ADDRESS: Final = node_address(NodeId("judge"))
HINT: Final = (
    "field rationale is longer than 600 characters: tighten the prompt or raise maxLength in judge.inference.yaml"
)
DETAILS: Final = ModelErrorDetails(
    agent="qwen",
    model="openrouter:qwen/qwen3-30b-a3b-instruct-2507",
    output_mode="prompted",
    attempt=2,
    raw_excerpt='{"rationale": "long"}',
    violations=(
        Problem(path=("rationale",), code="string_too_long", message="String should have at most 600 characters"),
    ),
)
ERROR: Final = RunError(
    code="MODEL_RETRIES_EXHAUSTED",
    message="no valid output after 2 attempts",
    address=ADDRESS,
    hint=HINT,
    details=DETAILS,
)
DETAIL_LINES: Final = (
    f"    hint: {HINT}",
    "    agent: qwen, model: openrouter:qwen/qwen3-30b-a3b-instruct-2507, output mode: prompted, attempt: 2",
    "    violation rationale: String should have at most 600 characters",
    '    model output: {"rationale": "long"}',
)


def test_attempt_failure_prints_code_hint_and_details() -> None:
    cause = AttemptCause(
        kind="schema_invalid",
        message="output does not match the schema",
        schema_errors=DETAILS.violations,
        code="MODEL_SCHEMA_MISMATCH",
        hint=HINT,
        details=DETAILS,
    )
    event = NodeAttemptFailed(seq=3, at=AT, run_id=RUN, address=ADDRESS, attempt=1, cause=cause, action="repair")

    assert text_line(event).splitlines() == [
        "↻ judge attempt 1 MODEL_SCHEMA_MISMATCH: output does not match the schema (next: repair)",
        *DETAIL_LINES,
    ]


def test_failed_node_and_run_print_the_hint_under_the_error() -> None:
    finished = NodeFinished(
        seq=4,
        at=AT,
        run_id=RUN,
        address=ADDRESS,
        status="failed",
        attempt=2,
        output_ref=None,
        cost_usd=Decimal(0),
        tokens_in=0,
        tokens_out=0,
        latency_ms=12,
        model=None,
        cache_hit=False,
        degraded=False,
        checks_failed=0,
        error=ERROR,
    )
    run = RunFinished.model_validate(
        {
            "seq": 5,
            "at": AT,
            "run_id": RUN,
            "status": "failed",
            "output_ref": None,
            "error": ERROR.model_dump(mode="json"),
            "cost_usd": "0",
            "tokens_in": 0,
            "tokens_out": 0,
        }
    )

    assert text_line(finished).splitlines() == [
        "■ judge failed 12 ms MODEL_RETRIES_EXHAUSTED: no valid output after 2 attempts",
        *DETAIL_LINES,
    ]
    assert text_line(run).splitlines()[1:] == list(DETAIL_LINES)
