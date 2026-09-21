import asyncio
import datetime as dt
import warnings
from collections.abc import Generator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import httpx2
import pydantic_ai
from pydantic_ai import CostNotFoundWarning

from aqven.check.simulation.model import SimulatedModelFactories
from aqven.check.simulation.plan import PassPlanner, SimulationPass
from aqven.check.simulation.values import MEDIA_SAMPLES, ValueFactory
from aqven.engine.assembly import standard_engine_setup
from aqven.engine.facade import DbosEngineFacade
from aqven.engine.lifecycle import EngineLifecycle
from aqven.engine.request import RunSpec
from aqven.engine.runtime import RunOverrides
from aqven.ir import CompiledInference, CompiledProject, CompiledTool, McpToolSource
from aqven.ports.models import provider_key_variables
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId
from aqven.runtime.events import NodeFinished, NodeStarted, RunEvent, RunFinished
from aqven.runtime.executions import RunError
from aqven.runtime.options import RunContext
from aqven.runtime.replay import McpToolStub
from aqven.runtime.runs import CancelRequest
from aqven.spec import FlowId, Locale, McpServerId, NodeId, NodeKind, RunContextKey, TenantId, TimeZone
from aqven.testing.blobs import MemoryBlobStore, blob_id_for

SIMULATION_KEY: Final = "aqven-simulation-key"
STUB_TOOL: Final = "aqven_simulation"
BLOCKED_MESSAGE: Final = "aqven check simulation does not allow network requests"
TIMEOUT_CODE: Final = "SIM_TIMEOUT"
CANCEL_REASON: Final = "aqven check simulation timed out"
DEFAULT_PASS_SECONDS: Final = 120.0
SIMULATION_VALUES: Final[Mapping[RunContextKey, object]] = {
    RunContextKey.DATE: dt.date(2026, 1, 1),
    RunContextKey.TIME_ZONE: TimeZone("UTC"),
    RunContextKey.LOCALE: Locale("en-US"),
    RunContextKey.TENANT_ID: TenantId("simulation"),
}


def simulation_context(keys: Sequence[RunContextKey]) -> RunContext | None:
    if not keys:
        return None
    return RunContext.model_validate({key.value: SIMULATION_VALUES[key] for key in keys})


class NetworkBlocked(Exception):
    def __init__(self, url: str) -> None:
        super().__init__(f"{BLOCKED_MESSAGE}: {url}")
        self.url = url


@dataclass(frozen=True, slots=True)
class NodeFailure:
    address: ExecutionAddress
    kind: NodeKind
    error: RunError


@dataclass(frozen=True, slots=True)
class PassResult:
    name: str
    injected_node: NodeId | None
    flow_input: JsonObject
    executed: frozenset[str]
    failures: tuple[NodeFailure, ...]
    error: RunError | None
    timed_out: bool


@dataclass(frozen=True, slots=True)
class FlowResult:
    flow_id: FlowId
    passes: tuple[PassResult, ...]

    @property
    def executed(self) -> frozenset[str]:
        return frozenset(node for item in self.passes for node in item.executed)


def refuse(request: httpx2.Request) -> httpx2.Response:
    raise NetworkBlocked(str(request.url))


def blocked_transport() -> httpx2.AsyncBaseTransport:
    return httpx2.MockTransport(refuse)


def simulation_blobs() -> MemoryBlobStore:
    store = MemoryBlobStore()
    for sample in MEDIA_SAMPLES:
        store.stored[blob_id_for(sample.data)] = sample.data
    return store


def simulation_environment() -> Mapping[str, str]:
    return {name: SIMULATION_KEY for name in provider_key_variables()}


def mcp_stubs(plan: CompiledProject, values: ValueFactory) -> tuple[McpToolStub, ...]:
    servers = tuple(McpToolStub(server=server_id, tool=STUB_TOOL, result={}) for server_id in plan.mcp_servers)
    tools = tuple(_tool_stub(tool, values) for tool in plan.tools.values() if isinstance(tool.source, McpToolSource))
    return (*tools, *servers)


def _tool_stub(tool: CompiledTool, values: ValueFactory) -> McpToolStub:
    source = tool.source
    server = source.server if isinstance(source, McpToolSource) else McpServerId("")
    name = source.tool if isinstance(source, McpToolSource) else tool.tool_id
    result = values.value(tool.output_schema or {}, tool.tool_id)
    return McpToolStub(server=server, tool=name, result=result)


def simulation_plan(plan: CompiledProject) -> CompiledProject:
    inferences = {key: _without_checks(value) for key, value in plan.inferences.items()}
    return plan.model_copy(update={"inferences": inferences})


def _without_checks(inference: CompiledInference) -> CompiledInference:
    return inference.model_copy(update={"checks": ()})


@contextmanager
def quiet_banner() -> Generator[None]:
    previous = pydantic_ai.BANNER_ENABLED
    pydantic_ai.BANNER_ENABLED = False
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", CostNotFoundWarning)
        try:
            yield
        finally:
            pydantic_ai.BANNER_ENABLED = previous


@contextmanager
def simulation_engine(root: Path, state: Path) -> Generator[DbosEngineFacade]:
    setup = standard_engine_setup(
        settings=None,
        environ=simulation_environment(),
        state_dir=state,
        factories=SimulatedModelFactories(),
    )
    lifecycle = EngineLifecycle(root=root, setup=setup, state_dir=state)
    runtime = lifecycle.launch()
    try:
        yield DbosEngineFacade(runtime=runtime)
    finally:
        lifecycle.shutdown()


@dataclass(frozen=True, slots=True)
class SimulationRunner:
    facade: DbosEngineFacade
    plan: CompiledProject
    planner: PassPlanner = field(default_factory=PassPlanner)
    seconds: float = DEFAULT_PASS_SECONDS
    blobs: MemoryBlobStore = field(default_factory=simulation_blobs)

    async def flow(self, flow_id: FlowId) -> FlowResult:
        flow = self.plan.flow(flow_id)
        first = await self.run_pass(flow_id, self.planner.base(flow))
        results = [first]
        for extra in self.planner.follow_up(flow, first.executed):
            results.append(await self.run_pass(flow_id, extra))
        return FlowResult(flow_id=flow_id, passes=tuple(results))

    async def run_pass(self, flow_id: FlowId, item: SimulationPass) -> PassResult:
        spec = RunSpec(
            flow_id=flow_id,
            mode="live",
            context=simulation_context(self.plan.flow(flow_id).context),
            mcp_stubs=mcp_stubs(self.plan, self.planner.values),
            outputs=item.overrides,
        )
        overrides = RunOverrides(tool_http=blocked_transport(), blobs=self.blobs)
        started = await self.facade.launch(self.plan, spec, item.flow_input, overrides)
        timed_out = await self._await_run(started.run_id)
        events = await self.facade.log.snapshot(started.run_id)
        return pass_result(item, events, timed_out)

    async def _await_run(self, run_id: RunId) -> bool:
        try:
            async with asyncio.timeout(self.seconds):
                await self.facade.result(run_id)
        except TimeoutError:
            await self.facade.cancel(run_id, CancelRequest(reason=CANCEL_REASON))
            return True
        return False


def pass_result(item: SimulationPass, events: Sequence[RunEvent], timed_out: bool) -> PassResult:
    kinds = {event.address.node_id: event.kind for event in events if isinstance(event, NodeStarted)}
    failures = tuple(
        NodeFailure(address=event.address, kind=kinds.get(event.address.node_id, NodeKind.CODE), error=event.error)
        for event in events
        if isinstance(event, NodeFinished) and event.status == "failed" and event.error is not None
    )
    return PassResult(
        name=item.name,
        injected_node=item.injected_node,
        flow_input=item.flow_input,
        executed=frozenset(kinds),
        failures=failures,
        error=timeout_error() if timed_out else run_failure(events),
        timed_out=timed_out,
    )


def run_failure(events: Sequence[RunEvent]) -> RunError | None:
    finished = next((event for event in reversed(events) if isinstance(event, RunFinished)), None)
    if finished is None or finished.status == "completed":
        return None
    return finished.error


def timeout_error() -> RunError:
    return RunError(code=TIMEOUT_CODE, message=CANCEL_REASON, address=None)
