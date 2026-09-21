import asyncio
from dataclasses import dataclass
from typing import Final, Protocol

from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.write.model import FlowPatchRequest, WriteActor, WriteResult

MCP_ACTOR: Final = WriteActor(kind="agent", id="mcp")


class PatchFlow(Protocol):
    async def __call__(self, request: FlowPatchRequest, actor: WriteActor) -> WriteResult: ...


class FlowWriter(Protocol):
    def patch_flow(self, request: FlowPatchRequest, actor: WriteActor) -> WriteResult: ...


@dataclass(frozen=True, slots=True)
class WriterPatchFlow:
    writer: FlowWriter

    async def __call__(self, request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
        return await asyncio.to_thread(self.writer.patch_flow, request, actor)


@dataclass(frozen=True, slots=True)
class PatchTools:
    patch_flow: PatchFlow
    actor: WriteActor = MCP_ACTOR

    async def patch(self, request: FlowPatchRequest) -> WriteResult:
        return await self.patch_flow(request, self.actor)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="flow_patch",
                description=(
                    "Atomically applies 1..50 operations to flow files: add_node, remove_node, rename_node, "
                    "move_node, set, unset, bind, unbind, rename_flow, rename_agent, delete_agent. expects[{path, "
                    "file_hash}] is a CAS on "
                    "hashes from flow_get (null means the file must not exist); client_op_id is a ULID, a repeat "
                    "returns the first result. Validates the tree before writing; dry_run does not touch the disk. "
                    "On STALE_FILE, re-read the file and replay the intent."
                ),
                input_model=FlowPatchRequest,
                output_model=WriteResult,
                surface="rest_and_mcp",
                hints=ToolHints(title="Edit flow structure", read_only=False, destructive=True),
                use_case=self.patch,
            ),
        )
