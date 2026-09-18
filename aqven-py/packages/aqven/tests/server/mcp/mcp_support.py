import os
import shutil
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Final

from mcp.client import Client
from mcp_types import CallToolResult
from pydantic import JsonValue, TypeAdapter

from aqven.ports.engine import EngineError, EngineFacade, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, RunId, node_address
from aqven.runtime.events import NodeStarted, RunEvent, RunStartedEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
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
from aqven.runtime.vocabulary import IncludePayloads
from aqven.server.mcp import (
    McpPorts,
    ProcessRunner,
    ProjectPaths,
    SubprocessRunner,
    build_catalog,
    build_mcp_server,
)
from aqven.server.mcp.patch_tools import PatchFlow
from aqven.spec import FlowId, NodeKind

FIXTURES: Final = Path(__file__).parents[2] / "fixtures"
STANDARD_SHOP: Final = FIXTURES / "standard_shop"
MOMENT: Final = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
RUN_ID: Final = RunId("run-1")
FLOW_ID: Final = FlowId("intake")
CONTENT_HASH: Final = "sha256-" + "0" * 64
JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])
COPY_IGNORED: Final = (".aqven", "__pycache__", "*.pyc")
ISOLATED_PYTEST: Final = {**os.environ, "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1"}
CLEAN: Final = node_address("clean")


def shop_copy(destination: Path) -> Path:
    target = destination / STANDARD_SHOP.name
    shutil.copytree(STANDARD_SHOP, target, ignore=shutil.ignore_patterns(*COPY_IGNORED))
    return target


def structured(result: CallToolResult) -> dict[str, JsonValue]:
    return JSON_OBJECT.validate_python(result.structured_content)


async def call(client: Client, name: str, arguments: dict[str, object]) -> CallToolResult:
    return await client.call_tool(name, arguments)


def counts() -> NodeCounts:
    return NodeCounts(pending=0, running=0, ok=1, failed=0, skipped=0, suspended=0, cancelled=0)


def snapshot(last_seq: int) -> RunSnapshot:
    return RunSnapshot(
        run_id=RUN_ID,
        flow_id=FLOW_ID,
        status="running",
        mode="live",
        started_at=MOMENT,
        finished_at=None,
        cost_usd=Decimal("0.01"),
        tokens_in=10,
        tokens_out=5,
        node_counts=counts(),
        content_hash=CONTENT_HASH,
        definition_changed=False,
        waits=(),
        lineage=None,
        execution_id="exec-1",
        context=None,
        spec_version=SpecVersionInfo(
            id="spec-1",
            content_hash=CONTENT_HASH,
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
        config_hash=CONTENT_HASH,
        limits=None,
        trace_id=None,
        order=("clean", "reply", "review"),
        executions=(),
        human_answers=(),
        last_seq=last_seq,
    )


def execution(address: ExecutionAddress) -> ExecutionDetail:
    return ExecutionDetail(
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
        summary="ok",
        input_ref=None,
        output_ref=None,
        trace_id=None,
        span_id=None,
        provenance={},
        prompt=None,
        response=None,
        attempts=(),
        checks=(),
        rule_firings=(),
        error=None,
        human=None,
    )


def events(total: int) -> tuple[RunEvent, ...]:
    started = RunStartedEvent(
        seq=1,
        at=MOMENT,
        run_id=RUN_ID,
        flow_id=FLOW_ID,
        content_hash=CONTENT_HASH,
        mode="live",
        order=("clean",),
        input_ref=None,
    )
    nodes = tuple(
        NodeStarted(seq=seq, at=MOMENT, run_id=RUN_ID, address=CLEAN, kind=NodeKind.CODE, attempt=1, queued_ms=0)
        for seq in range(2, total + 1)
    )
    return (started, *nodes)


@dataclass(slots=True)
class FakeEngine:
    log: tuple[RunEvent, ...] = field(default_factory=lambda: events(30))
    starts: list[RunStartRequest] = field(default_factory=list[RunStartRequest])
    resumes: list[tuple[RunId, ResumeRequest]] = field(default_factory=list[tuple[RunId, ResumeRequest]])
    addresses: list[tuple[ExecutionAddress, IncludePayloads]] = field(
        default_factory=list[tuple[ExecutionAddress, IncludePayloads]]
    )
    resume_error: EngineError | None = None

    async def start_run(self, request: RunStartRequest) -> RunStarted:
        self.starts.append(request)
        return RunStarted(
            run_id=RUN_ID,
            status="queued",
            content_hash=CONTENT_HASH,
            spec_version_id="spec-1",
            last_seq=0,
            ui_url="http://127.0.0.1:5180/w/intake/run/run-1",
        )

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        if run_id != RUN_ID:
            raise EngineError("NOT_FOUND", f"run {run_id} not found")
        return snapshot(len(self.log))

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        return Page[RunSummary](items=(), next_cursor=None, total_estimate=0)

    async def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncGenerator[RunEvent]:
        for event in self.log:
            yield event

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        items = tuple(event for event in self.log if event.seq > query.after_seq)[: query.limit]
        return Page[RunEvent](items=items, next_cursor=None, total_estimate=len(self.log))

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        return ()

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        self.addresses.append((address, include_payloads))
        return execution(address)

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        self.resumes.append((run_id, request))
        if self.resume_error is not None:
            raise self.resume_error
        return ResumeResult(outcome="accepted", status="running", address=request.address, attempt=request.attempt)

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        return RunForked(run_id=RunId("run-2"), lineage_parent=run_id)

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        return CancelResult(status="cancelled")

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        return ()

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        raise EngineError("NOT_WAITING", "no wait")


def engine_port(engine: FakeEngine) -> EngineFacade:
    return engine


def mcp_client(
    root: Path,
    *,
    engine: EngineFacade | None = None,
    patch_flow: PatchFlow | None = None,
    runner: ProcessRunner | None = None,
) -> Client:
    chosen = runner if runner is not None else SubprocessRunner()
    ports = McpPorts(paths=ProjectPaths.of(root, root), runner=chosen, engine=engine, patch_flow=patch_flow)
    return Client(build_mcp_server(build_catalog(ports)), cache=None)
