import shutil
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Final

from pydantic import JsonValue, SecretStr

from aqven.ports.engine import EngineError, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.ports.settings import SettingKey, SettingScope, SettingView, mask_secret
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import NodeStarted as NodeStartedEvent
from aqven.runtime.events import RunEvent, RunFinished, RunStartedEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.presentation import PresentationRequest, PresentationResponse, PresentationResult
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkRequest,
    NodeCounts,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
    SpecVersionInfo,
)
from aqven.runtime.vocabulary import IncludePayloads, ResumeOutcome
from aqven.spec import FlowId, NodeKind

SERVER_TOKEN: Final = "test-token-0123456789"
SERVER_BASE: Final = "http://127.0.0.1:5180"
AUTH: Final = {"Authorization": f"Bearer {SERVER_TOKEN}"}
FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures"
MOMENT: Final = datetime(2026, 9, 17, 10, 0, tzinfo=UTC)
RUN_ID: Final = RunId("01a0aa21-b9a7-74fb-b1f3-f735bf7d04bd")


def copy_fixture(name: str, target: Path) -> Path:
    destination = target / name
    shutil.copytree(FIXTURES / name, destination, ignore=shutil.ignore_patterns("__pycache__"))
    return destination


def node_counts(ok: int = 0) -> NodeCounts:
    return NodeCounts(pending=0, running=0, ok=ok, failed=0, skipped=0, suspended=0, cancelled=0)


def run_snapshot(run_id: RunId, flow_id: str = "intake", ok: int = 2) -> RunSnapshot:
    return RunSnapshot(
        run_id=run_id,
        flow_id=FlowId(flow_id),
        status="completed",
        mode="live",
        started_at=MOMENT,
        finished_at=MOMENT,
        cost_usd=Decimal("0.00012345"),
        tokens_in=10,
        tokens_out=5,
        node_counts=node_counts(ok),
        content_hash="sha256-" + "0" * 64,
        definition_changed=False,
        waits=(),
        lineage=None,
        execution_id=run_id,
        context=None,
        spec_version=SpecVersionInfo(
            id="v1",
            content_hash="sha256-" + "0" * 64,
            release_hash=None,
            git_commit=None,
            origin="working_copy",
            sources={},
        ),
        input_ref=None,
        output_ref=None,
        error=None,
        seed=None,
        cassette_id=None,
        catalog_snapshot_at=None,
        effective_config={},
        config_hash="sha256-" + "1" * 64,
        limits=None,
        trace_id=None,
        order=("clean", "reply", "review"),
        executions=(),
        human_answers=(),
        last_seq=3,
    )


def node_execution(address: ExecutionAddress) -> NodeExecution:
    return NodeExecution(
        address=address,
        kind=NodeKind.CODE,
        status="ok",
        attempts_count=1,
        started_at=MOMENT,
        finished_at=MOMENT,
        latency_ms=3,
        agent=None,
        inference=None,
        model=None,
        profile=None,
        cost_usd=Decimal(0),
        tokens_in=0,
        tokens_out=0,
        cache_hit=False,
        degraded=False,
        summary=None,
        input_ref=None,
        output_ref=None,
        trace_id=None,
        span_id=None,
    )


def execution_detail(address: ExecutionAddress) -> ExecutionDetail:
    return ExecutionDetail(
        **node_execution(address).model_dump(),
        provenance={},
        prompt=None,
        response=None,
        attempts=(),
        checks=(),
        rule_firings=(),
        error=None,
        human=None,
    )


def run_events(run_id: RunId) -> tuple[RunEvent, ...]:
    address = ExecutionAddress(node_id="clean", branch_key=None, iteration=None, item_index=None)
    return (
        RunStartedEvent(
            seq=1,
            at=MOMENT,
            run_id=run_id,
            flow_id=FlowId("intake"),
            content_hash="sha256-" + "0" * 64,
            mode="live",
            order=("clean",),
            input_ref=None,
        ),
        NodeStartedEvent(seq=2, at=MOMENT, run_id=run_id, address=address, kind=NodeKind.CODE, attempt=1, queued_ms=0),
        RunFinished(
            seq=3,
            at=MOMENT,
            run_id=run_id,
            status="completed",
            output_ref=None,
            error=None,
            cost_usd=Decimal(0),
            tokens_in=0,
            tokens_out=0,
        ),
    )


def missing(run_id: str) -> EngineError:
    return EngineError("NOT_FOUND", f"run {run_id} not found")


@dataclass(slots=True)
class FakeEngine:
    runs: dict[RunId, RunSnapshot] = field(default_factory=lambda: {RUN_ID: run_snapshot(RUN_ID)})
    events: dict[RunId, tuple[RunEvent, ...]] = field(default_factory=lambda: {RUN_ID: run_events(RUN_ID)})
    started: list[RunStartRequest] = field(default_factory=list[RunStartRequest])
    started_dataset_items: list[str | None] = field(default_factory=list[str | None])
    list_queries: list[RunListQuery] = field(default_factory=list[RunListQuery])
    detail_requests: list[tuple[ExecutionAddress, IncludePayloads]] = field(
        default_factory=list[tuple[ExecutionAddress, IncludePayloads]]
    )
    presentation_requests: list[PresentationRequest] = field(default_factory=list[PresentationRequest])
    resume_outcome: ResumeOutcome = "accepted"
    cancel_error: EngineError | None = None
    event_reads: list[int] = field(default_factory=list[int])
    first_stream_limit: int | None = None

    def _run(self, run_id: RunId) -> RunSnapshot:
        snapshot = self.runs.get(run_id)
        if snapshot is None:
            raise missing(run_id)
        return snapshot

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        self.started.append(request)
        self.started_dataset_items.append(dataset_item_id)
        return RunStarted(
            run_id=RUN_ID,
            status="queued",
            content_hash="sha256-" + "0" * 64,
            spec_version_id="v1",
            last_seq=0,
            ui_url="/runs/" + RUN_ID,
        )

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return self._run(run_id)

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        self.list_queries.append(query)
        rows = tuple(
            RunSummary.model_validate(snapshot.model_dump())
            for snapshot in self.runs.values()
            if query.flow_id is None or snapshot.flow_id == query.flow_id
        )
        return Page[RunSummary](items=rows[: query.limit], next_cursor=None, total_estimate=len(rows))

    async def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        self._run(run_id)
        self.event_reads.append(after_seq)
        pending = [event for event in self.events.get(run_id, ()) if event.seq > after_seq]
        limit = self.first_stream_limit if len(self.event_reads) == 1 else None
        for event in pending[:limit]:
            yield event

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        self._run(run_id)
        rows = tuple(event for event in self.events.get(run_id, ()) if event.seq > query.after_seq)
        return Page[RunEvent](items=rows[: query.limit], next_cursor=None, total_estimate=len(rows))

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        self._run(run_id)
        address = ExecutionAddress(node_id=query.node_id or "clean", branch_key=None, iteration=None, item_index=None)
        return (node_execution(address),)

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        self._run(run_id)
        self.detail_requests.append((address, include_payloads))
        return execution_detail(address)

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        self._run(run_id)
        self.presentation_requests.append(request)
        return PresentationResponse(
            results=tuple(
                PresentationResult(target=target, status="unavailable", error="no formatter declared")
                for target in request.targets
            )
        )

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        self._run(run_id)
        return ResumeResult(
            outcome=self.resume_outcome, status="running", address=request.address, attempt=request.attempt
        )

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        self._run(run_id)
        return RunForked(run_id=RunId("01a0aa21-b9a7-74fb-b1f3-000000000002"), lineage_parent=run_id)

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        snapshot = self._run(run_id)
        if self.cancel_error is not None:
            raise self.cancel_error
        return CancelResult(status=snapshot.status)

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        self._run(run_id)
        return ()

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        raise EngineError("NOT_WAITING", "no wait")


@dataclass(slots=True)
class Stored:
    value: JsonValue
    secret: SecretStr | None


@dataclass(slots=True)
class MemorySettings:
    stored: dict[tuple[SettingScope, SettingKey], Stored] = field(
        default_factory=dict[tuple[SettingScope, SettingKey], Stored]
    )

    def _view(self, scope: SettingScope, key: SettingKey, stored: Stored) -> SettingView:
        if stored.secret is None:
            return SettingView(scope=scope, key=key, kind="value", value=stored.value, updated_at=MOMENT)
        masked = mask_secret(stored.secret.get_secret_value())
        return SettingView(
            scope=scope,
            key=key,
            kind="secret",
            value=stored.secret.get_secret_value(),
            masked=masked,
            updated_at=MOMENT,
        )

    def _entries(self, scope: SettingScope) -> Iterator[tuple[SettingKey, Stored]]:
        return ((key, stored) for (owner, key), stored in sorted(self.stored.items()) if owner == scope)

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return tuple(self._view(scope, key, stored) for key, stored in self._entries(scope))

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        stored = self.stored.get((scope, key))
        return None if stored is None else self._view(scope, key, stored)

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        self.stored[(scope, key)] = Stored(value, None)
        return self._view(scope, key, self.stored[(scope, key)])

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        self.stored[(scope, key)] = Stored(None, secret)
        return self._view(scope, key, self.stored[(scope, key)])

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return self.stored.pop((scope, key), None) is not None

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        stored = self.stored.get((scope, key))
        return None if stored is None else stored.secret
