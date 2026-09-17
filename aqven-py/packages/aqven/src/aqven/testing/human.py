import asyncio
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Final, Self, TypeGuard

from pydantic import BaseModel, JsonValue

from aqven.runtime import ClientOpId, ExecutionAddress, RunId, ScriptedAnswer, ToolApprovalDecision, node_address
from aqven.runtime.human import ResumeRequest, ResumeResult
from aqven.runtime.vocabulary import WaitState

if TYPE_CHECKING:
    from aqven.engine.human import HumanWaits, WaitIndexEntry

RESPONDER_POLL_SECONDS: Final = 0.02
RESPONDER_TIMEOUT_SECONDS: Final = 10.0


class ScriptedAnswerConflict(ValueError):
    def __init__(self, address: ExecutionAddress, attempt: int) -> None:
        super().__init__(f"an answer for {address.model_dump_json()} attempt {attempt} is already scripted")
        self.address = address
        self.attempt = attempt


class WaitNotReached(TimeoutError):
    def __init__(self, run_id: RunId, address: ExecutionAddress, attempt: int, state: WaitState) -> None:
        super().__init__(f"run {run_id} did not reach {state} for {address.model_dump_json()} attempt {attempt}")
        self.run_id = run_id
        self.address = address
        self.attempt = attempt
        self.state = state


def payload_json(payload: BaseModel | Mapping[str, JsonValue]) -> JsonValue:
    if isinstance(payload, BaseModel):
        return payload.model_dump(mode="json", by_alias=True)
    return dict(payload)


def new_client_op_id() -> ClientOpId:
    return ClientOpId(uuid.uuid4().hex)


type AnswerKey = tuple[ExecutionAddress, int]


class ScriptedHuman:
    def __init__(self) -> None:
        self._answers: dict[AnswerKey, ScriptedAnswer] = {}

    def answer(
        self,
        node_id: str,
        payload: BaseModel | Mapping[str, JsonValue],
        *,
        attempt: int = 1,
        branch_key: str | None = None,
        iteration: int | None = None,
        item_index: int | None = None,
    ) -> Self:
        address = node_address(node_id, branch_key=branch_key, iteration=iteration, item_index=item_index)
        return self._put(ScriptedAnswer(address=address, attempt=attempt, payload=payload_json(payload)))

    def approve_tools(
        self,
        node_id: str,
        *,
        approve: bool,
        message: str | None = None,
        attempt: int = 1,
        branch_key: str | None = None,
    ) -> Self:
        decision = ToolApprovalDecision(approve=approve, message=message)
        return self.answer(node_id, decision, attempt=attempt, branch_key=branch_key)

    def answers(self) -> tuple[ScriptedAnswer, ...]:
        return tuple(self._answers.values())

    def _put(self, answer: ScriptedAnswer) -> Self:
        key = (answer.address, answer.attempt)
        if key in self._answers:
            raise ScriptedAnswerConflict(answer.address, answer.attempt)
        self._answers[key] = answer
        return self


def wait_matches(entry: WaitIndexEntry | None, attempt: int, state: WaitState) -> TypeGuard[WaitIndexEntry]:
    return entry is not None and entry.attempt == attempt and entry.state == state


@dataclass(frozen=True, slots=True)
class HumanResponder:
    waits: HumanWaits
    poll_seconds: float = RESPONDER_POLL_SECONDS
    timeout_seconds: float = RESPONDER_TIMEOUT_SECONDS

    async def reached(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        *,
        attempt: int = 1,
        state: WaitState = "waiting",
    ) -> WaitIndexEntry:
        deadline = time.monotonic() + self.timeout_seconds
        while time.monotonic() < deadline:
            entry = await self.waits.index.find(run_id, address)
            if wait_matches(entry, attempt, state):
                return entry
            await asyncio.sleep(self.poll_seconds)
        raise WaitNotReached(run_id, address, attempt, state)

    async def respond(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        payload: BaseModel | Mapping[str, JsonValue],
        *,
        attempt: int = 1,
        client_op_id: ClientOpId | None = None,
    ) -> ResumeResult:
        await self.reached(run_id, address, attempt=attempt)
        request = ResumeRequest(
            address=address,
            attempt=attempt,
            payload=payload_json(payload),
            client_op_id=client_op_id or new_client_op_id(),
        )
        return await self.waits.resume(run_id, request)
