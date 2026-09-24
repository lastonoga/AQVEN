from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from aqven.engine.request import RunSpec
from aqven.ir import (
    CompiledHumanNode,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledMapNode,
    CompiledParallelNode,
)
from aqven.ports.engine import EngineError
from aqven.ports.execution import ChildEntry, ExecutionScope, NodeExecutor, NodeFailed, NodeOutcome
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.executions import RunError
from aqven.runtime.human import HumanWait, HumanWaitDetail, OpenWaitFilter, ResumeRequest, ResumeResult
from aqven.spec import NodeKind

EXECUTOR_MISSING = "EXECUTOR_MISSING"


class HumanLayer(Protocol):
    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]: ...

    async def waits_of(self, run_ids: Sequence[RunId]) -> Mapping[RunId, tuple[HumanWait, ...]]: ...

    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]: ...

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail: ...

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult: ...


@dataclass(frozen=True, slots=True)
class NoHumanLayer:
    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        return ()

    async def waits_of(self, run_ids: Sequence[RunId]) -> Mapping[RunId, tuple[HumanWait, ...]]:
        return {}

    async def open_runs(self, wanted: OpenWaitFilter) -> tuple[RunId, ...]:
        return ()

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        raise EngineError("NOT_WAITING", f"run {run_id} has no wait at address {address.model_dump_json()}")

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        raise EngineError(
            "NOT_WAITING", f"run {run_id} is not waiting for a human answer: the wait layer is not connected"
        )


@dataclass(frozen=True, slots=True)
class MissingExecutor:
    kind: NodeKind

    async def execute(self, node: object, scope: ExecutionScope) -> NodeOutcome:
        message = f"no executor for {self.kind.value} nodes is connected to the engine"
        return NodeFailed(error=RunError(code=EXECUTOR_MISSING, message=message, address=scope.address))


@runtime_checkable
class RunAwareScope(Protocol):
    @property
    def run_spec(self) -> RunSpec: ...

    @property
    def attempt(self) -> int: ...

    @property
    def root_run_id(self) -> RunId: ...


@runtime_checkable
class DerivableScope(Protocol):
    def derive(self, entry: ChildEntry) -> ExecutionScope: ...


@dataclass(frozen=True, slots=True)
class EngineExtensions:
    llm: NodeExecutor[CompiledLlmNode] | None = None
    human: NodeExecutor[CompiledHumanNode] | None = None
    parallel: NodeExecutor[CompiledParallelNode] | None = None
    map: NodeExecutor[CompiledMapNode] | None = None
    loop: NodeExecutor[CompiledLoopNode] | None = None
    human_layer: HumanLayer = field(default_factory=NoHumanLayer)
