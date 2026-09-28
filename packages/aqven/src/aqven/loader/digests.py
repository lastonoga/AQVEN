import hashlib
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from aqven.loader.project import HASH_PREFIX

HASH_ALGORITHM: Final = "sha256"
MAX_REMEMBERED: Final = 100_000

type StatKey = tuple[int, int, int, int, int]


def stat_key(status: os.stat_result) -> StatKey:
    return (status.st_ino, status.st_dev, status.st_size, status.st_mtime_ns, status.st_ctime_ns)


def streamed_hash(location: Path) -> str:
    with location.open("rb") as stream:
        return f"{HASH_PREFIX}{hashlib.file_digest(stream, HASH_ALGORITHM).hexdigest()}"


@dataclass(slots=True)
class DigestCache:
    limit: int = MAX_REMEMBERED
    known: dict[tuple[str, StatKey], str] = field(default_factory=dict[tuple[str, StatKey], str])
    guard: threading.Lock = field(default_factory=threading.Lock)

    def file_hash(self, location: Path) -> str:
        path = os.fspath(location)
        before = stat_key(location.stat())
        remembered = self._get((path, before))
        if remembered is not None:
            return remembered
        digest = streamed_hash(location)
        if stat_key(location.stat()) == before:
            self._put((path, before), digest)
        return digest

    def _get(self, key: tuple[str, StatKey]) -> str | None:
        with self.guard:
            return self.known.get(key)

    def _put(self, key: tuple[str, StatKey], digest: str) -> None:
        with self.guard:
            if len(self.known) >= self.limit:
                self.known.clear()
            self.known[key] = digest


FILE_DIGESTS: Final = DigestCache()
