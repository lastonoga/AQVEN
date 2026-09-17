from collections.abc import AsyncGenerator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue, SecretStr
from pydantic_ai import Tool
from pydantic_ai.messages import BinaryContent, UserContent
from pydantic_ai.toolsets import AbstractToolset, FunctionToolset

from aqven.engine.executors.secrets import resolve_ref
from aqven.engine.executors.tool import ToolContextFactory, scope_run_id, scope_stubs
from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.tools import McpServers
from aqven.engine.runtime import ToolServices
from aqven.ir import CompiledMcpServer, CompiledTool
from aqven.ir.common import JsonSchema
from aqven.ports.execution import ExecutionScope
from aqven.runtime.replay import McpToolStub, ToolReplayMiss
from aqven.runtime.steps import ToolContext
from aqven.spec import MediaValue, SecretRef

STUB_ARGUMENTS: Final[JsonSchema] = {"type": "object", "additionalProperties": True}


@dataclass(frozen=True, slots=True)
class EngineToolContexts:
    factory: ToolContextFactory

    @asynccontextmanager
    async def open(
        self, scope: ExecutionScope, tool: CompiledTool, tool_call_id: str, arguments: Mapping[str, JsonValue]
    ) -> AsyncGenerator[ToolContext]:
        async with self.factory.open(scope, tool, dict(arguments)) as context:
            yield context


@dataclass(frozen=True, slots=True)
class EngineSecrets:
    services: ToolServices

    async def secret(self, ref: SecretRef) -> SecretStr:
        value = await resolve_ref(self.services, ref)
        if value is None:
            raise LlmNodeError(
                LlmFailureCode.PROVIDER_KEY_MISSING,
                f"secret {ref} is not set: set it in the project .env or the environment",
            )
        return SecretStr(value)


@dataclass(frozen=True, slots=True)
class BlobMediaLoader:
    services: ToolServices

    async def content(self, scope: ExecutionScope, media: MediaValue) -> UserContent:
        store = self.services.blob_store(scope_run_id(scope))
        try:
            data = await store.get(media)
        except Exception as error:
            message = f"media {media.blob_id} is unavailable to the model: {type(error).__name__}: {error}"
            raise LlmNodeError(LlmFailureCode.MEDIA_UNAVAILABLE, message) from error
        return BinaryContent(data=data, media_type=media.media_type)


@dataclass(frozen=True, slots=True)
class StubbedMcpTool:
    scope: ExecutionScope
    stubs: tuple[McpToolStub, ...]

    async def __call__(self, **arguments: JsonValue) -> JsonValue:
        found = next((stub for stub in self.stubs if stub.arguments in (None, arguments)), None)
        if found is None:
            raise ToolReplayMiss(self.scope.address, f"no MCP stub matches {self.stubs[0].server}/{self.stubs[0].tool}")
        return found.result


def stub_tool(scope: ExecutionScope, name: str, stubs: Sequence[McpToolStub]) -> Tool[RunDeps]:
    return Tool[RunDeps].from_schema(
        StubbedMcpTool(scope, tuple(stubs)),
        name=name,
        description=f"MCP {stubs[0].server}/{name}",
        json_schema=STUB_ARGUMENTS,
        takes_ctx=False,
    )


@dataclass(frozen=True, slots=True)
class RunMcpServers:
    live: McpServers

    async def toolset(self, scope: ExecutionScope, server: CompiledMcpServer) -> AbstractToolset[RunDeps]:
        stubs = [stub for stub in scope_stubs(scope) if stub.server == server.server_id]
        if not stubs:
            return await self.live.toolset(scope, server)
        names = tuple(dict.fromkeys(stub.tool for stub in stubs))
        tools = [stub_tool(scope, name, [stub for stub in stubs if stub.tool == name]) for name in names]
        return FunctionToolset[RunDeps](tools)


@dataclass(frozen=True, slots=True)
class BlobMediaStore:
    services: ToolServices

    async def put(self, scope: ExecutionScope, data: bytes, media_type: str, name: str | None) -> MediaValue:
        return await self.services.blob_store(scope_run_id(scope)).put(data, media_type, name)
