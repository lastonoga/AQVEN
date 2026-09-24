from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from functools import reduce
from typing import Final

from pydantic import Field, JsonValue

from aqven.engine.addressing import address_key
from aqven.engine.request import RunRecord
from aqven.ir import CompiledFlow
from aqven.runtime.address import ExecutionAddress, JsonObject
from aqven.runtime.events import (
    InferenceChecksCaptured,
    NodeAttemptFailed,
    NodeFinished,
    NodeStarted,
    RunEvent,
)
from aqven.runtime.executions import RunError
from aqven.runtime.values import InlineValue
from aqven.runtime.vocabulary import TerminalRunStatus
from aqven.series.model import COUNTED_OUTCOMES, OutcomeClass, RecordModel, RuntimeCheckTry
from aqven.spec import NodeId, NodeKind

SCHEMA_CAUSES: Final = frozenset({"schema_invalid", "invalid_json", "no_structured_output"})
USAGE_KINDS: Final = frozenset({NodeKind.LLM, NodeKind.CODE, NodeKind.TOOL, NodeKind.HUMAN})
FIRST_ATTEMPT: Final = 1
ZERO: Final = Decimal(0)
PROVIDER_ERROR: Final = "provider_error"
TOO_MANY_REQUESTS: Final = 429

OUTCOME_BY_CODE: Final[Mapping[str, OutcomeClass]] = {
    "MODEL_NO_STRUCTURED_OUTPUT": OutcomeClass.SCHEMA_INVALID,
    "MODEL_INVALID_JSON": OutcomeClass.SCHEMA_INVALID,
    "MODEL_SCHEMA_MISMATCH": OutcomeClass.SCHEMA_INVALID,
    "MODEL_RETRIES_EXHAUSTED": OutcomeClass.SCHEMA_INVALID,
    "OUTPUT_SCHEMA_REJECTED": OutcomeClass.SCHEMA_INVALID,
    "output_invalid": OutcomeClass.SCHEMA_INVALID,
    "check_failed": OutcomeClass.MODEL_FAIL,
    "truncated": OutcomeClass.MODEL_FAIL,
    "refusal": OutcomeClass.REFUSAL,
    "budget_exceeded": OutcomeClass.BUDGET_CUT,
    "provider_error": OutcomeClass.INFRA_ERROR,
    "timeout": OutcomeClass.INFRA_ERROR,
    "MODEL_STREAM_STALLED": OutcomeClass.INFRA_ERROR,
    "provider_key_missing": OutcomeClass.INFRA_ERROR,
    "MODEL_FEATURE_UNSUPPORTED": OutcomeClass.INFRA_ERROR,
    "cassette_miss": OutcomeClass.INFRA_ERROR,
    "media_unavailable": OutcomeClass.INFRA_ERROR,
    "INTERNAL": OutcomeClass.INFRA_ERROR,
    "PLAN_MISSING": OutcomeClass.INFRA_ERROR,
    "FLOW_NOT_FOUND": OutcomeClass.INFRA_ERROR,
    "INPUT_INVALID": OutcomeClass.INFRA_ERROR,
    "HUMAN_TIMED_OUT": OutcomeClass.INFRA_ERROR,
    "code_invalid": OutcomeClass.INFRA_ERROR,
    "prompt_invalid": OutcomeClass.INFRA_ERROR,
    "RETURNS_UNRESOLVED": OutcomeClass.INFRA_ERROR,
}


def failed_outcome(record: RunRecord) -> OutcomeClass:
    code = None if record.error is None else record.error.code
    return OUTCOME_BY_CODE.get(code or "", OutcomeClass.INFRA_ERROR)


def completed_outcome(record: RunRecord) -> OutcomeClass:
    return OutcomeClass.OK


def cancelled_outcome(record: RunRecord) -> OutcomeClass:
    return OutcomeClass.CANCELLED


OUTCOME_BY_STATUS: Final[Mapping[TerminalRunStatus, Callable[[RunRecord], OutcomeClass]]] = {
    "completed": completed_outcome,
    "failed": failed_outcome,
    "cancelled": cancelled_outcome,
}


def outcome_of(record: RunRecord) -> OutcomeClass:
    return OUTCOME_BY_STATUS[record.status](record)


class RunFacts(RecordModel):
    outcome: OutcomeClass
    error_code: str | None = None
    error_message: str | None = None
    first_failed_node: str | None = None
    cost_usd: Decimal = ZERO
    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    unpriced_calls: int = Field(default=0, ge=0)
    latency_ms: int | None = None
    wait_ms: int = Field(default=0, ge=0)
    models: dict[str, str] = Field(default_factory=dict[str, str])
    schema_valid_first_try: bool | None = None
    runtime_checks: tuple[RuntimeCheckTry, ...] = ()
    rate_limited: bool = False


class AttemptInspection(RunFacts):
    judge_inputs: dict[str, JsonObject] = Field(default_factory=dict[str, JsonObject])


@dataclass(frozen=True, slots=True)
class RunTrace:
    events: tuple[RunEvent, ...]
    flow: CompiledFlow

    def finished(self) -> Iterator[NodeFinished]:
        return (event for event in self.events if isinstance(event, NodeFinished))

    def kinds(self) -> Mapping[str, NodeKind]:
        return {address_key(event.address): event.kind for event in self.events if isinstance(event, NodeStarted)}

    def usage_nodes(self) -> tuple[NodeFinished, ...]:
        kinds = self.kinds()
        return tuple(event for event in self.finished() if kinds.get(address_key(event.address)) in USAGE_KINDS)

    def llm_nodes(self) -> tuple[NodeFinished, ...]:
        kinds = self.kinds()
        return tuple(event for event in self.finished() if kinds.get(address_key(event.address)) is NodeKind.LLM)

    def top_nodes(self) -> tuple[NodeFinished, ...]:
        return tuple(event for event in self.finished() if is_top_level(self.flow, event.address))

    def top_outputs(self) -> dict[NodeId, JsonValue]:
        return {
            NodeId(event.address.node_id): event.output_ref.value
            for event in self.top_nodes()
            if event.status == "ok" and isinstance(event.output_ref, InlineValue)
        }


def is_top_level(flow: CompiledFlow, address: ExecutionAddress) -> bool:
    nested = (address.branch_key, address.iteration, address.item_index)
    return address.node_id in flow.order and all(part is None for part in nested)


@dataclass(frozen=True, slots=True)
class RunSpend:
    cost_usd: Decimal = ZERO
    unpriced_calls: int = 0

    def plus(self, other: RunSpend) -> RunSpend:
        return RunSpend(
            cost_usd=self.cost_usd + other.cost_usd, unpriced_calls=self.unpriced_calls + other.unpriced_calls
        )


NO_SPEND: Final = RunSpend()


def total_spend(spends: Iterable[RunSpend]) -> RunSpend:
    return reduce(RunSpend.plus, spends, NO_SPEND)


def summed_cost(trace: RunTrace, record: RunRecord) -> tuple[Decimal, int, int]:
    if record.status == "completed":
        return record.usage.cost_usd, record.usage.tokens_in, record.usage.tokens_out
    nodes = trace.usage_nodes()
    return (
        sum((event.cost_usd for event in nodes), ZERO),
        sum(event.tokens_in for event in nodes),
        sum(event.tokens_out for event in nodes),
    )


def summed_unpriced(trace: RunTrace, record: RunRecord) -> int:
    if record.status == "completed":
        return record.usage.unpriced_calls
    return sum(event.unpriced_calls for event in trace.usage_nodes())


def working_latency(trace: RunTrace) -> int | None:
    nodes = trace.top_nodes()
    if not nodes:
        return None
    return sum(max(0, event.latency_ms - event.wait_ms) for event in nodes)


def waited(trace: RunTrace) -> int:
    return sum(event.wait_ms for event in trace.top_nodes())


def actual_models(trace: RunTrace) -> dict[str, str]:
    return {event.address.node_id: event.model for event in trace.llm_nodes() if event.model is not None}


def first_failed_node(trace: RunTrace, record: RunRecord) -> str | None:
    if record.error is not None and record.error.address is not None:
        return record.error.address.node_id
    failed = next((event for event in trace.finished() if event.status == "failed"), None)
    return None if failed is None else failed.address.node_id


def schema_valid_first_try(trace: RunTrace, outcome: OutcomeClass) -> bool | None:
    if outcome not in COUNTED_OUTCOMES:
        return None
    broken = any(
        event.attempt == FIRST_ATTEMPT and event.cause.kind in SCHEMA_CAUSES
        for event in trace.events
        if isinstance(event, NodeAttemptFailed)
    )
    return not broken


def runtime_checks(events: Sequence[RunEvent]) -> tuple[RuntimeCheckTry, ...]:
    failed: dict[str, bool] = {}
    captured = (outcome for event in events if isinstance(event, InferenceChecksCaptured) for outcome in event.checks)
    for outcome in captured:
        first_failure = outcome.attempt == FIRST_ATTEMPT and not outcome.passed
        failed[outcome.check] = failed.get(outcome.check, False) or first_failure
    return tuple(RuntimeCheckTry(check=name, failed_first_try=value) for name, value in sorted(failed.items()))


def rate_limit_error(error: RunError | None) -> bool:
    if error is None or error.details is None:
        return False
    return error.code == PROVIDER_ERROR and error.details.status_code == TOO_MANY_REQUESTS


def rate_limited(trace: RunTrace, record: RunRecord) -> bool:
    if record.status != "failed":
        return False
    errors = (record.error, *(event.error for event in trace.finished() if event.status == "failed"))
    return any(rate_limit_error(error) for error in errors)


def run_facts(trace: RunTrace, record: RunRecord) -> RunFacts:
    outcome = outcome_of(record)
    cost, tokens_in, tokens_out = summed_cost(trace, record)
    return RunFacts(
        outcome=outcome,
        error_code=None if record.error is None else record.error.code,
        error_message=None if record.error is None else record.error.message,
        first_failed_node=first_failed_node(trace, record),
        cost_usd=cost,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        unpriced_calls=summed_unpriced(trace, record),
        latency_ms=working_latency(trace),
        wait_ms=waited(trace),
        models=actual_models(trace),
        schema_valid_first_try=schema_valid_first_try(trace, outcome),
        runtime_checks=runtime_checks(trace.events),
        rate_limited=rate_limited(trace, record),
    )


def inspection_of(facts: RunFacts, judge_inputs: Mapping[str, JsonObject]) -> AttemptInspection:
    return AttemptInspection(**facts.model_dump(), judge_inputs=dict(judge_inputs))


def event_spend(events: Sequence[RunEvent]) -> RunSpend:
    kinds = {address_key(event.address): event.kind for event in events if isinstance(event, NodeStarted)}
    finished = [event for event in events if isinstance(event, NodeFinished)]
    billed = [event for event in finished if kinds.get(address_key(event.address)) in USAGE_KINDS]
    return RunSpend(
        cost_usd=sum((event.cost_usd for event in billed), ZERO),
        unpriced_calls=sum(event.unpriced_calls for event in billed),
    )
