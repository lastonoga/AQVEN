import asyncio
import contextlib
import faulthandler
import logging
import os
import signal
import sys
import threading
import time
from collections.abc import Callable, Generator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Final, Protocol, TextIO

from aqven.app.locations import LOGS_FOLDER, PROJECT_STATE_FOLDER, ProjectState

HEARTBEAT_SECONDS: Final = 0.5
STALL_SECONDS: Final = 5.0
STOP_JOIN_SECONDS: Final = 2.0
WATCHDOG_THREAD: Final = "aqven-loop-watchdog"
TIMESTAMP_PRECISION: Final = "milliseconds"
HANG_LOGGER: Final = logging.getLogger("aqven.hang")

type Clock = Callable[[], float]
type WallClock = Callable[[], datetime]
type Callback = Callable[[], None]
type Post = Callable[[Callback], None]


def local_now() -> datetime:
    return datetime.now().astimezone()


def stacks_file_name(pid: int) -> str:
    return f"stacks-{pid}.txt"


def stacks_path(state: ProjectState, pid: int) -> Path:
    return state.folder / LOGS_FOLDER / stacks_file_name(pid)


def stacks_display(pid: int) -> str:
    return f"{PROJECT_STATE_FOLDER}/{LOGS_FOLDER}/{stacks_file_name(pid)}"


def dump_triggers(pid: int, stall_seconds: float) -> str:
    stall = f"an event loop stall over {stall_seconds:g}s"
    if sys.platform == "win32":
        return stall
    return f"kill -USR1 {pid} or {stall}"


class StallReport(Protocol):
    def stalled(self, lag: float) -> None: ...

    def recovered(self, lag: float) -> None: ...


class HangWatch(Protocol):
    def watching(self, state: ProjectState) -> contextlib.AbstractContextManager[None]: ...

    def notes(self, pid: int) -> tuple[str, ...]: ...


@dataclass(slots=True)
class Heartbeat:
    sent_at: float
    clock: Clock
    answered_at: float | None = None

    def answer(self) -> None:
        self.answered_at = self.clock()


@dataclass(slots=True)
class LoopWatchdog:
    post: Post
    report: StallReport
    clock: Clock = time.monotonic
    stall_seconds: float = STALL_SECONDS
    beat: Heartbeat | None = None
    in_stall: bool = False

    def tick(self) -> None:
        beat = self.beat
        if beat is None:
            self._send()
            return
        answered_at = beat.answered_at
        if answered_at is not None:
            self._settle(answered_at - beat.sent_at)
            self._send()
            return
        self._check(self.clock() - beat.sent_at)

    def run(self, stop: threading.Event, interval: float) -> None:
        while not stop.wait(interval):
            self.tick()

    def _send(self) -> None:
        beat = Heartbeat(self.clock(), self.clock)
        self.beat = beat
        self.post(beat.answer)

    def _settle(self, lag: float) -> None:
        if not self.in_stall:
            return
        self.in_stall = False
        self.report.recovered(lag)

    def _check(self, lag: float) -> None:
        if self.in_stall or lag <= self.stall_seconds:
            return
        self.in_stall = True
        self.report.stalled(lag)


@dataclass(frozen=True, slots=True)
class StackFile:
    handle: TextIO
    wall: WallClock = local_now

    def note(self, text: str) -> None:
        self.handle.write(f"=== {self.wall().isoformat(timespec=TIMESTAMP_PRECISION)} {text} ===\n")
        self.handle.flush()

    def dump(self, text: str) -> None:
        self.note(text)
        faulthandler.dump_traceback(self.handle, all_threads=True)
        self.handle.write("\n")
        self.handle.flush()


@dataclass(frozen=True, slots=True)
class StackDumpReport:
    stacks: StackFile
    shown_path: str
    logger: logging.Logger = HANG_LOGGER

    def stalled(self, lag: float) -> None:
        with contextlib.suppress(OSError):
            self.stacks.dump(f"event loop has not answered for {lag:.1f}s; stacks of all threads follow")
        self.logger.warning("event loop has not answered for %.1fs; thread stacks appended to %s", lag, self.shown_path)

    def recovered(self, lag: float) -> None:
        with contextlib.suppress(OSError):
            self.stacks.note(f"event loop answered after {lag:.1f}s")


@dataclass(frozen=True, slots=True)
class ThreadsafePost:
    loop: asyncio.AbstractEventLoop

    def __call__(self, callback: Callback) -> None:
        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(callback)


@contextlib.contextmanager
def opened_stacks(path: Path, header: str) -> Generator[StackFile]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        stacks = StackFile(handle)
        stacks.note(header)
        yield stacks


@contextlib.contextmanager
def signal_dumps(stacks: StackFile) -> Generator[None]:
    if sys.platform == "win32":
        yield
        return
    faulthandler.register(signal.SIGUSR1, file=stacks.handle, all_threads=True, chain=False)
    try:
        yield
    finally:
        faulthandler.unregister(signal.SIGUSR1)


@contextlib.contextmanager
def watchdog_thread(watchdog: LoopWatchdog, interval: float) -> Generator[None]:
    stop = threading.Event()
    thread = threading.Thread(target=watchdog.run, args=(stop, interval), name=WATCHDOG_THREAD, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(STOP_JOIN_SECONDS)


@dataclass(frozen=True, slots=True)
class LoopHangWatch:
    heartbeat_seconds: float = HEARTBEAT_SECONDS
    stall_seconds: float = STALL_SECONDS

    @contextlib.contextmanager
    def watching(self, state: ProjectState) -> Generator[None]:
        pid = os.getpid()
        post = ThreadsafePost(asyncio.get_running_loop())
        header = f"aqven server pid {pid} started; {dump_triggers(pid, self.stall_seconds)} appends all thread stacks"
        with (
            opened_stacks(stacks_path(state, pid), header) as stacks,
            signal_dumps(stacks),
            watchdog_thread(self._watchdog(post, stacks, pid), self.heartbeat_seconds),
        ):
            yield

    def notes(self, pid: int) -> tuple[str, ...]:
        return (f"{dump_triggers(pid, self.stall_seconds)} → {stacks_display(pid)}",)

    def _watchdog(self, post: Post, stacks: StackFile, pid: int) -> LoopWatchdog:
        return LoopWatchdog(post, StackDumpReport(stacks, stacks_display(pid)), stall_seconds=self.stall_seconds)


@dataclass(frozen=True, slots=True)
class NoHangWatch:
    def watching(self, state: ProjectState) -> contextlib.AbstractContextManager[None]:
        return contextlib.nullcontext()

    def notes(self, pid: int) -> tuple[str, ...]:
        return ()
