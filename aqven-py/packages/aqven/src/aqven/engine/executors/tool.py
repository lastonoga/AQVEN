import asyncio
import hashlib
import inspect
from collections.abc import AsyncGenerator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Final, Protocol, assert_never

import httpx2
from pydantic import JsonValue
from pydantic_ai.mcp import MCPToolset
from pydantic_core import to_jsonable_python

from aqven.engine.errors import CodeSignatureError, SecretUnavailable, ToolJobFailed, ToolJobTimedOut
from aqven.engine.executors.secrets import header_values, tool_secrets
from aqven.engine.extensions import RunAwareScope
from aqven.engine.loading import json_result, plain_json, typed_arguments
from aqven.engine.runtime import ToolServices
from aqven.ir import (
    CodeToolSource,
    CompiledJobWait,
    CompiledMcpServer,
    CompiledTool,
    CompiledToolNode,
    McpToolSource,
    canonical_json,
)
from aqven.ports.execution import ExecutionScope, NodeOutcome, NodeSucceeded
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId
from aqven.runtime.replay import McpToolStub, ToolReplayMiss
from aqven.runtime.steps import BlobStore, JobHandle
from aqven.spec import Effect

IDEMPOTENCY_DOMAIN: Final = b"aqven.idempotency.v1\x00"
IDEMPOTENCY_PREFIX: Final = "sha256-"
EFFECTFUL: Final = frozenset({Effect.WRITE, Effect.EXTERNAL})
JOB_DONE: Final = "done"
JOB_FAILED: Final = "failed"
REPLAY_MODE: Final = "replay"
REPLAY_SECRET: Final = "aqven-replay-secret"


class OfflineTransport(httpx2.AsyncBaseTransport):
    def __init__(self, address: ExecutionAddress) -> None:
        self.address = address

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        raise ToolReplayMiss(self.address, f"HTTP {request.method} {request.url}")


@dataclass(frozen=True, slots=True)
class StepToolContext:
    run_id: RunId
    address: ExecutionAddress
    http: httpx2.AsyncClient
    idempotency_key: str | None
    blobs: BlobStore
    secrets: Mapping[str, str] = field(default_factory=dict[str, str])
    replay: bool = False

    def secret(self, name: str) -> str:
        value = self.secrets.get(name)
        if value is not None:
            return value
        if self.replay:
            return REPLAY_SECRET
        raise SecretUnavailable(name)


class McpCaller(Protocol):
    async def call(
        self, server: CompiledMcpServer, tool: str, arguments: JsonObject, headers: Mapping[str, str]
    ) -> JsonValue: ...


@dataclass(frozen=True, slots=True)
class ToolsetMcpCaller:
    async def call(
        self, server: CompiledMcpServer, tool: str, arguments: JsonObject, headers: Mapping[str, str]
    ) -> JsonValue:
        toolset: MCPToolset[None] = MCPToolset(server.url, headers=dict(headers) if headers else None)
        async with toolset:
            result: object = await toolset.direct_call_tool(tool, dict(arguments))
        converted: JsonValue = to_jsonable_python(result)
        return converted


def idempotency_key(run_id: RunId, address: ExecutionAddress, attempt: int, fields: JsonObject) -> str:
    canonical = canonical_json(
        {"execution_id": run_id, "address": address.model_dump(mode="json"), "attempt": attempt, "fields": fields}
    )
    return f"{IDEMPOTENCY_PREFIX}{hashlib.sha256(IDEMPOTENCY_DOMAIN + canonical).hexdigest()}"


def scope_attempt(scope: ExecutionScope) -> int:
    return scope.attempt if isinstance(scope, RunAwareScope) else 1


def scope_run_id(scope: ExecutionScope) -> RunId:
    return scope.root_run_id if isinstance(scope, RunAwareScope) else scope.run_id


def scope_stubs(scope: ExecutionScope) -> Sequence[McpToolStub]:
    return scope.run_spec.mcp_stubs if isinstance(scope, RunAwareScope) else ()


def tool_idempotency_key(scope: ExecutionScope, tool: CompiledTool, inputs: JsonObject) -> str | None:
    if tool.effect not in EFFECTFUL:
        return None
    fields: JsonObject = {name: inputs.get(name) for name in tool.idempotency_key}
    return idempotency_key(scope_run_id(scope), scope.address, scope_attempt(scope), fields)


@dataclass(frozen=True, slots=True)
class ToolContextFactory:
    services: ToolServices

    def transport(self, scope: ExecutionScope) -> httpx2.AsyncBaseTransport | None:
        override = self.services.transport(scope_run_id(scope))
        if override is not None:
            return override
        return OfflineTransport(scope.address) if scope.mode == REPLAY_MODE else None

    @asynccontextmanager
    async def open(
        self, scope: ExecutionScope, tool: CompiledTool, inputs: JsonObject
    ) -> AsyncGenerator[StepToolContext]:
        secrets = await tool_secrets(self.services, tool.secrets)
        async with httpx2.AsyncClient(transport=self.transport(scope)) as client:
            yield StepToolContext(
                run_id=scope_run_id(scope),
                address=scope.address,
                http=client,
                idempotency_key=tool_idempotency_key(scope, tool, inputs),
                blobs=self.services.blob_store(scope_run_id(scope)),
                secrets=secrets,
                replay=scope.mode == REPLAY_MODE,
            )


async def awaited(value: object, ref: str) -> object:
    if not inspect.isawaitable(value):
        raise CodeSignatureError(ref, "a tool function must be declared with async def")
    result: object = await value
    return result


def job_field(payload: JsonValue, name: str) -> JsonValue:
    return payload.get(name) if isinstance(payload, dict) else None


@dataclass(frozen=True, slots=True)
class ToolExecutor:
    services: ToolServices
    mcp: McpCaller = field(default_factory=ToolsetMcpCaller)

    @property
    def contexts(self) -> ToolContextFactory:
        return ToolContextFactory(self.services)

    async def execute(self, node: CompiledToolNode, scope: ExecutionScope) -> NodeOutcome:
        tool = scope.project.tool(node.tool)
        inputs = scope.bind(node.inputs)
        source = tool.source
        match source:
            case CodeToolSource():
                return NodeSucceeded(output=await self._run_code(scope, tool, source, inputs))
            case McpToolSource():
                return NodeSucceeded(output=await self._run_mcp(scope, source, inputs))
            case _:
                assert_never(source)

    async def _run_code(
        self, scope: ExecutionScope, tool: CompiledTool, source: CodeToolSource, inputs: JsonObject
    ) -> JsonValue:
        function = self.services.loader.function(source.run)
        arguments = typed_arguments(function, source.run, inputs, skip=1)
        async with self.contexts.open(scope, tool, inputs) as context:
            started = await awaited(function(context, **arguments), source.run)
            if tool.wait is None:
                return json_result(function, source.run, started)
            return await self._poll(tool, tool.wait, context, started)

    async def _poll(
        self, tool: CompiledTool, wait: CompiledJobWait, context: StepToolContext, started: object
    ) -> JsonValue:
        poll = self.services.loader.function(wait.poll)
        job = JobHandle.model_validate(plain_json(started))
        deadline = asyncio.get_running_loop().time() + wait.timeout_seconds
        while True:
            payload = plain_json(await awaited(poll(context, job), wait.poll))
            state = job_field(payload, "state")
            if state == JOB_DONE:
                return job_field(payload, "value")
            if state == JOB_FAILED:
                raise ToolJobFailed(tool.tool_id, str(job_field(payload, "message")))
            if asyncio.get_running_loop().time() >= deadline:
                raise ToolJobTimedOut(tool.tool_id, wait.timeout_seconds)
            await asyncio.sleep(wait.interval_seconds)

    async def _run_mcp(self, scope: ExecutionScope, source: McpToolSource, inputs: JsonObject) -> JsonValue:
        if scope.mode == REPLAY_MODE:
            return self._stubbed(scope, source, inputs)
        server = scope.project.mcp_server(source.server)
        headers = await header_values(self.services, server.headers)
        return await self.mcp.call(server, source.tool, inputs, headers)

    def _stubbed(self, scope: ExecutionScope, source: McpToolSource, inputs: JsonObject) -> JsonValue:
        stub = next(
            (
                stub
                for stub in scope_stubs(scope)
                if stub.server == source.server
                and stub.tool == source.tool
                and (stub.arguments is None or stub.arguments == inputs)
            ),
            None,
        )
        if stub is None:
            raise ToolReplayMiss(scope.address, f"no MCP stub matches {source.server}/{source.tool}")
        return stub.result
