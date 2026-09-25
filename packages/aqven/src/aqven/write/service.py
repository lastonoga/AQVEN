from collections.abc import Callable, Generator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Protocol

from pydantic import JsonValue

from aqven.diagnostics import Diagnostic
from aqven.loader import file_hash
from aqven.runtime.address import ClientOpId
from aqven.spec import FlowId, NodeId
from aqven.write.drafts import DraftStore
from aqven.write.errors import DraftTexts, WriteConflict, WriteError, WriteErrorCode, not_found, request_invalid
from aqven.write.intents import IntentJournal, MemoryIntentJournal
from aqven.write.lock import LockLease, ProjectLock
from aqven.write.model import (
    DraftView,
    DraftWrite,
    ExpectedFile,
    FileBytesWriteRequest,
    FilesWriteRequest,
    FlowPatchRequest,
    PromptSaveRequest,
    VersionFile,
    WriteActor,
    WriteFocus,
    WriteOperation,
    WriteResult,
    WriteVersion,
)
from aqven.write.notices import (
    ChangeKind,
    CollectingSink,
    ExclusiveBegan,
    ExclusiveEnded,
    FileChange,
    FilesChanged,
    SelfWrites,
    SpecNoticeSink,
    TransactionRecovered,
)
from aqven.write.ops import PatchContext, apply_op
from aqven.write.paths import disk_hash, disk_tree, tree_hash
from aqven.write.prompts import PromptFile, node_prompt
from aqven.write.tree import FileState, WorkingTree
from aqven.write.txn import RecoveredTransaction, Transaction, recover_transactions
from aqven.write.validation import ShadowCheckValidator, TreeValidator, Validation

TIMESTAMP_FORMAT: Final = "%Y-%m-%dT%H:%M:%SZ"
SYSTEM_ACTOR: Final = WriteActor(kind="system", id="aqven")

CONFLICT_CODES: Final[Mapping[tuple[bool, bool], WriteErrorCode]] = {
    (True, False): "FILE_EXISTS",
    (False, True): "FILE_VANISHED",
    (False, False): "STALE_FILE",
}

CONFLICT_MESSAGES: Final[Mapping[WriteErrorCode, str]] = {
    "FILE_EXISTS": "{path} already exists, but the file was expected to be absent",
    "FILE_VANISHED": "{path} was deleted after it was read",
    "STALE_FILE": "{path} changed after it was read",
}


class FlowLockView(Protocol):
    def holder(self, flow_id: str) -> WriteActor | None: ...


@dataclass(frozen=True, slots=True)
class NoFlowLocks:
    def holder(self, flow_id: str) -> WriteActor | None:
        return None


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class _Request:
    operation: WriteOperation
    expects: list[ExpectedFile]
    client_op_id: ClientOpId
    ops: tuple[JsonValue, ...]
    dry_run: bool


@dataclass(frozen=True, slots=True)
class _Plan:
    changes: Mapping[str, FileState]
    validation: Validation
    flow_id: str | None
    focus: NodeId | None
    renames: tuple[JsonValue, ...]

    @property
    def planned(self) -> dict[str, FileState]:
        return {**self.changes, **self.validation.derived}


@dataclass(slots=True)
class WriteService:
    root: Path
    validator: TreeValidator = field(default_factory=ShadowCheckValidator)
    intents: IntentJournal = field(default_factory=MemoryIntentJournal)
    sink: SpecNoticeSink = field(default_factory=CollectingSink)
    self_writes: SelfWrites = field(default_factory=SelfWrites)
    flow_locks: FlowLockView = field(default_factory=NoFlowLocks)
    clock: Callable[[], datetime] = utc_now
    lock: ProjectLock | None = None

    @property
    def project_lock(self) -> ProjectLock:
        if self.lock is None:
            self.lock = ProjectLock(self.root)
        return self.lock

    @property
    def drafts(self) -> DraftStore:
        return DraftStore(self.root, self._timestamp)

    def recover(self) -> tuple[RecoveredTransaction, ...]:
        with self.project_lock.hold(SYSTEM_ACTOR):
            recovered = recover_transactions(self.root)
        for item in recovered:
            self.sink.publish(TransactionRecovered(txn_id=item.txn_id, outcome=item.outcome, paths=item.paths))
        return recovered

    def patch_flow(self, request: FlowPatchRequest, actor: WriteActor) -> WriteResult:
        replay = self.intents.find(request.client_op_id)
        if replay is not None:
            return replay
        self._check_flow_lock(request, actor)
        with self._exclusive(request, actor), self.project_lock.hold(actor) as lease:
            return self._patch_locked(request, actor, lease)

    def write_files(self, request: FilesWriteRequest, actor: WriteActor) -> WriteResult:
        encoded = {path: text.encode("utf-8") for path, text in request.files.items()}
        edit = FileBytesWriteRequest(
            expects=request.expects, files=encoded, client_op_id=request.client_op_id, intent=request.intent
        )
        return self.write_bytes(edit, actor)

    def write_bytes(self, request: FileBytesWriteRequest, actor: WriteActor) -> WriteResult:
        replay = self.intents.find(request.client_op_id)
        if replay is not None:
            return replay
        with self.project_lock.hold(actor) as lease:
            return self._files_locked(request, actor, lease)

    def put_draft(self, flow_id: str, node_id: str, write: DraftWrite, actor: WriteActor) -> DraftView:
        prompt = node_prompt(self.root, flow_id, node_id)
        return self.drafts.put(prompt.path, write, actor)

    def get_draft(self, flow_id: str, node_id: str) -> DraftView | None:
        prompt = node_prompt(self.root, flow_id, node_id)
        return self.drafts.get(prompt.path)

    def delete_draft(self, flow_id: str, node_id: str) -> bool:
        prompt = node_prompt(self.root, flow_id, node_id)
        return self.drafts.delete(prompt.path)

    def draft_problems(self, flow_id: str, node_id: str) -> tuple[Diagnostic, ...]:
        prompt = node_prompt(self.root, flow_id, node_id)
        draft = self.drafts.get(prompt.path)
        if draft is None:
            raise not_found(f"prompt {prompt.path} has no draft")
        validation = self.validator.validate(self.root, {prompt.path: draft.text.encode("utf-8")})
        return tuple(item for item in validation.problems if item.file == prompt.path)

    def save_prompt(self, request: PromptSaveRequest, actor: WriteActor) -> WriteResult:
        replay = self.intents.find(request.client_op_id)
        if replay is not None:
            return replay
        prompt = node_prompt(self.root, request.flow_id, request.node_id)
        expected = request.expects[0]
        if expected.path != prompt.path:
            raise request_invalid(f"expects names {expected.path}, but the node prompt is at {prompt.path}")
        with self.project_lock.hold(actor) as lease:
            return self._save_locked(request, prompt, actor, lease)

    def _patch_locked(self, request: FlowPatchRequest, actor: WriteActor, lease: LockLease) -> WriteResult:
        replay = self.intents.find(request.client_op_id)
        if replay is not None:
            return replay
        if not request.dry_run:
            _verify_expects(self.root, request.expects)
        plan = self._plan(request)
        ops = tuple(op.model_dump(mode="json", by_alias=True) for op in request.ops)
        result = self._result(
            _Request("flow_patch", request.expects, request.client_op_id, ops, request.dry_run), actor, plan
        )
        if request.dry_run:
            return result
        return self._committed(result, plan, (), actor, request.intent, lease)

    def _files_locked(self, request: FileBytesWriteRequest, actor: WriteActor, lease: LockLease) -> WriteResult:
        replay = self.intents.find(request.client_op_id)
        if replay is not None:
            return replay
        _verify_expects(self.root, request.expects)
        changes: dict[str, FileState] = {
            path: data for path, data in request.files.items() if not _same_bytes(self.root, path, data)
        }
        _require_coverage(self.root, changes, request.expects)
        plan = _Plan(changes, self._validated(changes), None, None, ())
        result = self._result(_Request("files_write", request.expects, request.client_op_id, (), False), actor, plan)
        return self._committed(result, plan, (), actor, request.intent, lease)

    def _save_locked(
        self, request: PromptSaveRequest, prompt: PromptFile, actor: WriteActor, lease: LockLease
    ) -> WriteResult:
        draft = self.drafts.get(prompt.path)
        if draft is None:
            raise not_found(f"prompt {prompt.path} has no draft: nothing to save")
        expected = request.expects[0]
        current = disk_hash(self.root, prompt.path)
        if current != expected.file_hash:
            raise _draft_conflict(self.root, self.drafts, expected, current, draft.text)
        data = draft.text.encode("utf-8")
        changes: dict[str, FileState] = {} if _same_bytes(self.root, prompt.path, data) else {prompt.path: data}
        validation = self._validated(changes)
        plan = _Plan(changes, validation, prompt.flow_id, prompt.node_id, ())
        result = self._result(_Request("prompt_save", request.expects, request.client_op_id, (), False), actor, plan)
        return self._committed(result, plan, self.drafts.files(prompt.path), actor, None, lease)

    def _committed(
        self,
        result: WriteResult,
        plan: _Plan,
        cleanup: tuple[str, ...],
        actor: WriteActor,
        intent: str | None,
        lease: LockLease,
    ) -> WriteResult:
        planned = plan.planned
        before = {path: disk_hash(self.root, path) for path in planned}
        lease.refresh()
        self._commit(planned, cleanup)
        committed = result.model_copy(update={"tree_hash": tree_hash(disk_tree(self.root))})
        self._announce(committed, planned, before, actor, intent)
        self.intents.record(committed.version.client_op_id, committed)
        return committed

    def _plan(self, request: FlowPatchRequest) -> _Plan:
        tree = WorkingTree.open(self.root)
        context = PatchContext(tree=tree, flow_id=request.flow_id, now=self._timestamp())
        for op in request.ops:
            apply_op(context, op)
        changes = tree.changes()
        if not request.dry_run:
            _require_coverage(self.root, changes, request.expects)
        validation = self._validated(changes)
        focus = context.focus[0] if context.focus else None
        renames = tuple(entry.model_dump(mode="json", by_alias=True) for entry in context.renames)
        return _Plan(changes, validation, context.flow_id, focus, renames)

    def _validated(self, changes: Mapping[str, FileState]) -> Validation:
        validation = self.validator.validate(self.root, changes)
        if validation.blocking:
            count = len(validation.blocking)
            message = f"edit breaks the project: {count} new blocking diagnostics, disk not touched"
            raise WriteError("BLOCKING_PROBLEMS", message, problems=validation.blocking)
        return validation

    def _result(self, request: _Request, actor: WriteActor, plan: _Plan) -> WriteResult:
        planned = plan.planned
        declared = {expected.path for expected in request.expects}
        files = tuple(
            VersionFile(path=path, file_hash=_planned_hash(self.root, planned, path))
            for path in sorted({*declared, *planned})
        )
        version = WriteVersion(files=files, dirty=bool(planned), actor=actor, client_op_id=request.client_op_id)
        return WriteResult.model_validate(
            {
                "op": request.operation,
                "dry_run": request.dry_run,
                "version": version,
                "tree_hash": None,
                "changed_paths": tuple(sorted(planned)),
                "applied_ops": request.ops,
                "renames": plan.renames,
                "focus": _focus(plan),
                "problems": plan.validation.problems,
            }
        )

    def _commit(self, planned: Mapping[str, FileState], cleanup: tuple[str, ...]) -> None:
        for path, data in planned.items():
            self.self_writes.expect(path, file_hash(data) if data is not None else None)
        transaction = Transaction.begin(self.root, planned, cleanup, self._timestamp())
        try:
            transaction.run()
        except OSError as error:
            message = f"write failed: {error.strerror or type(error).__name__} ({error.filename or '-'})"
            raise WriteError("INTERNAL", message) from error

    def _announce(
        self,
        result: WriteResult,
        planned: Mapping[str, FileState],
        before: Mapping[str, str | None],
        actor: WriteActor,
        intent: str | None,
    ) -> None:
        changes = tuple(_change(path, before[path], planned[path]) for path in sorted(planned))
        self.sink.publish(
            FilesChanged(
                changes=changes,
                actor=actor,
                client_op_id=result.version.client_op_id,
                ops=result.applied_ops or None,
                summary=intent or f"{result.op}: {len(planned)} files",
                tree_hash=result.tree_hash or "",
            )
        )
        for change in changes:
            notice = self.drafts.stale_notice(change.path, change.file_hash_after)
            if notice is not None:
                self.sink.publish(notice)

    def _check_flow_lock(self, request: FlowPatchRequest, actor: WriteActor) -> None:
        holder = self.flow_locks.holder(request.flow_id)
        if not request.expect_lock or holder is None or holder == actor:
            return
        raise WriteError("LOCK_BUSY", f"flow {request.flow_id} is held by {holder.kind}:{holder.id}")

    @contextmanager
    def _exclusive(self, request: FlowPatchRequest, actor: WriteActor) -> Generator[None]:
        if not request.exclusive or request.dry_run:
            yield
            return
        self.sink.publish(ExclusiveBegan(actor=actor, flow_id=request.flow_id))
        try:
            yield
        finally:
            self.sink.publish(ExclusiveEnded(actor=actor, flow_id=request.flow_id))

    def _timestamp(self) -> str:
        return self.clock().astimezone(UTC).strftime(TIMESTAMP_FORMAT)


def _focus(plan: _Plan) -> WriteFocus | None:
    if plan.flow_id is None:
        return None
    return WriteFocus(flow_id=FlowId(plan.flow_id), node_id=plan.focus)


def _verify_expects(root: Path, expects: list[ExpectedFile]) -> None:
    for expected in expects:
        current = disk_hash(root, expected.path)
        if current == expected.file_hash:
            continue
        code = CONFLICT_CODES[(expected.file_hash is None, current is None)]
        conflict = WriteConflict(path=expected.path, your_hash=expected.file_hash, current_hash=current)
        raise WriteError(code, CONFLICT_MESSAGES[code].format(path=expected.path), conflict=conflict)


def _require_coverage(root: Path, changes: Mapping[str, FileState], expects: list[ExpectedFile]) -> None:
    declared = {expected.path for expected in expects}
    missing = tuple(path for path in changes if path not in declared)
    if not missing:
        return
    candidates = tuple[JsonValue, ...](_expected_file(root, path) for path in missing)
    message = f"edit touches paths outside expects: {', '.join(missing)}; add them with their current hashes"
    raise WriteError("REQUEST_INVALID", message, candidates=candidates)


def _draft_conflict(
    root: Path, drafts: DraftStore, expected: ExpectedFile, current: str | None, draft: str
) -> WriteError:
    code = CONFLICT_CODES[(expected.file_hash is None, current is None)]
    disk = (root / expected.path).read_text(encoding="utf-8") if current is not None else None
    texts = DraftTexts(draft=draft, base=drafts.base_text(expected.path), disk=disk)
    conflict = WriteConflict(path=expected.path, your_hash=expected.file_hash, current_hash=current, texts=texts)
    return WriteError(code, CONFLICT_MESSAGES[code].format(path=expected.path), conflict=conflict)


def _same_bytes(root: Path, path: str, data: bytes) -> bool:
    target = root / path
    return target.is_file() and target.read_bytes() == data


def _planned_hash(root: Path, planned: Mapping[str, FileState], path: str) -> str | None:
    if path not in planned:
        return disk_hash(root, path)
    data = planned[path]
    return file_hash(data) if data is not None else None


def _change(path: str, before: str | None, data: FileState) -> FileChange:
    after = file_hash(data) if data is not None else None
    return FileChange(path=path, change=_change_kind(before, after), file_hash_before=before, file_hash_after=after)


def _change_kind(before: str | None, after: str | None) -> ChangeKind:
    if before is None:
        return "added"
    if after is None:
        return "deleted"
    return "modified"


def _expected_file(root: Path, path: str) -> JsonValue:
    return {"path": path, "file_hash": disk_hash(root, path)}
