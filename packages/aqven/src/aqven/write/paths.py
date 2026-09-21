import hashlib
import os
import posixpath
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Annotated, Final

from pydantic import AfterValidator, Field

from aqven.loader import file_hash, project_files

AQVEN_FOLDER: Final = ".aqven"
LOCK_PATH: Final = f"{AQVEN_FOLDER}/lock"
TXN_FOLDER: Final = f"{AQVEN_FOLDER}/txn"
DRAFTS_FOLDER: Final = f"{AQVEN_FOLDER}/drafts"
INTENTS_FOLDER: Final = f"{AQVEN_FOLDER}/cache/write_intents"
FILE_HASH_PATTERN: Final = r"^sha256-[0-9a-f]{64}$"
TREE_HASH_PREFIX: Final = "sha256-"
TREE_ENTRY_SEPARATOR: Final = "\t"
TREE_LINE_END: Final = "\n"
FORBIDDEN_SEGMENTS: Final = frozenset({"", ".", ".."})
FORBIDDEN_CHARACTERS: Final = frozenset({"\\", "\x00"})
CACHE_FOLDERS: Final = frozenset({"__pycache__"})
WINDOWS: Final = "nt"

type FileHash = Annotated[str, Field(pattern=FILE_HASH_PATTERN)]


class UnsafePath(ValueError):
    def __init__(self, path: str, reason: str) -> None:
        super().__init__(f"path {path!r}: {reason}")
        self.path = path
        self.reason = reason


def checked_path(path: str) -> str:
    if path.startswith("/") or any(character in path for character in FORBIDDEN_CHARACTERS):
        raise UnsafePath(path, "expected a relative POSIX path inside the project")
    segments = path.split("/")
    if any(segment in FORBIDDEN_SEGMENTS for segment in segments):
        raise UnsafePath(path, "empty segments, . and .. are not allowed")
    if segments[0] == AQVEN_FOLDER:
        raise UnsafePath(path, f"service folder {AQVEN_FOLDER} cannot be written by a definition edit")
    return path


type ProjectPath = Annotated[str, AfterValidator(checked_path)]


def disk_hash(root: Path, path: str) -> str | None:
    target = root / path
    if not target.is_file():
        return None
    return file_hash(target.read_bytes())


def tree_hash(entries: Mapping[str, str]) -> str:
    lines = (f"{path}{TREE_ENTRY_SEPARATOR}{entries[path]}{TREE_LINE_END}" for path in sorted(entries))
    digest = hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()
    return f"{TREE_HASH_PREFIX}{digest}"


def disk_tree(root: Path) -> dict[str, str]:
    return {path: file_hash((root / path).read_bytes()) for path in project_files(root)}


def fsync_directory(folder: Path) -> None:
    if os.name == WINDOWS:
        return
    descriptor = os.open(folder, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def write_durable(target: Path, data: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def replace_durable(target: Path, data: bytes) -> None:
    staged = target.with_name(f"{target.name}.{os.getpid()}.tmp")
    write_durable(staged, data)
    os.replace(staged, target)
    fsync_directory(target.parent)


def prune_empty_folders(root: Path, paths: Iterable[str], stop: str = "") -> None:
    folders = sorted({posixpath.dirname(path) for path in paths if posixpath.dirname(path)}, key=len, reverse=True)
    for folder in folders:
        _prune_upwards(root, folder, stop)


def _prune_upwards(root: Path, folder: str, stop: str) -> None:
    current = folder
    while current and current != stop and current.startswith(stop):
        location = root / current
        if not location.is_dir() or not _removable(location):
            return
        _remove_caches(location)
        location.rmdir()
        current = posixpath.dirname(current)


def _removable(location: Path) -> bool:
    return all(child.is_dir() and child.name in CACHE_FOLDERS for child in location.iterdir())


def _remove_caches(location: Path) -> None:
    for cache in location.iterdir():
        for compiled in cache.iterdir():
            compiled.unlink()
        cache.rmdir()
