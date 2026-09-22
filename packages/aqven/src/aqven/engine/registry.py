from dataclasses import dataclass, field, replace

from aqven.engine.executors import CallExecutor, CodeExecutor, NarrowExecutor, SwitchExecutor, ToolExecutor
from aqven.engine.executors.tool import McpCaller, ToolsetMcpCaller
from aqven.engine.extensions import EngineExtensions, MissingExecutor
from aqven.engine.runtime import ToolServices
from aqven.engine.steps import StepIsolated
from aqven.engine.throttle import ThrottledExecutor, WorkerPool
from aqven.ir import CompiledCodeNode, CompiledNarrowNode, CompiledToolNode
from aqven.ports.execution import NodeExecutor, NodeExecutors
from aqven.spec import NodeKind


@dataclass(frozen=True, slots=True)
class CoreExecutors:
    services: ToolServices
    mcp: McpCaller = field(default_factory=ToolsetMcpCaller)

    def code(self) -> NodeExecutor[CompiledCodeNode]:
        return StepIsolated(CodeExecutor(self.services.loader))

    def tool(self) -> NodeExecutor[CompiledToolNode]:
        return StepIsolated(ToolExecutor(self.services, self.mcp))

    def narrow(self) -> NodeExecutor[CompiledNarrowNode]:
        return NarrowExecutor(self.services.loader)


def _or_missing[N](provided: NodeExecutor[N] | None, kind: NodeKind) -> NodeExecutor[N]:
    return provided if provided is not None else MissingExecutor(kind)


def build_executors(core: CoreExecutors, extensions: EngineExtensions) -> NodeExecutors:
    return NodeExecutors(
        llm=_or_missing(extensions.llm, NodeKind.LLM),
        code=core.code(),
        tool=core.tool(),
        human=_or_missing(extensions.human, NodeKind.HUMAN),
        parallel=_or_missing(extensions.parallel, NodeKind.PARALLEL),
        map=_or_missing(extensions.map, NodeKind.MAP),
        switch=SwitchExecutor(),
        loop=_or_missing(extensions.loop, NodeKind.LOOP),
        call=CallExecutor(),
        narrow=core.narrow(),
    )


def throttled_executors(executors: NodeExecutors, pool: WorkerPool | None) -> NodeExecutors:
    if pool is None:
        return executors
    return replace(
        executors,
        llm=ThrottledExecutor(executors.llm, pool),
        code=ThrottledExecutor(executors.code, pool),
        tool=ThrottledExecutor(executors.tool, pool),
    )
