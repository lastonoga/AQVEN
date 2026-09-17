from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from mcp_support import call, mcp_client, shop_copy, structured

from aqven.runtime.address import ClientOpId
from aqven.server.mcp import WriterPatchFlow
from aqven.write.errors import WriteConflict, WriteError
from aqven.write.model import FlowPatchRequest, VersionFile, WriteActor, WriteResult, WriteVersion

CLIENT_OP_ID: Final = "01JB8Q3XK2M4N6P8R0S2T4V6W8"
NODE_FILE: Final = "flows/intake/nodes/clean/clean.node.yaml"
OLD_HASH: Final = "sha256-" + "a" * 64
NEW_HASH: Final = "sha256-" + "b" * 64
ARGUMENTS: Final[dict[str, object]] = {
    "flow_id": "intake",
    "expects": [{"path": NODE_FILE, "file_hash": OLD_HASH}],
    "ops": [{"op": "set", "path": "nodes/clean/description", "value": "New description"}],
    "client_op_id": CLIENT_OP_ID,
    "dry_run": True,
}


def written(request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
    return WriteResult(
        op="flow_patch",
        dry_run=request.dry_run,
        version=WriteVersion(
            files=(VersionFile(path=NODE_FILE, file_hash=NEW_HASH),),
            dirty=True,
            actor=actor,
            client_op_id=ClientOpId(request.client_op_id),
        ),
        tree_hash=None,
        changed_paths=(NODE_FILE,),
        applied_ops=tuple(op.model_dump(mode="json") for op in request.ops),
        renames=(),
        focus=None,
        problems=(),
    )


@dataclass(slots=True)
class SyncWriter:
    calls: list[str] = field(default_factory=list[str])

    def patch_flow(self, request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
        self.calls.append(request.flow_id)
        return written(request, actor)


@dataclass(slots=True)
class RecordingPatch:
    failure: WriteError | None = None
    calls: list[tuple[FlowPatchRequest, WriteActor]] = field(default_factory=list[tuple[FlowPatchRequest, WriteActor]])

    async def __call__(self, request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
        self.calls.append((request, actor))
        if self.failure is not None:
            raise self.failure
        return written(request, actor)


@pytest.mark.asyncio
async def test_flow_patch_delegates_to_write_port_as_agent(tmp_path: Path) -> None:
    patch = RecordingPatch()
    async with mcp_client(shop_copy(tmp_path), patch_flow=patch) as client:
        result = await call(client, "flow_patch", ARGUMENTS)
    assert result.is_error is False
    output = structured(result)
    assert (output["ok"], output["changed_paths"]) == (True, [NODE_FILE])
    ((request, actor),) = patch.calls
    assert (request.flow_id, request.dry_run, actor.kind) == ("intake", True, "agent")


@pytest.mark.asyncio
async def test_flow_patch_stale_file_returns_conflict(tmp_path: Path) -> None:
    conflict = WriteConflict(path=NODE_FILE, your_hash=OLD_HASH, current_hash=NEW_HASH)
    patch = RecordingPatch(
        failure=WriteError("STALE_FILE", f"{NODE_FILE} changed after it was read", conflict=conflict)
    )
    async with mcp_client(shop_copy(tmp_path), patch_flow=patch) as client:
        result = await call(client, "flow_patch", ARGUMENTS)
    assert result.is_error is True
    error = structured(result)
    assert (error["op"], error["code"]) == ("flow_patch", "STALE_FILE")
    stale = error["conflict"]
    assert isinstance(stale, dict)
    assert (stale["your_hash"], stale["current_hash"], stale["rebase"]) == (OLD_HASH, NEW_HASH, "manual")


@pytest.mark.asyncio
async def test_flow_patch_rejects_bad_client_op_id_before_writing(tmp_path: Path) -> None:
    patch = RecordingPatch()
    async with mcp_client(shop_copy(tmp_path), patch_flow=patch) as client:
        result = await call(client, "flow_patch", {**ARGUMENTS, "client_op_id": "not-a-ulid"})
    assert result.is_error is True
    assert patch.calls == []


@pytest.mark.asyncio
async def test_sync_write_service_is_adapted_to_patch_port(tmp_path: Path) -> None:
    writer = SyncWriter()
    async with mcp_client(shop_copy(tmp_path), patch_flow=WriterPatchFlow(writer)) as client:
        result = await call(client, "flow_patch", ARGUMENTS)
    assert result.is_error is False
    assert writer.calls == ["intake"]
