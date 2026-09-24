import asyncio
import logging
import os
import signal
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest

from aqven.app.hang_watch import HANG_LOGGER, LoopHangWatch, LoopWatchdog, StackFile, stacks_path
from aqven.app.locations import ProjectState
from aqven.app.runtime import startup_message

STALL_SECONDS: Final = 5.0
HEARTBEAT_SECONDS: Final = 0.5
FAST_HEARTBEAT_SECONDS: Final = 0.02
FAST_STALL_SECONDS: Final = 0.2
BLOCK_SECONDS: Final = 0.6
SETTLE_SECONDS: Final = 0.15
STACK_MARK: Final = "(most recent call first)"


@dataclass(slots=True)
class FakeClock:
    now: float = 0.0

    def __call__(self) -> float:
        return self.now


@dataclass(slots=True)
class HeldLoop:
    pending: list[Callable[[], None]] = field(default_factory=list[Callable[[], None]])

    def post(self, callback: Callable[[], None]) -> None:
        self.pending.append(callback)

    def run_pending(self) -> None:
        callbacks = self.pending
        self.pending = []
        for callback in callbacks:
            callback()


@dataclass(slots=True)
class RecordedStalls:
    stalls: list[float] = field(default_factory=list[float])
    recoveries: list[float] = field(default_factory=list[float])

    def stalled(self, lag: float) -> None:
        self.stalls.append(lag)

    def recovered(self, lag: float) -> None:
        self.recoveries.append(lag)


@dataclass(slots=True)
class WatchedLoop:
    clock: FakeClock
    loop: HeldLoop
    report: RecordedStalls
    watchdog: LoopWatchdog

    def tick_at(self, now: float) -> None:
        self.clock.now = now
        self.watchdog.tick()

    def answer_at(self, now: float) -> None:
        self.clock.now = now
        self.loop.run_pending()


def watched_loop() -> WatchedLoop:
    clock = FakeClock()
    loop = HeldLoop()
    report = RecordedStalls()
    watchdog = LoopWatchdog(loop.post, report, clock=clock, stall_seconds=STALL_SECONDS)
    return WatchedLoop(clock, loop, report, watchdog)


def test_a_loop_that_answers_every_heartbeat_is_never_reported() -> None:
    watched = watched_loop()

    for step in range(40):
        watched.tick_at(step * HEARTBEAT_SECONDS)
        watched.answer_at(step * HEARTBEAT_SECONDS + 0.1)

    assert (watched.report.stalls, watched.report.recoveries) == ([], [])


def test_a_stalled_loop_is_reported_once_per_incident_with_its_lag() -> None:
    watched = watched_loop()

    watched.tick_at(0.0)
    watched.tick_at(4.5)
    watched.tick_at(5.0)
    stalls_at_threshold = list(watched.report.stalls)
    watched.tick_at(5.5)
    watched.tick_at(6.0)
    watched.tick_at(9.0)
    pending_while_stalled = len(watched.loop.pending)
    watched.answer_at(12.25)
    watched.tick_at(12.5)
    recoveries = list(watched.report.recoveries)
    watched.tick_at(13.0)
    watched.tick_at(18.0)

    assert stalls_at_threshold == []
    assert pending_while_stalled == 1
    assert recoveries == [12.25]
    assert watched.report.stalls == [5.5, 5.5]


def test_a_stack_dump_appends_a_timestamped_header_and_the_stacks_of_all_threads(tmp_path: Path) -> None:
    target = tmp_path / "stacks.txt"

    with target.open("a", encoding="utf-8") as handle:
        StackFile(handle).dump("event loop has not answered for 5.5s")
    text = target.read_text(encoding="utf-8")

    assert text.startswith("=== ")
    assert "event loop has not answered for 5.5s" in text
    assert STACK_MARK in text
    assert "test_a_stack_dump_appends_a_timestamped_header" in text


def test_the_startup_message_names_the_stacks_file(tmp_path: Path) -> None:
    notes = LoopHangWatch().notes(4242)

    message = startup_message("studio", "http://127.0.0.1:5180/", "http://127.0.0.1:5180/mcp/", tmp_path, 5, notes)

    assert ".aqven/logs/stacks-4242.txt" in message
    assert "stall over 5s" in message


@pytest.mark.asyncio
async def test_a_blocked_event_loop_appends_its_stacks_and_logs_one_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    state = ProjectState(tmp_path)
    watch = LoopHangWatch(heartbeat_seconds=FAST_HEARTBEAT_SECONDS, stall_seconds=FAST_STALL_SECONDS)

    with caplog.at_level(logging.WARNING, logger=HANG_LOGGER.name), watch.watching(state):
        await asyncio.sleep(SETTLE_SECONDS)
        time.sleep(BLOCK_SECONDS)
        await asyncio.sleep(SETTLE_SECONDS)
    text = stacks_path(state, os.getpid()).read_text(encoding="utf-8")
    warnings = [record for record in caplog.records if record.name == HANG_LOGGER.name]

    assert len(warnings) == 1
    assert "has not answered for" in warnings[0].getMessage()
    assert text.count("has not answered for") == 1
    assert "answered after" in text
    assert "test_a_blocked_event_loop_appends_its_stacks" in text


@pytest.mark.skipif(sys.platform == "win32", reason="Windows has no SIGUSR1")
@pytest.mark.asyncio
async def test_sigusr1_appends_the_stacks_of_all_threads_to_the_same_file(tmp_path: Path) -> None:
    state = ProjectState(tmp_path)

    with LoopHangWatch().watching(state):
        os.kill(os.getpid(), signal.SIGUSR1)
        await asyncio.sleep(SETTLE_SECONDS)
    text = stacks_path(state, os.getpid()).read_text(encoding="utf-8")

    assert f"kill -USR1 {os.getpid()}" in text
    assert STACK_MARK in text
