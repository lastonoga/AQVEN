import asyncio
import hashlib
import os
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Protocol

from anyio import to_thread
from pydantic import JsonValue

from aqven.check import CheckReport, check_project
from aqven.compiler import compile_project
from aqven.datasets.media_refs import referenced_media_paths
from aqven.ir.hashing import canonical_json
from aqven.ir.plan import CompiledProject
from aqven.loader import ProjectIndex, build_index, file_hash, is_spec_path, project_files
from aqven.loader.digests import FILE_DIGESTS
from aqven.runtime.address import JsonObject

TREE_HASH_PREFIX: Final = "sha256-"
ASSET_FINGERPRINT_PREFIX: Final = "stat-"
ENTRY_SEPARATOR: Final = "\0"


class ProjectCompiler(Protocol):
    def compile(self, report: CheckReport) -> CompiledProject: ...


@dataclass(frozen=True, slots=True)
class FileStat:
    path: str
    file_hash: str | None
    size_bytes: int
    mtime_ns: int

    @property
    def fingerprint(self) -> str:
        if self.file_hash is not None:
            return self.file_hash
        return f"{ASSET_FINGERPRINT_PREFIX}{self.size_bytes}-{self.mtime_ns}"


@dataclass(frozen=True, slots=True)
class TreeSnapshot:
    files: Mapping[str, FileStat]
    tree_hash: str

    def get(self, path: str) -> FileStat | None:
        return self.files.get(path)


EMPTY_SNAPSHOT: Final = TreeSnapshot(files={}, tree_hash="")


def tree_hash(files: Mapping[str, FileStat]) -> str:
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(f"{path}{ENTRY_SEPARATOR}{files[path].fingerprint}{ENTRY_SEPARATOR}".encode())
    return f"{TREE_HASH_PREFIX}{digest.hexdigest()}"


def take_snapshot(root: Path, previous: TreeSnapshot = EMPTY_SNAPSHOT) -> TreeSnapshot:
    stats = {stat.path: stat for stat in _stats(root, previous)}
    return TreeSnapshot(files=stats, tree_hash=tree_hash(stats))


def _stats(root: Path, previous: TreeSnapshot) -> Iterator[FileStat]:
    base = os.fspath(root)
    for relative in project_files(root):
        current = _stat(os.path.join(base, relative), relative, previous.get(relative))
        if current is not None:
            yield current


def _stat(location: str, relative: str, known: FileStat | None) -> FileStat | None:
    try:
        status = os.stat(location)
    except OSError:
        return None
    unchanged = known is not None and known.size_bytes == status.st_size and known.mtime_ns == status.st_mtime_ns
    if unchanged:
        return known
    if not is_spec_path(relative):
        return FileStat(relative, None, status.st_size, status.st_mtime_ns)
    try:
        with open(location, "rb") as stream:
            data = stream.read()
    except OSError:
        return None
    return FileStat(relative, file_hash(data), len(data), status.st_mtime_ns)


def spec_key(snapshot: TreeSnapshot, media_paths: frozenset[str]) -> str:
    sources: JsonObject = {path: stat.file_hash for path, stat in snapshot.files.items() if stat.file_hash is not None}
    present: list[JsonValue] = [path for path in sorted(media_paths) if path in snapshot.files]
    return file_hash(canonical_json({"sources": sources, "media": present}))


@dataclass(frozen=True, slots=True)
class WorkspaceState:
    root: Path
    snapshot: TreeSnapshot
    report: CheckReport
    index: ProjectIndex | None
    compiled: CompiledProject | None
    generation: int
    indexed_at: datetime
    spec_key: str = ""
    media_paths: frozenset[str] = frozenset()

    def covers(self, snapshot: TreeSnapshot) -> bool:
        return spec_key(snapshot, self.media_paths) == self.spec_key


def build_state(
    root: Path,
    snapshot: TreeSnapshot,
    generation: int,
    compiler: ProjectCompiler | None,
    clock: Callable[[], datetime],
) -> WorkspaceState:
    report = check_project(root)
    project = report.project
    index = build_index(project) if project is not None else None
    compiled = compiler.compile(report) if compiler is not None and report.ok else None
    media = referenced_media_paths(project)
    key = spec_key(snapshot, media)
    return WorkspaceState(root, snapshot, report, index, compiled, generation, clock(), key, media)


def utc_now() -> datetime:
    return datetime.now(UTC)


def quiet_rebuild() -> None:
    return None


@dataclass(slots=True)
class ProjectWorkspace:
    root: Path
    compiler: ProjectCompiler | None = None
    clock: Callable[[], datetime] = utc_now
    _state: WorkspaceState | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _asked: int = 0
    _answered: int = 0

    def latest(self) -> WorkspaceState | None:
        return self._state

    async def snapshot(self) -> TreeSnapshot:
        previous = EMPTY_SNAPSHOT if self._state is None else self._state.snapshot
        return await to_thread.run_sync(take_snapshot, self.root, previous)

    async def state(self, on_rebuild: Callable[[], None] = quiet_rebuild) -> WorkspaceState:
        self._asked += 1
        ticket = self._asked
        async with self._lock:
            cached = self._state
            if cached is not None and self._answered >= ticket:
                return cached
            covered = self._asked
            fresh = await self._fresh(cached, on_rebuild)
            self._state = fresh
            self._answered = covered
            return fresh

    async def file_hash(self, stat: FileStat) -> str | None:
        if stat.file_hash is not None:
            return stat.file_hash
        try:
            return await to_thread.run_sync(FILE_DIGESTS.file_hash, self.root / stat.path)
        except OSError:
            return None

    async def file_hashes(self, stats: Iterable[FileStat]) -> dict[str, str]:
        found = {stat.path: await self.file_hash(stat) for stat in stats}
        return {path: digest for path, digest in found.items() if digest is not None}

    async def _fresh(self, cached: WorkspaceState | None, on_rebuild: Callable[[], None]) -> WorkspaceState:
        snapshot = await self.snapshot()
        if cached is not None and cached.snapshot.tree_hash == snapshot.tree_hash:
            return cached
        return await self._next(cached, snapshot, on_rebuild)

    async def _next(
        self, cached: WorkspaceState | None, snapshot: TreeSnapshot, on_rebuild: Callable[[], None]
    ) -> WorkspaceState:
        if cached is not None and cached.covers(snapshot):
            return replace(cached, snapshot=snapshot)
        on_rebuild()
        generation = 1 if cached is None else cached.generation + 1
        return await to_thread.run_sync(build_state, self.root, snapshot, generation, self.compiler, self.clock)


@dataclass(frozen=True, slots=True)
class WorkspacePlanSource:
    workspace: ProjectWorkspace

    async def current(self) -> CompiledProject:
        state = self.workspace.latest() or await self.workspace.state()
        if state.compiled is not None:
            return state.compiled
        return await to_thread.run_sync(compile_project, state.report)
