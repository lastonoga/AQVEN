from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from mcp_support import MOMENT, RUN_ID, FakeEngine, call, mcp_client, shop_copy, snapshot, structured

from aqven.runtime.address import Problem, RunId, node_address
from aqven.runtime.events import NodeAttemptFailed, RunEvent
from aqven.runtime.executions import AttemptCause, ModelErrorDetails, RunError
from aqven.runtime.runs import RunSnapshot
from aqven.spec import NodeId

ADDRESS: Final = node_address(NodeId("judge"))
DETAILS: Final = ModelErrorDetails(
    agent="qwen",
    model="openrouter:qwen/qwen3-30b-a3b-instruct-2507",
    output_mode="tool",
    attempt=2,
    raw_excerpt='{"label": "refund"}',
    violations=(Problem(path=("rationale",), code="string_too_long", message="String should have at most 600"),),
)
HINT: Final = "set output.mode: prompted in agents/qwen.yaml"
ERROR: Final = RunError(
    code="MODEL_RETRIES_EXHAUSTED", message="no valid output", address=ADDRESS, hint=HINT, details=DETAILS
)
ATTEMPT: Final = NodeAttemptFailed(
    seq=1,
    at=MOMENT,
    run_id=RUN_ID,
    address=ADDRESS,
    attempt=1,
    cause=AttemptCause(
        kind="no_structured_output",
        message="model answered with text instead of calling the output tool",
        schema_errors=(),
        code="MODEL_NO_STRUCTURED_OUTPUT",
        hint=HINT,
        details=DETAILS,
    ),
    action="repair",
)


@dataclass
class FailedRunEngine(FakeEngine):
    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return snapshot(len(self.log)).model_copy(update={"status": "failed", "error": ERROR})


@pytest.mark.asyncio
async def test_run_get_returns_the_model_error_code_hint_and_details(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path), engine=FailedRunEngine()) as client:
        result = await call(client, "run_get", {"run_id": RUN_ID})

    error = structured(result)["error"]
    assert isinstance(error, dict)
    assert (error["code"], error["hint"]) == ("MODEL_RETRIES_EXHAUSTED", HINT)
    assert error["details"] == DETAILS.model_dump(mode="json")


@pytest.mark.asyncio
async def test_run_events_return_attempt_failures_with_their_cause(tmp_path: Path) -> None:
    log: tuple[RunEvent, ...] = (ATTEMPT,)
    async with mcp_client(shop_copy(tmp_path), engine=FakeEngine(log=log)) as client:
        result = await call(client, "run_events", {"run_id": RUN_ID, "after_seq": 0, "limit": 5})

    items = structured(result)["items"]
    assert isinstance(items, list)
    (event,) = items
    assert isinstance(event, dict)
    cause = event["cause"]
    assert isinstance(cause, dict)
    assert (event["type"], cause["code"], cause["hint"]) == ("node_attempt_failed", "MODEL_NO_STRUCTURED_OUTPUT", HINT)
