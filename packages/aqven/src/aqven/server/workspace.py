import asyncio
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Protocol

from anyio import to_thread
from pydantic import JsonValue

from aqven.check import CheckReport, check_project
from aqven.compiler import compile_project
from aqven.ir.hashing import canonical_json
from aqven.ir.plan import CompiledProject
from aqven.loader import ProjectIndex, build_index, file_hash, project_files

TREE_HASH_PREFIX: Final = "sha256-"


class ProjectCompiler(Protocol):
    def compile(self, report: CheckReport) -> CompiledProject: ...


@dataclass(frozen=True, slots=True)
class FileStat:
    path: str
    file_hash: str
    size_bytes: int
    mtime_ns: int


@dataclass(frozen=True, slots=True)
class TreeSnapshot:
    files: Mapping[str, FileStat]
    tree_hash: str

    def get(self, path: str) -> FileStat | None:
        return self.files.get(path)


EMPTY_SNAPSHOT: Final = TreeSnapshot(files={}, tree_hash="")


def tree_hash(files: Mapping[str, FileStat]) -> str:
    listing: dict[str, JsonValue] = {path: stat.file_hash for path, stat in sorted(files.items())}
    return file_hash(canonical_json(listing))


def take_snapshot(root: Path, previous: TreeSnapshot = EMPTY_SNAPSHOT) -> TreeSnapshot:
    stats = {stat.path: stat for stat in _stats(root, previous)}
    return TreeSnapshot(files=stats, tree_hash=tree_hash(stats))


def _stats(root: Path, previous: TreeSnapshot) -> Iterator[FileStat]:
    for relative in project_files(root):
        current = _stat(root, relative, previous.get(relative))
        if current is not None:
            yield current


def _stat(root: Path, relative: str, known: FileStat | None) -> FileStat | None:
    location = root / relative
    try:
        status = location.stat()
    except OSError:
        return None
    unchanged = known is not None and known.size_bytes == status.st_size and known.mtime_ns == status.st_mtime_ns
    if unchanged:
        return known
    try:
        data = location.read_bytes()
    except OSError:
        return None
    return FileStat(relative, file_hash(data), len(data), status.st_mtime_ns)


@dataclass(frozen=True, slots=True)
class WorkspaceState:
    root: Path
    snapshot: TreeSnapshot
    report: CheckReport
    index: ProjectIndex | None
    compiled: CompiledProject | None
    generation: int
    indexed_at: datetime


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
    return WorkspaceState(root, snapshot, report, index, compiled, generation, clock())


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class ProjectWorkspace:
    root: Path
    compiler: ProjectCompiler | None = None
    clock: Callable[[], datetime] = utc_now
    _state: WorkspaceState | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def latest(self) -> WorkspaceState | None:
        return self._state

    async def snapshot(self) -> TreeSnapshot:
        previous = EMPTY_SNAPSHOT if self._state is None else self._state.snapshot
        return await to_thread.run_sync(take_snapshot, self.root, previous)

    async def state(self) -> WorkspaceState:
        async with self._lock:
            snapshot = await self.snapshot()
            cached = self._state
            if cached is not None and cached.snapshot.tree_hash == snapshot.tree_hash:
                return cached
            generation = 1 if cached is None else cached.generation + 1
            fresh = await to_thread.run_sync(build_state, self.root, snapshot, generation, self.compiler, self.clock)
            self._state = fresh
            return fresh


@dataclass(frozen=True, slots=True)
class WorkspacePlanSource:
    workspace: ProjectWorkspace

    async def current(self) -> CompiledProject:
        state = self.workspace.latest() or await self.workspace.state()
        if state.compiled is not None:
            return state.compiled
        return await to_thread.run_sync(compile_project, state.report)
