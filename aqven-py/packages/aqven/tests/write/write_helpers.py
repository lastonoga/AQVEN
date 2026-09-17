from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from aqven.client import new_client_op_id
from aqven.loader import file_hash
from aqven.write import (
    CollectingSink,
    FlowPatchRequest,
    MemoryIntentJournal,
    ProjectLock,
    ShadowCheckValidator,
    TreeValidator,
    Validation,
    WriteActor,
    WriteService,
)

FIXTURES: Final = Path(__file__).parents[1] / "fixtures"
STANDARD_SHOP: Final = FIXTURES / "standard_shop"
AGENT: Final = WriteActor(kind="agent", id="claude-code")
HUMAN: Final = WriteActor(kind="human", id="studio")
FIXED_NOW: Final = datetime(2026, 9, 17, 12, 30, tzinfo=UTC)
LOCK_TIMEOUT_SECONDS: Final = 0.2


@dataclass(frozen=True, slots=True)
class PassingValidator:
    def validate(self, root: Path, changes: Mapping[str, bytes | None]) -> Validation:
        return Validation(problems=(), blocking=(), derived={})


def make_service(root: Path, sink: CollectingSink, validator: TreeValidator | None = None) -> WriteService:
    lock = ProjectLock(root, timeout_seconds=LOCK_TIMEOUT_SECONDS)
    chosen = validator if validator is not None else ShadowCheckValidator()
    return WriteService(
        root, validator=chosen, intents=MemoryIntentJournal(), sink=sink, clock=lambda: FIXED_NOW, lock=lock
    )


def current_hash(root: Path, path: str) -> str | None:
    target = root / path
    return file_hash(target.read_bytes()) if target.is_file() else None


def patch(
    flow_id: str, ops: Sequence[Mapping[str, object]], expects: Sequence[str], root: Path, **flags: bool
) -> FlowPatchRequest:
    return FlowPatchRequest.model_validate(
        {
            "flow_id": flow_id,
            "expects": [{"path": path, "file_hash": current_hash(root, path)} for path in expects],
            "ops": list(ops),
            "client_op_id": new_client_op_id(),
            **flags,
        }
    )


def planned_patch(
    service: WriteService, flow_id: str, ops: Sequence[Mapping[str, object]], actor: WriteActor
) -> FlowPatchRequest:
    probe = patch(flow_id, ops, ("aqven.yaml",), service.root, dry_run=True)
    planned = service.patch_flow(probe, actor)
    return patch(flow_id, ops, planned.changed_paths, service.root)


def read(root: Path, path: str) -> str:
    return (root / path).read_text(encoding="utf-8")
