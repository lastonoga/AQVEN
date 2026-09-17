from datetime import UTC, datetime
from decimal import Decimal
from typing import Final, get_args

import pytest
from pydantic import ValidationError

from aqven.engine.interpreter import NodeFinishedBuilder, RunFinishedBuilder, record_of
from aqven.engine.request import RunUsageTotals
from aqven.ports.execution import EventStamp, NodeFailed, NodeSucceeded
from aqven.runtime import (
    MODEL_OUTPUT_ERROR_CODES,
    RAW_EXCERPT_LIMIT,
    RUN_EVENT_ADAPTER,
    AttemptCause,
    ModelErrorDetails,
    ModelOutputErrorCode,
    NodeAttemptFailed,
    NodeFinished,
    Problem,
    RunError,
    RunFinished,
    RunId,
    excerpt_of,
    node_address,
)

RUN: Final = RunId("run-1")
STAMP: Final = EventStamp(run_id=RUN, seq=3, at=datetime(2026, 9, 17, tzinfo=UTC))
ADDRESS: Final = node_address("classify")
HINT: Final = "set output.mode: prompted in agents/classifier.yaml"


def schema_error() -> RunError:
    return RunError(
        code="MODEL_SCHEMA_MISMATCH",
        message="model output does not match CaseRequest",
        address=ADDRESS,
        hint=HINT,
        details=ModelErrorDetails(
            agent="classifier",
            model="openrouter:openai/gpt-5-nano",
            output_mode="tool",
            attempt=2,
            raw_excerpt='{"priority": "urgent"}',
            violations=(Problem(path=("priority",), code="literal_error", message="expected low or high"),),
        ),
    )


def test_structured_output_codes_are_listed() -> None:
    assert frozenset(get_args(ModelOutputErrorCode.__value__)) == MODEL_OUTPUT_ERROR_CODES
    assert "MODEL_RETRIES_EXHAUSTED" in MODEL_OUTPUT_ERROR_CODES


def test_plain_run_error_stays_compatible() -> None:
    error = RunError.model_validate({"code": "NODE_ERROR", "message": "boom", "address": None})

    assert (error.hint, error.details) == (None, None)


def test_attempt_failed_event_carries_hint_and_details() -> None:
    error = schema_error()
    event = NodeAttemptFailed(
        seq=2,
        at=STAMP.at,
        run_id=RUN,
        address=ADDRESS,
        attempt=2,
        cause=AttemptCause(
            kind="schema_invalid",
            message=error.message,
            schema_errors=(),
            code=error.code,
            hint=error.hint,
            details=error.details,
        ),
        action="retry",
    )

    restored = RUN_EVENT_ADAPTER.validate_json(RUN_EVENT_ADAPTER.dump_json(event))

    assert isinstance(restored, NodeAttemptFailed)
    assert (restored.cause.code, restored.cause.hint, restored.cause.details) == (error.code, HINT, error.details)


def test_node_finished_and_run_finished_carry_the_node_error() -> None:
    failed = NodeFailed(error=schema_error(), attempt=2, model="openrouter:openai/gpt-5-nano")

    finished = NodeFinishedBuilder(ADDRESS, failed, 2, 15)(STAMP)
    run_finished = RunFinishedBuilder(record_of(failed, RunUsageTotals()))(STAMP)

    assert isinstance(finished, NodeFinished) and finished.error == failed.error
    assert isinstance(run_finished, RunFinished) and run_finished.error == failed.error
    payload = RUN_EVENT_ADAPTER.dump_python(finished, mode="json")
    assert payload["error"]["details"]["output_mode"] == "tool"
    assert payload["error"]["hint"] == HINT


def test_successful_node_finished_has_no_error() -> None:
    finished = NodeFinishedBuilder(ADDRESS, NodeSucceeded(output={"ok": True}), 1, 3)(STAMP)

    assert isinstance(finished, NodeFinished) and finished.error is None
    assert finished.cost_usd == Decimal(0)


def test_raw_excerpt_is_bounded() -> None:
    text = "x" * (RAW_EXCERPT_LIMIT + 10)

    assert len(excerpt_of(text)) == RAW_EXCERPT_LIMIT
    with pytest.raises(ValidationError):
        ModelErrorDetails(raw_excerpt=text)
