from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Final, Literal

from aqven.engine.addressing import address_key
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.events import (
    InferenceChecksCaptured,
    InferenceInputCaptured,
    InferencePromptCaptured,
    NodeAttemptFailed,
    NodeFinished,
    NodeResumed,
    NodeStarted,
    NodeSuspended,
    RunEvent,
    RunFinished,
    RunStartedEvent,
)
from aqven.runtime.executions import Attempt, CheckOutcome, NodeExecution, PromptTrace, RunError
from aqven.runtime.runs import HumanAnswerStatus, NodeCounts
from aqven.runtime.values import ValueRef
from aqven.runtime.vocabulary import ExecutionStatus
from aqven.spec import NodeKind

EXECUTION_STATUSES: Final[tuple[ExecutionStatus, ...]] = (
    "pending",
    "running",
    "ok",
    "failed",
    "skipped",
    "suspended",
    "cancelled",
)


@dataclass(slots=True)
class ExecutionFold:
    address: ExecutionAddress
    kind: NodeKind
    status: ExecutionStatus = "running"
    attempts_count: int = 1
    started_at: datetime | None = None
    finished_at: datetime | None = None
    latency_ms: int | None = None
    agent: str | None = None
    inference: str | None = None
    input_ref: ValueRef | None = None
    input_stage: Literal["bound", "normalized"] | None = None
    variants: dict[str, str] = field(default_factory=dict[str, str])
    prompt: PromptTrace | None = None
    checks: list[CheckOutcome] = field(default_factory=list[CheckOutcome])
    model: str | None = None
    cost_usd: Decimal = Decimal(0)
    tokens_in: int = 0
    tokens_out: int = 0
    cache_hit: bool = False
    degraded: bool = False
    output_ref: ValueRef | None = None
    error: RunError | None = None
    attempts: list[Attempt] = field(default_factory=list[Attempt])

    def view(self) -> NodeExecution:
        return NodeExecution(
            address=self.address,
            kind=self.kind,
            status=self.status,
            attempts_count=self.attempts_count,
            started_at=self.started_at,
            finished_at=self.finished_at,
            latency_ms=self.latency_ms,
            agent=self.agent,
            inference=self.inference,
            model=self.model,
            profile=None,
            cost_usd=self.cost_usd,
            tokens_in=self.tokens_in,
            tokens_out=self.tokens_out,
            cache_hit=self.cache_hit,
            degraded=self.degraded,
            summary=None,
            input_ref=self.input_ref,
            output_ref=self.output_ref,
            trace_id=None,
            span_id=None,
        )


@dataclass(slots=True)
class RunFold:
    started: RunStartedEvent | None = None
    finished: RunFinished | None = None
    executions: dict[str, ExecutionFold] = field(default_factory=dict[str, ExecutionFold])
    answered: set[tuple[str, int]] = field(default_factory=set[tuple[str, int]])
    last_seq: int = 0

    def apply(self, event: RunEvent) -> None:
        self.last_seq = max(self.last_seq, event.seq)
        match event:
            case RunStartedEvent():
                self.started = event
            case RunFinished():
                self.finished = event
            case NodeStarted():
                self._started(event)
            case InferenceInputCaptured():
                self._input_captured(event)
            case InferencePromptCaptured():
                self._prompt_captured(event)
            case InferenceChecksCaptured():
                self._checks_captured(event)
            case NodeFinished():
                self._finished(event)
            case NodeSuspended():
                self._set_status(event.address, "suspended")
            case NodeResumed():
                self._set_status(event.address, "running")
                self.answered.add((address_key(event.address), event.attempt))
            case NodeAttemptFailed():
                self._attempt_failed(event)
            case _:
                return

    def executions_view(self) -> tuple[NodeExecution, ...]:
        return tuple(fold.view() for fold in self.executions.values())

    def execution(self, address: ExecutionAddress) -> ExecutionFold | None:
        return self.executions.get(address_key(address))

    def node_counts(self) -> NodeCounts:
        statuses = [fold.status for fold in self.executions.values()]
        started = {fold.address.node_id for fold in self.executions.values()}
        order = self.started.order if self.started is not None else ()
        pending = sum(1 for node_id in order if node_id not in started)
        counts = {status: statuses.count(status) for status in EXECUTION_STATUSES}
        return NodeCounts(
            pending=counts["pending"] + pending,
            running=counts["running"],
            ok=counts["ok"],
            failed=counts["failed"],
            skipped=counts["skipped"],
            suspended=counts["suspended"],
            cancelled=counts["cancelled"],
        )

    def answer_statuses(self, answers: Sequence[tuple[ExecutionAddress, int]]) -> tuple[HumanAnswerStatus, ...]:
        return tuple(
            HumanAnswerStatus(
                address=address, attempt=attempt, consumed=(address_key(address), attempt) in self.answered
            )
            for address, attempt in answers
        )

    def _started(self, event: NodeStarted) -> None:
        key = address_key(event.address)
        existing = self.executions.get(key)
        if existing is None:
            self.executions[key] = ExecutionFold(address=event.address, kind=event.kind, started_at=event.at)
            return
        existing.status = "running"
        existing.attempts_count = max(existing.attempts_count, event.attempt)

    def _finished(self, event: NodeFinished) -> None:
        fold = self.executions.get(address_key(event.address))
        if fold is None:
            return
        fold.status = event.status
        fold.attempts_count = max(fold.attempts_count, event.attempt)
        fold.finished_at = event.at
        fold.latency_ms = event.latency_ms
        fold.model = event.model
        fold.cost_usd = event.cost_usd
        fold.tokens_in = event.tokens_in
        fold.tokens_out = event.tokens_out
        fold.cache_hit = event.cache_hit
        fold.degraded = event.degraded
        fold.output_ref = event.output_ref
        fold.error = event.error

    def _input_captured(self, event: InferenceInputCaptured) -> None:
        fold = self.executions.get(address_key(event.address))
        if fold is None or (event.stage == "bound" and fold.input_stage == "normalized"):
            return
        fold.agent = event.agent
        fold.inference = event.inference
        fold.input_ref = event.input_ref
        fold.input_stage = event.stage
        fold.variants = dict(event.variants)

    def _prompt_captured(self, event: InferencePromptCaptured) -> None:
        fold = self.executions.get(address_key(event.address))
        if fold is not None:
            fold.prompt = event.prompt

    def _checks_captured(self, event: InferenceChecksCaptured) -> None:
        fold = self.executions.get(address_key(event.address))
        if fold is not None:
            fold.checks.extend(event.checks)

    def _set_status(self, address: ExecutionAddress, status: ExecutionStatus) -> None:
        fold = self.executions.get(address_key(address))
        if fold is not None:
            fold.status = status

    def _attempt_failed(self, event: NodeAttemptFailed) -> None:
        fold = self.executions.get(address_key(event.address))
        if fold is None:
            return
        fold.attempts.append(
            Attempt(
                attempt=event.attempt,
                cause=event.cause,
                action=event.action,
                model=None,
                latency_ms=None,
                cost_usd=Decimal(0),
                tokens_in=0,
                tokens_out=0,
                prompt_ref=None,
                response_ref=None,
            )
        )


def fold_events(events: Sequence[RunEvent]) -> RunFold:
    fold = RunFold()
    for event in events:
        fold.apply(event)
    return fold
