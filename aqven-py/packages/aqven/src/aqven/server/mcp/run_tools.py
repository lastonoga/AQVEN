from dataclasses import dataclass
from typing import Annotated, Final

from pydantic import Field

from aqven.ports.engine import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, EngineFacade, EventLogQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, RequestModel, RunId, node_address
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail
from aqven.runtime.human import ResumeRequest, ResumeResult
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkBase,
    ForkOverrides,
    ForkRequest,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
)
from aqven.runtime.vocabulary import IncludePayloads
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration

RUN_EVENTS_PAGE: Final = Page[RunEvent]
RUN_SUMMARY_PAGE: Final = Page[RunSummary]


class RunGetInput(RequestModel):
    run_id: RunId


class RunGetNodeInput(RequestModel):
    run_id: RunId
    node_id: str
    branch_key: str | None = None
    iteration: Annotated[int, Field(ge=0)] | None = None
    item_index: Annotated[int, Field(ge=0)] | None = None
    include_payloads: IncludePayloads = "truncated"


class RunEventsInput(RequestModel):
    run_id: RunId
    after_seq: Annotated[int, Field(ge=0)] | None = None
    limit: Annotated[int, Field(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT


class RunResumeInput(ResumeRequest):
    run_id: RunId


class RunCancelInput(CancelRequest):
    run_id: RunId


class RunForkInput(RequestModel):
    run_id: RunId
    address: ExecutionAddress
    overrides: ForkOverrides | None = None
    at: ForkBase = "original"


def resume_request(request: RunResumeInput) -> ResumeRequest:
    return ResumeRequest(
        address=request.address,
        attempt=request.attempt,
        payload=request.payload,
        client_op_id=request.client_op_id,
    )


@dataclass(frozen=True, slots=True)
class RunTools:
    engine: EngineFacade

    async def start(self, request: RunStartRequest) -> RunStarted:
        return await self.engine.start_run(request)

    async def get(self, request: RunGetInput) -> RunSnapshot:
        return await self.engine.get_run(request.run_id)

    async def list_runs(self, request: RunListQuery) -> Page[RunSummary]:
        return await self.engine.list_runs(request)

    async def get_node(self, request: RunGetNodeInput) -> ExecutionDetail:
        address = node_address(
            request.node_id,
            branch_key=request.branch_key,
            iteration=request.iteration,
            item_index=request.item_index,
        )
        return await self.engine.get_execution(request.run_id, address, request.include_payloads)

    async def events(self, request: RunEventsInput) -> Page[RunEvent]:
        after_seq = request.after_seq if request.after_seq is not None else await self._tail_start(request)
        return await self.engine.event_log(request.run_id, EventLogQuery(after_seq=after_seq, limit=request.limit))

    async def resume(self, request: RunResumeInput) -> ResumeResult:
        return await self.engine.resume(request.run_id, resume_request(request))

    async def fork(self, request: RunForkInput) -> RunForked:
        fork = ForkRequest.model_validate({"from": request.address, "overrides": request.overrides, "at": request.at})
        return await self.engine.fork(request.run_id, fork)

    async def cancel(self, request: RunCancelInput) -> CancelResult:
        return await self.engine.cancel(request.run_id, CancelRequest(reason=request.reason))

    async def _tail_start(self, request: RunEventsInput) -> int:
        snapshot = await self.engine.get_run(request.run_id)
        return max(snapshot.last_seq - request.limit, 0)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="run_start",
                description=(
                    "Starts a flow run from the working copy and returns run_id at once, without waiting for the end. "
                    "Pass exactly one of input and dataset_item_id; human_answers are scripted answers for human "
                    "nodes. Then call run_get and run_events."
                ),
                input_model=RunStartRequest,
                output_model=RunStarted,
                surface="rest_and_mcp",
                hints=ToolHints(title="Start run", read_only=False, open_world=True),
                use_case=self.start,
            ),
            Operation(
                name="run_get",
                description="Run status, cost, node executions, open waits for a human answer and last_seq.",
                input_model=RunGetInput,
                output_model=RunSnapshot,
                surface="rest_and_mcp",
                hints=ToolHints(title="Run", read_only=True, idempotent=True),
                use_case=self.get,
            ),
            Operation(
                name="run_list",
                description=(
                    "Page of runs filtered by flow_id, status, mode, assignee; for what is waiting for me use "
                    "status=suspended. Cursor: next_cursor."
                ),
                input_model=RunListQuery,
                output_model=RUN_SUMMARY_PAGE,
                surface="rest_and_mcp",
                hints=ToolHints(title="Runs", read_only=True, idempotent=True),
                use_case=self.list_runs,
            ),
            Operation(
                name="run_get_node",
                description=(
                    "Node execution at an address (node_id, branch_key, iteration, item_index): prompt, response, "
                    "attempts, checks, cost; a waiting node also has human with form_schema and attempt for run_resume."
                ),
                input_model=RunGetNodeInput,
                output_model=ExecutionDetail,
                surface="rest_and_mcp",
                hints=ToolHints(title="Node execution", read_only=True, idempotent=True),
                use_case=self.get_node,
            ),
            Operation(
                name="run_events",
                description=(
                    "Run event log by seq. Without after_seq, the tail: the last limit events; with after_seq, "
                    "the events after it, to continue reading."
                ),
                input_model=RunEventsInput,
                output_model=RUN_EVENTS_PAGE,
                surface="rest_and_mcp",
                hints=ToolHints(title="Run events", read_only=True, idempotent=True),
                use_case=self.events,
            ),
            Operation(
                name="run_resume",
                description=(
                    "Answers a wait for a human answer: address and attempt from waits[] or run_get_node, payload per "
                    "form_schema, client_op_id is the idempotency key. Errors: NOT_WAITING, ALREADY_RESUMED, "
                    "WAIT_ATTEMPT_STALE, RUN_TIMED_OUT, INPUT_INVALID."
                ),
                input_model=RunResumeInput,
                output_model=ResumeResult,
                surface="rest_and_mcp",
                hints=ToolHints(title="Answer wait", read_only=False, idempotent=True),
                use_case=self.resume,
            ),
            Operation(
                name="run_fork",
                description=(
                    "New run from run run_id starting at node address (execution address): nodes before it are taken "
                    "from the source run, it and later nodes run again. A node waiting for a human answer asks "
                    "again."
                ),
                input_model=RunForkInput,
                output_model=RunForked,
                surface="rest_and_mcp",
                hints=ToolHints(title="Fork run", read_only=False, open_world=True),
                use_case=self.fork,
            ),
            Operation(
                name="run_cancel",
                description="Cancels a run with a reason.",
                input_model=RunCancelInput,
                output_model=CancelResult,
                surface="rest_and_mcp",
                hints=ToolHints(title="Cancel run", read_only=False, destructive=True, idempotent=True),
                use_case=self.cancel,
            ),
        )
