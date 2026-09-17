from collections.abc import AsyncGenerator, AsyncIterator, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Final

from pydantic import JsonValue, TypeAdapter

from aqven.client import AqvenClient, new_client_op_id
from aqven.runtime import (
    ExecutionAddress,
    ForkRequest,
    HumanWait,
    HumanWaitDetail,
    Page,
    ResumeRequest,
    ResumeResult,
    RunEvent,
    RunForked,
    RunId,
    RunStarted,
    RunStartRequest,
    RunSummary,
    ScriptedAnswer,
)
from aqven.spec import FlowId
from lumen.types import CaseRequest

FLOW_ID: Final = FlowId("support_case")
STOP_EVENTS: Final = frozenset({"run_suspended", "run_finished"})
SCRIPTED_ANSWERS: Final = TypeAdapter(tuple[ScriptedAnswer, ...])


class FormMissing(Exception):
    def __init__(self, run_id: RunId, address: ExecutionAddress) -> None:
        super().__init__(f"execution {address.node_id} of run {run_id} is not waiting for a form answer")
        self.run_id = run_id
        self.address = address


def read_answers(path: Path) -> tuple[ScriptedAnswer, ...]:
    return SCRIPTED_ANSWERS.validate_json(path.read_bytes())


async def start_case(client: AqvenClient, request: CaseRequest, answers: Sequence[ScriptedAnswer]) -> RunStarted:
    body = RunStartRequest(
        flow_id=FLOW_ID,
        mode="live",
        input=request.model_dump(mode="json", by_alias=True),
        human_answers=tuple(answers) or None,
    )
    return await client.start_run(body)


@asynccontextmanager
async def closing(events: AsyncIterator[RunEvent]) -> AsyncGenerator[AsyncIterator[RunEvent]]:
    try:
        yield events
    finally:
        if isinstance(events, AsyncGenerator):
            await events.aclose()


async def wait_for_forms(client: AqvenClient, run_id: RunId, after_seq: int) -> tuple[HumanWait, ...]:
    async with closing(client.run_events(run_id, after_seq=after_seq)) as events:
        async for event in events:
            if event.type in STOP_EVENTS:
                break
    snapshot = await client.get_run(run_id)
    return snapshot.waits


async def open_form(client: AqvenClient, run_id: RunId, wait: HumanWait) -> HumanWaitDetail:
    detail = await client.get_execution(run_id, wait.address)
    if detail.human is None:
        raise FormMissing(run_id, wait.address)
    return detail.human


async def answer(client: AqvenClient, run_id: RunId, wait: HumanWait, payload: JsonValue) -> ResumeResult:
    request = ResumeRequest(
        address=wait.address,
        attempt=wait.attempt,
        payload=payload,
        client_op_id=new_client_op_id(),
    )
    return await client.resume(run_id, request)


async def inbox(client: AqvenClient, assignee: str) -> Page[RunSummary]:
    return await client.list_runs(status="suspended", assignee=assignee)


async def fork_at(client: AqvenClient, run_id: RunId, address: ExecutionAddress) -> RunForked:
    return await client.fork(run_id, ForkRequest(from_=address))
