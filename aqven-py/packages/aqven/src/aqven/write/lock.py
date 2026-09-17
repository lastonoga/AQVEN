import os
import time
import uuid
from collections.abc import Callable, Generator
from contextlib import contextmanager, suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from pydantic import ValidationError

from aqven.runtime.address import ResourceModel
from aqven.write.errors import WriteError
from aqven.write.model import WriteActor
from aqven.write.paths import LOCK_PATH, fsync_directory

LOCK_TTL_SECONDS: Final = 30.0
ACQUIRE_TIMEOUT_SECONDS: Final = 5.0
POLL_SECONDS: Final = 0.02
LOCK_MODE: Final = 0o600
LOCK_FLAGS: Final = os.O_CREAT | os.O_EXCL | os.O_WRONLY
REFRESH_FLAGS: Final = os.O_CREAT | os.O_TRUNC | os.O_WRONLY
MILLISECONDS: Final = 1000


class LockHolder(ResourceModel):
    token: str
    pid: int
    actor: WriteActor
    acquired_at: float
    expires_at: float


@dataclass(slots=True)
class LockLease:
    path: Path
    holder: LockHolder
    ttl_seconds: float
    clock: Callable[[], float]

    def refresh(self) -> None:
        now = self.clock()
        self.holder = self.holder.model_copy(update={"expires_at": now + self.ttl_seconds})
        staged = self.path.with_name(f"{self.path.name}.{self.holder.token}")
        _write_owner_only(os.open(staged, REFRESH_FLAGS, LOCK_MODE), self.holder)
        os.replace(staged, self.path)

    def release(self) -> None:
        current = read_holder(self.path)
        if current is None or current.token != self.holder.token:
            return
        with suppress(FileNotFoundError):
            self.path.unlink()


def _write_owner_only(descriptor: int, holder: LockHolder) -> None:
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(holder.model_dump_json().encode("utf-8"))
        stream.flush()
        os.fsync(stream.fileno())


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def read_holder(path: Path) -> LockHolder | None:
    try:
        return LockHolder.model_validate_json(path.read_bytes())
    except FileNotFoundError, ValidationError:
        return None


@dataclass(slots=True)
class ProjectLock:
    root: Path
    ttl_seconds: float = LOCK_TTL_SECONDS
    timeout_seconds: float = ACQUIRE_TIMEOUT_SECONDS
    clock: Callable[[], float] = time.time
    alive: Callable[[int], bool] = field(default=process_alive)

    @property
    def path(self) -> Path:
        return self.root / LOCK_PATH

    def holder(self) -> LockHolder | None:
        holder = read_holder(self.path)
        if holder is None or self._stale(holder):
            return None
        return holder

    @contextmanager
    def hold(self, actor: WriteActor) -> Generator[LockLease]:
        lease = self.acquire(actor)
        try:
            yield lease
        finally:
            lease.release()

    def acquire(self, actor: WriteActor) -> LockLease:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + self.timeout_seconds
        while True:
            lease = self._try_acquire(actor)
            if lease is not None:
                return lease
            if time.monotonic() >= deadline:
                raise self._busy()
            time.sleep(POLL_SECONDS)

    def _try_acquire(self, actor: WriteActor) -> LockLease | None:
        now = self.clock()
        holder = LockHolder(
            token=uuid.uuid4().hex,
            pid=os.getpid(),
            actor=actor,
            acquired_at=now,
            expires_at=now + self.ttl_seconds,
        )
        try:
            descriptor = os.open(self.path, LOCK_FLAGS, LOCK_MODE)
        except FileExistsError:
            self._break_stale()
            return None
        _write_owner_only(descriptor, holder)
        fsync_directory(self.path.parent)
        return LockLease(self.path, holder, self.ttl_seconds, self.clock)

    def _break_stale(self) -> None:
        holder = read_holder(self.path)
        if holder is not None and not self._stale(holder):
            return
        if holder is None and not self._unreadable_expired():
            return
        with suppress(FileNotFoundError):
            self.path.unlink()

    def _stale(self, holder: LockHolder) -> bool:
        return holder.expires_at <= self.clock() or not self.alive(holder.pid)

    def _unreadable_expired(self) -> bool:
        try:
            modified = self.path.stat().st_mtime
        except FileNotFoundError:
            return False
        return modified + self.ttl_seconds <= self.clock()

    def _busy(self) -> WriteError:
        holder = self.holder()
        if holder is None:
            return WriteError("LOCK_BUSY", ".aqven/lock is busy", retry_after_ms=int(POLL_SECONDS * MILLISECONDS))
        wait = max(holder.expires_at - self.clock(), POLL_SECONDS)
        message = f".aqven/lock is held by {holder.actor.kind}:{holder.actor.id} (pid {holder.pid})"
        return WriteError("LOCK_BUSY", message, retry_after_ms=int(wait * MILLISECONDS))
