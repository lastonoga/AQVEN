from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from pydantic import BaseModel

from aqven.ports.engine import EngineError, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime import (
    CancelRequest,
    CancelResult,
    ExecutionAddress,
    ExecutionDetail,
    ForkRequest,
    HumanWait,
    HumanWaitDetail,
    IncludePayloads,
    NodeExecution,
    NodeResumed,
    NodeSuspended,
    Page,
    ResumeRequest,
    ResumeResult,
    RunEvent,
    RunFinished,
    RunForked,
    RunId,
    RunSnapshot,
    RunStarted,
    RunStartedEvent,
    RunStartRequest,
    RunSummary,
    RunSuspended,
    SpecVersionInfo,
    node_address,
)
from aqven.runtime.presentation import PresentationRequest, PresentationResponse
from aqven.spec import FlowId

RUN_ID: Final = RunId("01999c2a-5e10-7b3c-9d4e-6f7a8b9c0d1e")
FORK_ID: Final = RunId("01999c2a-7f21-7c4d-8e5f-7a8b9c0d1e2f")
AT: Final = datetime(2026, 9, 17, 10, 0, tzinfo=UTC)
HASH: Final = "sha256-" + "5c" * 64
FLOW_ID: Final = "intake"
APPROVAL: Final = node_address("review")
FORM_SCHEMA: Final = {
    "type": "object",
    "properties": {"decision": {"type": "string", "enum": ["approve", "reject"]}},
    "required": ["decision"],
}
NODE_COUNTS: Final = dict.fromkeys(("pending", "running", "ok", "failed", "skipped", "suspended", "cancelled"), 0)


def resource[M: BaseModel](model: type[M], **values: object) -> M:
    blanks = {name: None for name, info in model.model_fields.items() if info.is_required()}
    return model.model_validate(blanks | values)


def approval_wait() -> HumanWait:
    return resource(
        HumanWait,
        address=APPROVAL,
        wait_kind="form",
        attempt=1,
        state="waiting",
        assignee="support_lead",
        waiting_since=AT,
        deadline_at=AT,
        on_timeout="default",
        form_type_id="ReplyApproval",
    )


def snapshot(resumed: bool) -> RunSnapshot:
    return resource(
        RunSnapshot,
        run_id=RUN_ID,
        flow_id=FLOW_ID,
        status="completed" if resumed else "suspended",
        mode="live",
        started_at=AT,
        cost_usd=Decimal("0.0012"),
        tokens_in=12,
        tokens_out=4,
        node_counts=NODE_COUNTS,
        content_hash=HASH,
        definition_changed=False,
        waits=() if resumed else (approval_wait(),),
        execution_id=RUN_ID,
        spec_version=resource(SpecVersionInfo, id="spv_1", content_hash=HASH, origin="working_copy", sources={}),
        effective_config={},
        config_hash=HASH,
        order=("clean", "review"),
        executions=(),
        human_answers=(),
        last_seq=5 if resumed else 3,
    )


def suspension_events() -> tuple[RunEvent, ...]:
    wait = approval_wait()
    return (
        resource(
            RunStartedEvent,
            seq=1,
            at=AT,
            run_id=RUN_ID,
            flow_id=FLOW_ID,
            content_hash=HASH,
            mode="live",
            order=("clean", "review"),
        ),
        resource(NodeSuspended, seq=2, at=AT, run_id=RUN_ID, **wait.model_dump()),
        resource(RunSuspended, seq=3, at=AT, run_id=RUN_ID, address=APPROVAL),
    )


def completion_events() -> tuple[RunEvent, ...]:
    return (
        resource(NodeResumed, seq=4, at=AT, run_id=RUN_ID, address=APPROVAL, attempt=1, resumed_by="api"),
        resource(
            RunFinished,
            seq=5,
            at=AT,
            run_id=RUN_ID,
            status="completed",
            cost_usd=Decimal("0.0012"),
            tokens_in=12,
            tokens_out=4,
        ),
    )


def missing(run_id: RunId) -> EngineError:
    return EngineError("NOT_FOUND", f"run {run_id} not found")


@dataclass(slots=True)
class ScriptedEngine:
    started: list[RunStartRequest] = field(default_factory=list[RunStartRequest])
    resumes: list[ResumeRequest] = field(default_factory=list[ResumeRequest])
    resumed: bool = False

    def _known(self, run_id: RunId) -> None:
        if run_id != RUN_ID:
            raise missing(run_id)

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        self.started.append(request)
        return RunStarted(
            run_id=RUN_ID,
            status="running",
            content_hash=HASH,
            spec_version_id="spv_1",
            last_seq=0,
            ui_url=f"/runs/{RUN_ID}",
        )

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        self._known(run_id)
        return snapshot(self.resumed)

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        rows = (RunSummary.model_validate(snapshot(self.resumed).model_dump()),)
        return Page[RunSummary](items=rows[: query.limit], next_cursor=None, total_estimate=1)

    async def latest_runs(self, flow_ids: Sequence[FlowId]) -> Mapping[FlowId, RunSummary]:
        row = RunSummary.model_validate(snapshot(self.resumed).model_dump())
        return {row.flow_id: row} if row.flow_id in flow_ids else {}

    async def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        self._known(run_id)
        published = suspension_events() + (completion_events() if self.resumed else ())
        for event in published:
            if event.seq > after_seq:
                yield event

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        self._known(run_id)
        rows = tuple(event for event in suspension_events() if event.seq > query.after_seq)
        return Page[RunEvent](items=rows[: query.limit], next_cursor=None, total_estimate=len(rows))

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        self._known(run_id)
        return ()

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        self._known(run_id)
        human = approval_wait().model_dump() | {
            "form_schema": FORM_SCHEMA,
            "attempts": (),
            "ignored_answers": (),
        }
        return resource(
            ExecutionDetail,
            address=address,
            kind="human",
            status="suspended",
            attempts_count=1,
            cost_usd=Decimal(0),
            tokens_in=0,
            tokens_out=0,
            cache_hit=False,
            degraded=False,
            provenance={},
            attempts=(),
            checks=(),
            rule_firings=(),
            human=resource(HumanWaitDetail, **human),
        )

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        self._known(run_id)
        return PresentationResponse(results=())

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        self._known(run_id)
        self.resumes.append(request)
        self.resumed = True
        return ResumeResult(outcome="accepted", status="running", address=request.address, attempt=request.attempt)

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        self._known(run_id)
        return RunForked(run_id=FORK_ID, lineage_parent=run_id)

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        self._known(run_id)
        return CancelResult(status="cancelled")

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        self._known(run_id)
        return () if self.resumed else (approval_wait(),)

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        self._known(run_id)
        detail = (await self.get_execution(run_id, address)).human
        if detail is None:
            raise EngineError("NOT_WAITING", "no wait")
        return detail


@dataclass(slots=True)
class ScriptedEngineHost:
    engine: ScriptedEngine = field(default_factory=ScriptedEngine)

    async def start(self, launch: object) -> ScriptedEngine:
        return self.engine

    async def stop(self) -> None:
        return None
