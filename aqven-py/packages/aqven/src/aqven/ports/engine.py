from collections.abc import AsyncIterator
from typing import Annotated, Final, Literal, Protocol

from pydantic import Field

from aqven.runtime.address import ExecutionAddress, JsonObject, Problem, RequestModel, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkRequest,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
)
from aqven.runtime.vocabulary import ExecutionStatus, IncludePayloads, RunMode, RunStatus
from aqven.spec import FlowId

DEFAULT_PAGE_LIMIT: Final = 20
MAX_PAGE_LIMIT: Final = 200

type EngineErrorCode = Literal[
    "NOT_FOUND",
    "INPUT_INVALID",
    "NOT_RUNNABLE",
    "VIEW_TOO_BROAD",
    "RUN_STATE_CONFLICT",
    "ALREADY_RESUMED",
    "NOT_WAITING",
    "WAIT_ATTEMPT_STALE",
    "RUN_TIMED_OUT",
    "INTERNAL",
]


class EngineError(Exception):
    def __init__(
        self,
        code: EngineErrorCode,
        message: str,
        *,
        problems: tuple[Problem, ...] = (),
        details: JsonObject | None = None,
    ) -> None:
        super().__init__(f"{code}: {message}")
        self.code: EngineErrorCode = code
        self.message = message
        self.problems = problems
        self.details = details


class RunListQuery(RequestModel):
    flow_id: FlowId | None = None
    status: RunStatus | None = None
    mode: RunMode | None = None
    assignee: str | None = None
    parent_run_id: RunId | None = None
    cursor: str | None = None
    limit: Annotated[int, Field(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT


class ExecutionQuery(RequestModel):
    node_id: str | None = None
    status: ExecutionStatus | None = None


class EventLogQuery(RequestModel):
    after_seq: Annotated[int, Field(ge=0)] = 0
    limit: Annotated[int, Field(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT


class EngineFacade(Protocol):
    async def start_run(self, request: RunStartRequest) -> RunStarted: ...

    async def get_run(self, run_id: RunId) -> RunSnapshot: ...

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]: ...

    def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]: ...

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]: ...

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]: ...

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail: ...

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult: ...

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked: ...

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult: ...

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]: ...

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail: ...
