import asyncio
from collections import deque
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from importlib import import_module
from pathlib import Path
from typing import Annotated, Final, Literal, Protocol, cast

from pydantic import AwareDatetime, Field, JsonValue
from watchfiles import Change, DefaultFilter

from aqven.loader import LoadedFlow
from aqven.runtime.address import ClientOpId, ResourceModel
from aqven.server.resources import CompileStatus, ProblemCounts
from aqven.server.views.common import diagnostics_within, problem_counts
from aqven.server.views.flows import compile_status
from aqven.server.workspace import EMPTY_SNAPSHOT, ProjectWorkspace, TreeSnapshot, WorkspaceState, utc_now

DEFAULT_WINDOW: Final = 1000
GIT_BATCH_LIMIT: Final = 200
DEFAULT_DEBOUNCE_MS: Final = 250
WATCHER_ID: Final = "watchfiles"

type ChangeKind = Literal["added", "modified", "deleted"]
type ActorKind = Literal["human", "agent", "fs", "git", "system"]
type ResyncReason = Literal["window_exceeded", "watcher_restarted", "git_batch"]


class SpecEventBase(ResourceModel):
    seq: Annotated[int, Field(ge=1)]
    at: AwareDatetime
    tree_hash: str


class FileChange(ResourceModel):
    path: str
    change: ChangeKind
    file_hash_before: str | None
    file_hash_after: str | None


class SpecActor(ResourceModel):
    kind: ActorKind
    id: str | None


class FilesChanged(SpecEventBase):
    type: Literal["files_changed"] = "files_changed"
    changes: tuple[FileChange, ...]
    actor: SpecActor
    client_op_id: ClientOpId | None
    ops: tuple[JsonValue, ...] | None
    summary: str


class DiagnosticsChanged(SpecEventBase):
    type: Literal["diagnostics_changed"] = "diagnostics_changed"
    flow_id: str
    compile_status: CompileStatus
    problems: ProblemCounts


class SpecResync(SpecEventBase):
    type: Literal["resync"] = "resync"
    reason: ResyncReason


class WatchChanges(Protocol):
    def __call__(
        self,
        *paths: Path | str,
        watch_filter: Callable[[Change, str], bool] | None = ...,
        debounce: int = ...,
        stop_event: asyncio.Event | None = ...,
    ) -> AsyncGenerator[set[tuple[Change, str]]]: ...


AWATCH: Final = cast(WatchChanges, import_module("watchfiles").awatch)


type SpecEvent = Annotated[FilesChanged | DiagnosticsChanged | SpecResync, Field(discriminator="type")]


@dataclass(frozen=True, slots=True)
class FlowHealth:
    compile_status: CompileStatus
    problems: ProblemCounts


def file_changes(before: TreeSnapshot, after: TreeSnapshot) -> tuple[FileChange, ...]:
    paths = sorted({*before.files, *after.files})
    return tuple(change for path in paths if (change := _change(path, before, after)) is not None)


def _change(path: str, before: TreeSnapshot, after: TreeSnapshot) -> FileChange | None:
    old = before.get(path)
    new = after.get(path)
    old_hash = None if old is None else old.file_hash
    new_hash = None if new is None else new.file_hash
    if old_hash == new_hash:
        return None
    return FileChange(
        path=path, change=_change_kind(old_hash, new_hash), file_hash_before=old_hash, file_hash_after=new_hash
    )


def _change_kind(before: str | None, after: str | None) -> ChangeKind:
    if before is None:
        return "added"
    return "deleted" if after is None else "modified"


def flow_health(state: WorkspaceState) -> Mapping[str, FlowHealth]:
    project = state.report.project
    if project is None:
        return {}
    return {flow_id: health_of(state, flow) for flow_id, flow in project.flows.items()}


def health_of(state: WorkspaceState, flow: LoadedFlow) -> FlowHealth:
    problems = diagnostics_within(state, flow.folder)
    return FlowHealth(compile_status(state, flow, problems), problem_counts(problems))


def change_summary(changes: tuple[FileChange, ...]) -> str:
    counts = {kind: sum(1 for change in changes if change.change == kind) for kind in ("added", "modified", "deleted")}
    return ", ".join(f"{kind}: {count}" for kind, count in counts.items() if count)


@dataclass(slots=True)
class SpecEventHub:
    workspace: ProjectWorkspace
    window: int = DEFAULT_WINDOW
    clock: Callable[[], datetime] = utc_now
    seq: int = 0
    events: deque[SpecEvent] = field(default_factory=deque[SpecEvent])
    snapshot: TreeSnapshot = EMPTY_SNAPSHOT
    health: Mapping[str, FlowHealth] = field(default_factory=dict[str, FlowHealth])
    closed: bool = False
    primed: bool = False
    _changed: asyncio.Condition | None = None

    async def prime(self) -> None:
        state = await self.workspace.state()
        self.snapshot = state.snapshot
        self.health = flow_health(state)
        self.primed = True

    async def refresh(self) -> tuple[SpecEvent, ...]:
        if not self.primed:
            await self.prime()
            return ()
        state = await self.workspace.state()
        changes = file_changes(self.snapshot, state.snapshot)
        if not changes:
            return ()
        health = flow_health(state)
        builders = tuple(self._builders(state, changes, health))
        self.snapshot = state.snapshot
        self.health = health
        return await self._publish(builders)

    async def close(self) -> None:
        self.closed = True
        await self._notify()

    async def follow(self, after_seq: int) -> AsyncIterator[SpecEvent]:
        cursor = after_seq
        reason = self._stale_cursor(cursor)
        if reason is not None:
            yield SpecResync(seq=max(self.seq, 1), at=self.clock(), tree_hash=self.snapshot.tree_hash, reason=reason)
            cursor = self.seq
        while True:
            for event in tuple(event for event in self.events if event.seq > cursor):
                yield event
                cursor = event.seq
            if self.closed:
                return
            await self._wait_after(cursor)

    def _stale_cursor(self, cursor: int) -> ResyncReason | None:
        if cursor > self.seq:
            return "watcher_restarted"
        oldest = self.events[0].seq if self.events else self.seq + 1
        return "window_exceeded" if cursor < oldest - 1 else None

    def _builders(
        self,
        state: WorkspaceState,
        changes: tuple[FileChange, ...],
        health: Mapping[str, FlowHealth],
    ) -> Iterator[Callable[[int], SpecEvent]]:
        tree = state.snapshot.tree_hash
        if len(changes) > GIT_BATCH_LIMIT:
            yield lambda seq: SpecResync(seq=seq, at=self.clock(), tree_hash=tree, reason="git_batch")
            return
        yield lambda seq: FilesChanged(
            seq=seq,
            at=self.clock(),
            tree_hash=tree,
            changes=changes,
            actor=SpecActor(kind="fs", id=WATCHER_ID),
            client_op_id=None,
            ops=None,
            summary=change_summary(changes),
        )
        for flow_id, current in sorted(health.items()):
            if self.health.get(flow_id) != current:
                yield _diagnostics_builder(self.clock, tree, flow_id, current)

    async def _publish(self, builders: tuple[Callable[[int], SpecEvent], ...]) -> tuple[SpecEvent, ...]:
        published: list[SpecEvent] = []
        for build in builders:
            self.seq += 1
            event = build(self.seq)
            self.events.append(event)
            published.append(event)
        while len(self.events) > self.window:
            self.events.popleft()
        await self._notify()
        return tuple(published)

    def _condition(self) -> asyncio.Condition:
        if self._changed is None:
            self._changed = asyncio.Condition()
        return self._changed

    async def _notify(self) -> None:
        condition = self._condition()
        async with condition:
            condition.notify_all()

    async def _wait_after(self, cursor: int) -> None:
        condition = self._condition()
        async with condition:
            await condition.wait_for(lambda: self.seq > cursor or self.closed)


def _diagnostics_builder(
    clock: Callable[[], datetime], tree: str, flow_id: str, health: FlowHealth
) -> Callable[[int], SpecEvent]:
    return lambda seq: DiagnosticsChanged(
        seq=seq,
        at=clock(),
        tree_hash=tree,
        flow_id=flow_id,
        compile_status=health.compile_status,
        problems=health.problems,
    )


class ProjectChangeFilter(DefaultFilter):
    def __init__(self, root: Path) -> None:
        super().__init__()
        self.root = root.resolve()

    def __call__(self, change: Change, path: str) -> bool:
        candidate = Path(path)
        relative = candidate.relative_to(self.root) if candidate.is_relative_to(self.root) else candidate
        if any(part.startswith(".") for part in relative.parts):
            return False
        return super().__call__(change, path)


async def watch_project(
    hub: SpecEventHub, root: Path, stop: asyncio.Event, debounce_ms: int = DEFAULT_DEBOUNCE_MS
) -> None:
    await hub.refresh()
    async for _ in AWATCH(root, watch_filter=ProjectChangeFilter(root), debounce=debounce_ms, stop_event=stop):
        await hub.refresh()
