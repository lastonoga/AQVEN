import inspect
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Final, Protocol, Self, get_type_hints

from pydantic import BaseModel, JsonValue, TypeAdapter, ValidationError
from pydantic_ai import CallDeferred, ModelRetry, RunContext, Tool, ToolDefinition
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.toolsets import AbstractToolset, CombinedToolset, FunctionToolset
from pydantic_core import to_jsonable_python

from aqven.engine.llm.checks import NestedInferences
from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.ports import CodeLoader, SecretSource, ToolContexts
from aqven.engine.llm.segments import PendingToolCall, ToolCallResult, ToolCallRetried, ToolCallReturned
from aqven.ir import CodeToolSource, CompiledAgent, CompiledMcpServer, CompiledProject, CompiledTool, McpToolSource
from aqven.ir.common import JsonSchema
from aqven.ports.execution import ExecutionScope
from aqven.runtime.steps import ToolContext
from aqven.spec import Effect, SubagentSpec, ToolId

EMPTY_ARGUMENTS: Final[JsonSchema] = {"type": "object", "properties": {}, "additionalProperties": False}
JSON_VALUE: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)

type ToolFunction = Callable[..., Awaitable[object]]


def to_json_value(value: object) -> JsonValue:
    if isinstance(value, BaseModel):
        return JSON_VALUE.validate_python(value.model_dump(mode="json", by_alias=True))
    return JSON_VALUE.validate_python(to_jsonable_python(value))


class McpServers(Protocol):
    async def toolset(self, scope: ExecutionScope, server: CompiledMcpServer) -> AbstractToolset[RunDeps]: ...


@dataclass(frozen=True, slots=True)
class LiveMcpServers:
    secrets: SecretSource

    async def toolset(self, scope: ExecutionScope, server: CompiledMcpServer) -> AbstractToolset[RunDeps]:
        headers = {
            header.name: (await self.secrets.secret(header.value)).get_secret_value() for header in server.headers
        }
        return MCPToolset[RunDeps](server.url, id=server.server_id, headers=headers)


@dataclass(frozen=True, slots=True)
class ToolPlan:
    toolsets: tuple[AbstractToolset[RunDeps], ...]
    deferred: bool


@dataclass(frozen=True, slots=True)
class CodeToolInvoker:
    tool: CompiledTool
    function: ToolFunction
    parameters: Mapping[str, TypeAdapter[object]]
    optional: frozenset[str]

    @classmethod
    def load(cls, code: CodeLoader, tool: CompiledTool, run: str) -> Self:
        target = code.load(run)
        if not inspect.iscoroutinefunction(target):
            raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"tool {tool.tool_id}: {run} is not an async function")
        signature = inspect.signature(target)
        hints = get_type_hints(target)
        names = list(signature.parameters)[1:]
        parameters = {name: TypeAdapter[object](hints.get(name, object)) for name in names}
        optional = frozenset(
            name for name in names if signature.parameters[name].default is not inspect.Parameter.empty
        )
        return cls(tool, target, parameters, optional)

    def values(self, arguments: Mapping[str, JsonValue]) -> dict[str, object] | ToolCallRetried:
        wanted = [name for name in self.parameters if name in arguments or name not in self.optional]
        try:
            return {name: self.parameters[name].validate_python(arguments.get(name)) for name in wanted}
        except ValidationError as error:
            return ToolCallRetried(message=f"invalid arguments for tool {self.tool.tool_id}: {error}")

    def accepts(self, arguments: Mapping[str, JsonValue]) -> bool:
        return not isinstance(self.values(arguments), ToolCallRetried)

    async def invoke(self, context: ToolContext, arguments: Mapping[str, JsonValue]) -> ToolCallResult:
        values = self.values(arguments)
        if isinstance(values, ToolCallRetried):
            return values
        result = await self.function(context, **values)
        return ToolCallReturned(value=to_json_value(result))


@dataclass(frozen=True, slots=True)
class InStepCodeTool:
    invoker: CodeToolInvoker
    contexts: ToolContexts

    async def __call__(self, ctx: RunContext[RunDeps], **arguments: JsonValue) -> JsonValue:
        tool = self.invoker.tool
        async with self.contexts.open(ctx.deps.scope, tool, ctx.tool_call_id or tool.tool_id, arguments) as context:
            result = await self.invoker.invoke(context, arguments)
        if isinstance(result, ToolCallRetried):
            raise ModelRetry(result.message)
        return result.value


@dataclass(frozen=True, slots=True)
class DeferredCodeTool:
    invoker: CodeToolInvoker

    async def __call__(self, ctx: RunContext[RunDeps], **arguments: JsonValue) -> JsonValue:
        values = self.invoker.values(arguments)
        if isinstance(values, ToolCallRetried):
            raise ModelRetry(values.message)
        raise CallDeferred(metadata={"tool_id": self.invoker.tool.tool_id})


@dataclass(frozen=True, slots=True)
class ApprovalFilter:
    approved: frozenset[ToolId]
    invokers: Mapping[ToolId, CodeToolInvoker]

    def __call__(self, ctx: RunContext[RunDeps], definition: ToolDefinition, arguments: dict[str, JsonValue]) -> bool:
        if definition.name not in self.approved:
            return False
        invoker = self.invokers.get(ToolId(definition.name))
        return invoker is None or invoker.accepts(arguments)


@dataclass(frozen=True, slots=True)
class SubagentTool:
    spec: SubagentSpec
    nested: NestedInferences

    async def __call__(self, ctx: RunContext[RunDeps], **arguments: JsonValue) -> JsonValue:
        document = dict(arguments)
        return await self.nested.run(ctx.deps.scope, self.spec.agent, self.spec.inference, document, ctx.usage)


@dataclass(frozen=True, slots=True)
class ExternalTools:
    code: CodeLoader
    contexts: ToolContexts

    async def invoke(self, scope: ExecutionScope, call: PendingToolCall) -> ToolCallResult:
        tool = scope.project.tools.get(ToolId(call.tool_name))
        if tool is None or not isinstance(tool.source, CodeToolSource):
            raise LlmNodeError(LlmFailureCode.TOOL_UNKNOWN, f"model called unknown external tool {call.tool_name}")
        invoker = CodeToolInvoker.load(self.code, tool, tool.source.run)
        async with self.contexts.open(scope, tool, call.tool_call_id, call.args) as context:
            return await invoker.invoke(context, call.args)


@dataclass(frozen=True, slots=True)
class ToolsetBuilder:
    code: CodeLoader
    contexts: ToolContexts
    secrets: SecretSource
    nested: NestedInferences
    servers: McpServers | None = field(default=None)

    @property
    def mcp(self) -> McpServers:
        return self.servers if self.servers is not None else LiveMcpServers(self.secrets)

    async def build(self, scope: ExecutionScope, agent: CompiledAgent, *, nested: bool) -> ToolPlan:
        project = scope.project
        tools = [project.tool(tool_id) for tool_id in agent.tools]
        approved = frozenset(agent.approval.tools) if agent.approval is not None else frozenset[ToolId]()
        code_tools = [tool for tool in tools if isinstance(tool.source, CodeToolSource)]
        in_step = [
            tool for tool in code_tools if tool.effect == Effect.READ and not (nested and tool.tool_id in approved)
        ]
        external = [tool for tool in code_tools if tool.effect != Effect.READ and not nested]
        invokers = {tool.tool_id: self._invoker(tool) for tool in external}
        functions = FunctionToolset[RunDeps](
            [
                *(self._code_tool(tool) for tool in in_step),
                *(_deferred_tool(tool, invokers[tool.tool_id]) for tool in external),
                *(self._subagent(project, spec) for spec in agent.subagents),
            ]
        )
        servers = [await self.mcp.toolset(scope, project.mcp_server(server_id)) for server_id in agent.mcp_servers]
        remote = [
            await self._mcp_tool(scope, tool, tool.source)
            for tool in tools
            if isinstance(tool.source, McpToolSource) and tool.source.server not in agent.mcp_servers
        ]
        toolsets: list[AbstractToolset[RunDeps]] = [functions, *servers, *remote]
        if nested or not approved:
            return ToolPlan(tuple(toolsets), bool(external))
        guarded = CombinedToolset[RunDeps](toolsets).approval_required(ApprovalFilter(approved, invokers))
        return ToolPlan((guarded,), True)

    def _invoker(self, tool: CompiledTool) -> CodeToolInvoker:
        run = tool.source.run if isinstance(tool.source, CodeToolSource) else ""
        return CodeToolInvoker.load(self.code, tool, run)

    def _code_tool(self, tool: CompiledTool) -> Tool[RunDeps]:
        function = InStepCodeTool(self._invoker(tool), self.contexts)
        return Tool[RunDeps].from_schema(
            function,
            name=tool.tool_id,
            description=tool.description,
            json_schema=tool.input_schema or EMPTY_ARGUMENTS,
            takes_ctx=True,
        )

    def _subagent(self, project: CompiledProject, spec: SubagentSpec) -> Tool[RunDeps]:
        return Tool[RunDeps].from_schema(
            SubagentTool(spec, self.nested),
            name=spec.name,
            description=spec.description,
            json_schema=project.inference(spec.inference).input_schema,
            takes_ctx=True,
        )

    async def _mcp_tool(
        self, scope: ExecutionScope, tool: CompiledTool, source: McpToolSource
    ) -> AbstractToolset[RunDeps]:
        server = await self.mcp.toolset(scope, scope.project.mcp_server(source.server))
        only = server.filtered(lambda ctx, definition: definition.name == source.tool)
        return only.renamed({tool.tool_id: source.tool})


def _deferred_tool(tool: CompiledTool, invoker: CodeToolInvoker) -> Tool[RunDeps]:
    return Tool[RunDeps].from_schema(
        DeferredCodeTool(invoker),
        name=tool.tool_id,
        description=tool.description,
        json_schema=tool.input_schema or EMPTY_ARGUMENTS,
        takes_ctx=True,
    )
