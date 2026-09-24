import asyncio
import logging
from collections import deque
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Iterator, Mapping, Sequence
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime
from importlib import import_module
from pathlib import Path
from typing import Annotated, Final, Literal, Protocol, cast

from pydantic import AwareDatetime, Field, JsonValue
from watchfiles import Change, DefaultFilter

from aqven.diagnostics import Diagnostic
from aqven.loader import LoadedFlow, within
from aqven.runtime.address import ClientOpId, ResourceModel
from aqven.series.feed import ResearchNotice
from aqven.server.research_events import (
    EventStamp,
    ExperimentChanged,
    ExperimentTouch,
    FindingWritten,
    SeriesProgressEvent,
    SeriesStartedEvent,
    SeriesStatusChanged,
    experiment_touches,
    research_event,
)
from aqven.server.resources import CompileStatus, ProblemCounts
from aqven.server.simulation import SimulationRun, SubprocessSimulation
from aqven.server.views.common import diagnostics_within, problem_counts
from aqven.server.views.flows import compile_status
from aqven.server.workspace import EMPTY_SNAPSHOT, ProjectWorkspace, TreeSnapshot, WorkspaceState, utc_now

DEFAULT_WINDOW: Final = 1000
GIT_BATCH_LIMIT: Final = 200
DEFAULT_DEBOUNCE_MS: Final = 250
WATCHER_ID: Final = "watchfiles"
WATCHER_RESTART_SECONDS: Final = 1.0
SIMULATION_DEBOUNCE_SECONDS: Final = 3.0
WATCH_LOGGER: Final = logging.getLogger("aqven.server.watch")

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


type SpecEvent = Annotated[
    FilesChanged
    | DiagnosticsChanged
    | SpecResync
    | SeriesStartedEvent
    | SeriesProgressEvent
    | SeriesStatusChanged
    | FindingWritten
    | ExperimentChanged,
    Field(discriminator="type"),
]


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


def flow_health(state: WorkspaceState, simulated: Sequence[Diagnostic] = ()) -> Mapping[str, FlowHealth]:
    project = state.report.project
    if project is None:
        return {}
    return {flow_id: health_of(state, flow, simulated) for flow_id, flow in project.flows.items()}


def health_of(state: WorkspaceState, flow: LoadedFlow, simulated: Sequence[Diagnostic] = ()) -> FlowHealth:
    static = diagnostics_within(state, flow.folder)
    problems = (*static, *(item for item in simulated if within(item.file, flow.folder)))
    return FlowHealth(compile_status(state, flow, static), problem_counts(problems))


def change_summary(changes: tuple[FileChange, ...]) -> str:
    counts = {kind: sum(1 for change in changes if change.change == kind) for kind in ("added", "modified", "deleted")}
    return ", ".join(f"{kind}: {count}" for kind, count in counts.items() if count)


@dataclass(slots=True)
class SimulationFeed:
    run: SimulationRun
    delay_seconds: float = SIMULATION_DEBOUNCE_SECONDS
    task: asyncio.Task[None] | None = None

    def schedule(self, hub: SpecEventHub, tree_hash: str) -> None:
        previous = self.task
        self.cancel()
        self.task = asyncio.create_task(self._publish(hub, tree_hash, previous))

    def cancel(self) -> bool:
        task = self.task
        if task is None or task.done():
            return False
        task.cancel()
        return True

    async def _publish(self, hub: SpecEventHub, tree_hash: str, previous: asyncio.Task[None] | None) -> None:
        await asyncio.sleep(self.delay_seconds)
        if previous is not None:
            await asyncio.wait((previous,))
        try:
            diagnostics = await self.run()
        except Exception:
            return
        await hub.apply_simulation(tree_hash, diagnostics)


@dataclass(slots=True)
class SpecEventHub:
    workspace: ProjectWorkspace
    window: int = DEFAULT_WINDOW
    clock: Callable[[], datetime] = utc_now
    simulation: SimulationFeed | None = None
    seq: int = 0
    events: deque[SpecEvent] = field(default_factory=deque[SpecEvent])
    snapshot: TreeSnapshot = EMPTY_SNAPSHOT
    health: Mapping[str, FlowHealth] = field(default_factory=dict[str, FlowHealth])
    simulated: tuple[Diagnostic, ...] = ()
    closed: bool = False
    primed: bool = False
    _changed: asyncio.Condition | None = None

    async def prime(self) -> None:
        state = await self.workspace.state()
        self.snapshot = state.snapshot
        self.health = flow_health(state)
        self.primed = True
        self._simulate(state.snapshot.tree_hash)

    async def refresh(self) -> tuple[SpecEvent, ...]:
        if not self.primed:
            await self.prime()
            return ()
        held = self._hold_simulation()
        state = await self.workspace.state()
        changes = file_changes(self.snapshot, state.snapshot)
        if held and not changes:
            self._simulate(state.snapshot.tree_hash)
        if not changes:
            return ()
        self.simulated = ()
        health = flow_health(state)
        builders = tuple(self._builders(state, changes, health))
        self.snapshot = state.snapshot
        self.health = health
        published = await self._publish(builders)
        self._simulate(state.snapshot.tree_hash)
        return published

    async def apply_simulation(self, tree_hash: str, diagnostics: Sequence[Diagnostic]) -> tuple[SpecEvent, ...]:
        if tree_hash != self.snapshot.tree_hash:
            return ()
        self.simulated = tuple(diagnostics)
        state = await self.workspace.state()
        health = flow_health(state, self.simulated)
        changed = tuple(flow_id for flow_id, current in sorted(health.items()) if self.health.get(flow_id) != current)
        self.health = health
        builders = tuple(_diagnostics_builder(self.clock, tree_hash, flow_id, health[flow_id]) for flow_id in changed)
        return await self._publish(builders)

    async def announce(self, notice: ResearchNotice) -> tuple[SpecEvent, ...]:
        return await self._publish((_notice_builder(self.clock, self.snapshot.tree_hash, notice),))

    async def close(self) -> None:
        self.closed = True
        if self.simulation is not None:
            self.simulation.cancel()
        await self._notify()

    def _hold_simulation(self) -> bool:
        return self.simulation is not None and self.simulation.cancel()

    def _simulate(self, tree_hash: str) -> None:
        if self.simulation is None or self.closed:
            return
        self.simulation.schedule(self, tree_hash)

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
        for touch in experiment_touches(self.snapshot, state.snapshot, [change.path for change in changes]):
            yield _experiment_builder(self.clock, tree, touch)
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


def _experiment_builder(clock: Callable[[], datetime], tree: str, touch: ExperimentTouch) -> Callable[[int], SpecEvent]:
    return lambda seq: touch.event(EventStamp(seq, clock(), tree))


def _notice_builder(clock: Callable[[], datetime], tree: str, notice: ResearchNotice) -> Callable[[int], SpecEvent]:
    return lambda seq: research_event(notice, EventStamp(seq, clock(), tree))


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


async def refresh_guarded(hub: SpecEventHub) -> None:
    try:
        await hub.refresh()
    except Exception:
        WATCH_LOGGER.exception("project watcher could not refresh the workspace; it keeps watching")


async def watch_project(
    hub: SpecEventHub, root: Path, stop: asyncio.Event, debounce_ms: int = DEFAULT_DEBOUNCE_MS, simulate: bool = True
) -> None:
    if simulate and hub.simulation is None:
        hub.simulation = SimulationFeed(SubprocessSimulation(root))
    await refresh_guarded(hub)
    async for _ in AWATCH(root, watch_filter=ProjectChangeFilter(root), debounce=debounce_ms, stop_event=stop):
        await refresh_guarded(hub)


async def supervise_watcher(
    hub: SpecEventHub,
    root: Path,
    stop: asyncio.Event,
    debounce_ms: int = DEFAULT_DEBOUNCE_MS,
    restart_seconds: float = WATCHER_RESTART_SECONDS,
) -> None:
    while not stop.is_set():
        try:
            await watch_project(hub, root, stop, debounce_ms)
        except Exception:
            WATCH_LOGGER.exception("project watcher stopped; restarting in %.1fs", restart_seconds)
        await _pause(stop, restart_seconds)


async def _pause(stop: asyncio.Event, seconds: float) -> None:
    with suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), seconds)
