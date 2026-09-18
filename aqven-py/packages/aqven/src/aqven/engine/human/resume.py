import asyncio
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final, Protocol

from aqven.engine.human.forms import FormModel, FormRegistry, FormRejected, prefixed_problems
from aqven.engine.human.index import (
    WaitIndex,
    WaitIndexEntry,
    WaitQuery,
    entry_wait,
    index_entry,
    open_wait_query,
    run_order,
)
from aqven.engine.human.records import AnswerEnvelope, WaitRecord, human_wait_detail
from aqven.ports.engine import EngineError
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.human import HumanWait, HumanWaitDetail, OpenWaitFilter, ResumeRequest, ResumeResult
from aqven.runtime.vocabulary import ResumeOutcome, RunStatus, WaitState

CONFIRM_WINDOW_SECONDS: Final = 5.0
CONFIRM_POLL_SECONDS: Final = 0.05
PAYLOAD_PATH: Final = ("payload",)


class AnswerChannel(Protocol):
    async def read(self, workflow_id: str, address: ExecutionAddress) -> WaitRecord | None: ...

    async def send(self, workflow_id: str, topic: str, envelope: AnswerEnvelope) -> None: ...


class RunStatusSource(Protocol):
    async def status(self, run_id: RunId) -> RunStatus: ...


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class ResumeCheck:
    request: ResumeRequest
    record: WaitRecord
    now: datetime
    form: FormModel


type ResumeGuard = Callable[[ResumeCheck], EngineError | None]

SETTLED_WAITS: Final[Mapping[WaitState, Callable[[], EngineError]]] = {
    "resolved": lambda: EngineError("ALREADY_RESUMED", "wait is already resolved by another answer"),
    "timed_out": lambda: EngineError("RUN_TIMED_OUT", "wait deadline passed, the on_timeout policy was applied"),
}


def settled_error(state: WaitState) -> EngineError | None:
    settled = SETTLED_WAITS.get(state)
    return None if settled is None else settled()


def reject_settled(check: ResumeCheck) -> EngineError | None:
    return settled_error(check.record.state)


def reject_stale_attempt(check: ResumeCheck) -> EngineError | None:
    if check.request.attempt == check.record.attempt:
        return None
    return EngineError(
        "WAIT_ATTEMPT_STALE",
        f"form was rendered for attempt {check.request.attempt}, but attempt {check.record.attempt} is waiting",
        details={"attempt": check.record.attempt, "assignee": check.record.assignee},
    )


def reject_past_deadline(check: ResumeCheck) -> EngineError | None:
    if check.now <= check.record.deadline_at:
        return None
    return EngineError(
        "RUN_TIMED_OUT",
        "wait deadline passed, the workflow will apply the on_timeout policy",
        details={"on_timeout": check.record.on_timeout},
    )


def reject_invalid_payload(check: ResumeCheck) -> EngineError | None:
    verdict = check.form.check(check.request.payload)
    if not isinstance(verdict, FormRejected):
        return None
    problems = prefixed_problems(verdict.problems, PAYLOAD_PATH)
    return EngineError("INPUT_INVALID", "payload does not match the form model", problems=problems)


RESUME_GUARDS: Final[tuple[ResumeGuard, ...]] = (
    reject_settled,
    reject_stale_attempt,
    reject_past_deadline,
    reject_invalid_payload,
)


def first_rejection(check: ResumeCheck) -> EngineError | None:
    rejections = (guard(check) for guard in RESUME_GUARDS)
    return next((rejection for rejection in rejections if rejection is not None), None)


type Confirmation = ResumeOutcome | EngineError | None


def confirmation(current: WaitRecord, request: ResumeRequest) -> Confirmation:
    if current.resolved_by == request.client_op_id:
        return "accepted"
    ignored = next((item for item in current.ignored_answers if item.client_op_id == request.client_op_id), None)
    if ignored is not None:
        return EngineError("INPUT_INVALID", "workflow discarded the answer", problems=ignored.problems)
    if current.attempt != request.attempt:
        return EngineError("RUN_TIMED_OUT", "attempt changed while the answer was on its way to the workflow")
    return settled_error(current.state)


def not_waiting(run_id: RunId, address: ExecutionAddress) -> EngineError:
    return EngineError(
        "NOT_WAITING",
        f"run {run_id} is not waiting for a human answer at {address.node_id}",
        details={"address": address.model_dump(mode="json")},
    )


@dataclass(frozen=True, slots=True)
class HumanWaits:
    index: WaitIndex
    channel: AnswerChannel
    forms: FormRegistry
    statuses: RunStatusSource
    clock: Callable[[], datetime] = utc_now
    confirm_window_seconds: float = CONFIRM_WINDOW_SECONDS
    confirm_poll_seconds: float = CONFIRM_POLL_SECONDS

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        entry, record = await self._located(run_id, request.address)
        if record.resolved_by == request.client_op_id:
            return await self._result(run_id, request, "replayed")
        check = ResumeCheck(request, record, self.clock(), self.forms.form(record.form_type_id))
        rejection = first_rejection(check)
        if rejection is not None:
            raise rejection
        envelope = AnswerEnvelope(payload=request.payload, idempotency_key=request.client_op_id, sent_at=check.now)
        await self.channel.send(entry.workflow_id, record.topic, envelope)
        outcome = await self._confirm(entry, request)
        return await self._result(run_id, request, outcome)

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        entries = await self.index.search(WaitQuery(run_id=run_id))
        return tuple(entry_wait(entry) for entry in entries)

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        _, record = await self._located(run_id, address)
        return human_wait_detail(record)

    async def open_waits(self, query: WaitQuery) -> tuple[WaitIndexEntry, ...]:
        return await self.index.search(query)

    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]:
        return run_order(await self.index.search(open_wait_query(wanted)))

    async def _located(self, run_id: RunId, address: ExecutionAddress) -> tuple[WaitIndexEntry, WaitRecord]:
        entry = await self._entry(run_id, address)
        if entry is None:
            raise not_waiting(run_id, address)
        record = await self._record_of(entry)
        if record is None:
            raise not_waiting(run_id, address)
        return entry, record

    async def _entry(self, run_id: RunId, address: ExecutionAddress) -> WaitIndexEntry | None:
        entry = await self.index.find(run_id, address)
        if entry is not None:
            return entry
        copied = await self.channel.read(run_id, address)
        if copied is None:
            return None
        return index_entry(copied).model_copy(update={"run_id": run_id, "workflow_id": run_id})

    async def _record_of(self, entry: WaitIndexEntry) -> WaitRecord | None:
        return await self.channel.read(entry.workflow_id, entry.address)

    async def _confirm(self, entry: WaitIndexEntry, request: ResumeRequest) -> ResumeOutcome:
        deadline = time.monotonic() + self.confirm_window_seconds
        while time.monotonic() < deadline:
            current = await self._record_of(entry)
            confirmed = None if current is None else confirmation(current, request)
            if isinstance(confirmed, EngineError):
                raise confirmed
            if confirmed is not None:
                return confirmed
            await asyncio.sleep(self.confirm_poll_seconds)
        return "sent"

    async def _result(self, run_id: RunId, request: ResumeRequest, outcome: ResumeOutcome) -> ResumeResult:
        status = await self.statuses.status(run_id)
        return ResumeResult(outcome=outcome, status=status, address=request.address, attempt=request.attempt)
