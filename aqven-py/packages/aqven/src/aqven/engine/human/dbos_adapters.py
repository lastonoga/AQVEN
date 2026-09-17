import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final, Protocol

from dbos import DBOS, DBOSClient, StepOptions, WorkflowStatus

from aqven.engine.human.index import WaitIndex, WaitQuery, index_entry
from aqven.engine.human.keys import HUMAN_EVENT, wait_event_key
from aqven.engine.human.records import RECORD_ADAPTER, AnswerEnvelope, WaitRecord, record_json
from aqven.ports.engine import EngineError
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.vocabulary import RunStatus

CLOCK_STEP_NAME: Final = "aqven.human.clock"
INDEX_STEP_NAME: Final = "aqven.human.index"
CLOCK_STEP: Final[StepOptions] = {"name": CLOCK_STEP_NAME}
INDEX_STEP: Final[StepOptions] = {"name": INDEX_STEP_NAME}
NO_WAIT: Final = 0.0

DBOS_RUN_STATUSES: Final[Mapping[str, RunStatus]] = {
    "DELAYED": "queued",
    "ENQUEUED": "queued",
    "PENDING": "running",
    "SUCCESS": "completed",
    "ERROR": "failed",
    "CANCELLED": "cancelled",
    "MAX_RECOVERY_ATTEMPTS_EXCEEDED": "failed",
}


class OutsideWorkflow(RuntimeError):
    def __init__(self) -> None:
        super().__init__("a human wait can open only inside a DBOS workflow")


def epoch_datetime(epoch: float) -> datetime:
    return datetime.fromtimestamp(epoch, UTC)


def optional_record(value: object) -> WaitRecord | None:
    if value is None:
        return None
    return RECORD_ADAPTER.validate_python(value)


@dataclass(frozen=True, slots=True)
class DbosWaitJournal:
    index: WaitIndex

    def workflow_id(self) -> str:
        workflow_id = DBOS.workflow_id
        if workflow_id is None:
            raise OutsideWorkflow()
        return workflow_id

    async def now(self) -> datetime:
        epoch = await DBOS.run_step_async(CLOCK_STEP, time.time)
        return epoch_datetime(epoch)

    async def publish(self, record: WaitRecord) -> None:
        value = record_json(record)
        await DBOS.set_event_async(HUMAN_EVENT, value)
        await DBOS.set_event_async(wait_event_key(record.address), value)
        await DBOS.run_step_async(INDEX_STEP, self.index.record, index_entry(record))

    async def receive(self, topic: str, timeout_seconds: float) -> object:
        message: object = await DBOS.recv_async(topic, timeout_seconds)
        return message

    async def deliver(self, topic: str, envelope: AnswerEnvelope) -> None:
        message = envelope.model_dump(mode="json")
        await DBOS.send_async(self.workflow_id(), message, topic, idempotency_key=envelope.idempotency_key)


@dataclass(frozen=True, slots=True)
class DbosClientAnswerChannel:
    client: DBOSClient

    async def read(self, workflow_id: str, address: ExecutionAddress) -> WaitRecord | None:
        value: object = await self.client.get_event_async(workflow_id, wait_event_key(address), NO_WAIT)
        return optional_record(value)

    async def send(self, workflow_id: str, topic: str, envelope: AnswerEnvelope) -> None:
        message = envelope.model_dump(mode="json")
        await self.client.send_async(workflow_id, message, topic, envelope.idempotency_key)


@dataclass(frozen=True, slots=True)
class DbosAnswerChannel:
    async def read(self, workflow_id: str, address: ExecutionAddress) -> WaitRecord | None:
        value: object = await DBOS.get_event_async(workflow_id, wait_event_key(address), NO_WAIT)
        return optional_record(value)

    async def send(self, workflow_id: str, topic: str, envelope: AnswerEnvelope) -> None:
        message = envelope.model_dump(mode="json")
        await DBOS.send_async(workflow_id, message, topic, idempotency_key=envelope.idempotency_key)


class WorkflowStatusReader(Protocol):
    async def __call__(self, workflow_id: str) -> str | None: ...


def first_status(statuses: list[WorkflowStatus]) -> str | None:
    return next((status.status for status in statuses), None)


@dataclass(frozen=True, slots=True)
class DbosClientStatusReader:
    client: DBOSClient

    async def __call__(self, workflow_id: str) -> str | None:
        statuses = await self.client.list_workflows_async(
            workflow_ids=[workflow_id], load_input=False, load_output=False
        )
        return first_status(statuses)


@dataclass(frozen=True, slots=True)
class DbosStatusReader:
    async def __call__(self, workflow_id: str) -> str | None:
        statuses = await DBOS.list_workflows_async(workflow_ids=[workflow_id], load_input=False, load_output=False)
        return first_status(statuses)


def run_not_found(run_id: RunId) -> EngineError:
    return EngineError("NOT_FOUND", f"run {run_id} not found")


@dataclass(frozen=True, slots=True)
class IndexedRunStatus:
    read: WorkflowStatusReader
    index: WaitIndex

    async def status(self, run_id: RunId) -> RunStatus:
        raw = await self.read(run_id)
        if raw is None:
            raise run_not_found(run_id)
        status = DBOS_RUN_STATUSES[raw]
        if status != "running":
            return status
        waiting = await self.index.search(WaitQuery(run_id=run_id, limit=1))
        return "suspended" if waiting else status
