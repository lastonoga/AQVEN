import os
import shutil
import uuid
from collections.abc import Mapping
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal

from pydantic import ValidationError

from aqven.runtime.address import ResourceModel
from aqven.write.paths import (
    AQVEN_FOLDER,
    TXN_FOLDER,
    fsync_directory,
    prune_empty_folders,
    write_durable,
)

INTENT_FILE: Final = "intent.json"
STAGED_FOLDER: Final = "files"
INTENT_STAGING: Final = "intent.json.tmp"

type RecoveryOutcome = Literal["rolled_forward", "rolled_back"]


class TxnTarget(ResourceModel):
    path: str
    staged: str | None


class TxnIntent(ResourceModel):
    txn_id: str
    created_at: str
    targets: tuple[TxnTarget, ...]
    cleanup: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class RecoveredTransaction:
    txn_id: str
    outcome: RecoveryOutcome
    paths: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Transaction:
    root: Path
    txn_id: str
    changes: Mapping[str, bytes | None]
    cleanup: tuple[str, ...]
    created_at: str

    @classmethod
    def begin(
        cls, root: Path, changes: Mapping[str, bytes | None], cleanup: tuple[str, ...], created_at: str
    ) -> Transaction:
        return cls(root, uuid.uuid4().hex, dict(changes), cleanup, created_at)

    @property
    def folder(self) -> Path:
        return self.root / TXN_FOLDER / self.txn_id

    def run(self) -> None:
        try:
            intent = self.stage()
        except OSError:
            self.abort()
            raise
        self.commit_intent(intent)
        publish(self.root, self.folder, intent)

    def stage(self) -> TxnIntent:
        self.folder.mkdir(parents=True, exist_ok=False)
        targets = tuple(self._staged(index, path, data) for index, (path, data) in enumerate(self.changes.items()))
        _fsync_existing(self.folder / STAGED_FOLDER)
        fsync_directory(self.folder)
        return TxnIntent(txn_id=self.txn_id, created_at=self.created_at, targets=targets, cleanup=self.cleanup)

    def commit_intent(self, intent: TxnIntent) -> None:
        staging = self.folder / INTENT_STAGING
        write_durable(staging, intent.model_dump_json().encode("utf-8"))
        os.replace(staging, self.folder / INTENT_FILE)
        fsync_directory(self.folder)

    def abort(self) -> None:
        shutil.rmtree(self.folder, ignore_errors=True)

    def _staged(self, index: int, path: str, data: bytes | None) -> TxnTarget:
        if data is None:
            return TxnTarget(path=path, staged=None)
        staged = f"{STAGED_FOLDER}/{index}"
        write_durable(self.folder / staged, data)
        return TxnTarget(path=path, staged=staged)


def publish(root: Path, folder: Path, intent: TxnIntent) -> None:
    for target in intent.targets:
        _publish_target(root, folder, target)
    for relative in intent.cleanup:
        with suppress(FileNotFoundError):
            (root / relative).unlink()
    prune_empty_folders(root, (target.path for target in intent.targets if target.staged is None))
    prune_empty_folders(root, intent.cleanup, AQVEN_FOLDER)
    (folder / INTENT_FILE).unlink()
    shutil.rmtree(folder, ignore_errors=True)


def recover_transactions(root: Path) -> tuple[RecoveredTransaction, ...]:
    base = root / TXN_FOLDER
    if not base.is_dir():
        return ()
    return tuple(_recover(root, folder) for folder in sorted(base.iterdir()) if folder.is_dir())


def pending_transactions(root: Path) -> tuple[str, ...]:
    base = root / TXN_FOLDER
    if not base.is_dir():
        return ()
    return tuple(sorted(folder.name for folder in base.iterdir() if folder.is_dir()))


def _recover(root: Path, folder: Path) -> RecoveredTransaction:
    intent = _read_intent(folder)
    if intent is None:
        shutil.rmtree(folder, ignore_errors=True)
        return RecoveredTransaction(folder.name, "rolled_back", ())
    publish(root, folder, intent)
    return RecoveredTransaction(intent.txn_id, "rolled_forward", tuple(target.path for target in intent.targets))


def _read_intent(folder: Path) -> TxnIntent | None:
    try:
        return TxnIntent.model_validate_json((folder / INTENT_FILE).read_bytes())
    except FileNotFoundError, ValidationError:
        return None


def _publish_target(root: Path, folder: Path, target: TxnTarget) -> None:
    destination = root / target.path
    if target.staged is None:
        with suppress(FileNotFoundError):
            destination.unlink()
        _fsync_existing(destination.parent)
        return
    staged = folder / target.staged
    if not staged.is_file():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staged, destination)
    fsync_directory(destination.parent)


def _fsync_existing(folder: Path) -> None:
    if not folder.is_dir():
        return
    fsync_directory(folder)
