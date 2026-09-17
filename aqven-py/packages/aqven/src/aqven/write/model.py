from typing import Annotated, Final, Literal

from pydantic import Field, JsonValue

from aqven.diagnostics import Diagnostic
from aqven.runtime.address import ClientOpId, JsonObject, RequestModel, ResourceModel
from aqven.spec import NAME_PATTERN, FlowId, NodeId
from aqven.write.paths import FileHash, ProjectPath

MAX_OPS: Final = 50
ULID_PATTERN: Final = r"^[0-9A-HJKMNP-TV-Z]{26}$"
NODE_REF_PATTERN: Final = r"^[a-z][a-z0-9_]{0,62}(__[a-z][a-z0-9_]{0,62})*$"
SLOT_TARGET_PATTERN: Final = r"^[a-z][a-z0-9_]{0,62}(__[a-z][a-z0-9_]{0,62})*\.[a-z][a-z0-9_]{0,62}$"
SPEC_PATH_PATTERN: Final = r"^(flow|nodes/[a-z][a-z0-9_]*|inferences/[a-z][a-z0-9_]*)(/[A-Za-z0-9_-]+)+$"

type ActorKind = Literal["human", "agent", "fs", "git", "system"]
type WriteOperation = Literal["flow_patch", "prompt_save"]
type Ulid = Annotated[ClientOpId, Field(pattern=ULID_PATTERN)]
type EntityName = Annotated[str, Field(pattern=NAME_PATTERN)]
type NodeRef = Annotated[str, Field(pattern=NODE_REF_PATTERN)]


class WriteActor(RequestModel):
    kind: ActorKind
    id: str = Field(min_length=1)


class ExpectedFile(RequestModel):
    path: ProjectPath
    file_hash: FileHash | None


class AddNodeOp(RequestModel):
    op: Literal["add_node"]
    node_id: EntityName
    parent: NodeRef | None = None
    index: int | None = Field(default=None, ge=0)
    spec: JsonObject
    inference: JsonObject | None = None
    prompt: str | None = None


class RemoveNodeOp(RequestModel):
    op: Literal["remove_node"]
    node_id: NodeRef


class RenameNodeOp(RequestModel):
    op: Literal["rename_node"]
    node_id: NodeRef
    to: EntityName


class MoveNodeOp(RequestModel):
    op: Literal["move_node"]
    node_id: NodeRef
    index: int | None = Field(default=None, ge=0)
    to_flow: EntityName | None = None


class SetOp(RequestModel):
    op: Literal["set"]
    path: Annotated[str, Field(pattern=SPEC_PATH_PATTERN)]
    value: JsonValue


class UnsetOp(RequestModel):
    op: Literal["unset"]
    path: Annotated[str, Field(pattern=SPEC_PATH_PATTERN)]


class BindOp(RequestModel):
    op: Literal["bind"]
    target: Annotated[str, Field(pattern=SLOT_TARGET_PATTERN)]
    source: str = Field(min_length=1)


class UnbindOp(RequestModel):
    op: Literal["unbind"]
    target: Annotated[str, Field(pattern=SLOT_TARGET_PATTERN)]


class RenameFlowOp(RequestModel):
    op: Literal["rename_flow"]
    to: EntityName


type PatchOp = Annotated[
    AddNodeOp | RemoveNodeOp | RenameNodeOp | MoveNodeOp | SetOp | UnsetOp | BindOp | UnbindOp | RenameFlowOp,
    Field(discriminator="op"),
]


class FlowPatchRequest(RequestModel):
    flow_id: EntityName
    expects: list[ExpectedFile] = Field(min_length=1)
    ops: list[PatchOp] = Field(min_length=1, max_length=MAX_OPS)
    client_op_id: Ulid
    intent: str | None = None
    expect_lock: bool = False
    exclusive: bool = False
    dry_run: bool = False


class PromptSaveRequest(RequestModel):
    flow_id: EntityName
    node_id: NodeRef
    expects: list[ExpectedFile] = Field(min_length=1, max_length=1)
    client_op_id: Ulid


class DraftWrite(RequestModel):
    text: str
    base_file_hash: FileHash | None


class VersionFile(ResourceModel):
    path: str
    file_hash: str | None


class WriteVersion(ResourceModel):
    files: tuple[VersionFile, ...]
    dirty: bool
    actor: WriteActor
    client_op_id: ClientOpId


class WriteFocus(ResourceModel):
    flow_id: FlowId
    node_id: NodeId | None


class JournalEntry(ResourceModel):
    kind: str
    from_: str = Field(alias="from")
    to: str
    at: str


class WriteResult(ResourceModel):
    ok: Literal[True] = True
    op: WriteOperation
    dry_run: bool
    version: WriteVersion
    tree_hash: str | None
    changed_paths: tuple[str, ...]
    applied_ops: tuple[JsonValue, ...]
    renames: tuple[JournalEntry, ...]
    focus: WriteFocus | None
    problems: tuple[Diagnostic, ...]
    candidates: tuple[JsonValue, ...] = ()


class DraftView(ResourceModel):
    path: str
    text: str
    base_file_hash: str | None
    updated_at: str
    actor: WriteActor
    stale: bool
    file_hash: str | None
