import asyncio
import logging
import time
from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from typing import Final, Protocol

from fastapi import FastAPI

from aqven.series.feed import ResearchNotice, SeriesProgressNotice, notice_series
from aqven.series.model import SeriesId
from aqven.server.app import LifespanFactory, server_context

PROGRESS_INTERVAL_SECONDS: Final = 1.0
RELAY_LOGGER: Final = logging.getLogger("aqven.server.research")


class ResearchSink(Protocol):
    async def announce(self, notice: ResearchNotice) -> object: ...


def retrieved(task: asyncio.Task[object]) -> None:
    if task.cancelled():
        return
    error = task.exception()
    if error is not None:
        RELAY_LOGGER.warning("a research notice was not announced: %s", error)


@dataclass(slots=True)
class TaskKeeper:
    running: set[asyncio.Task[object]] = field(default_factory=set[asyncio.Task[object]])

    def start(self, work: ResearchSink, notice: ResearchNotice) -> None:
        task = asyncio.create_task(work.announce(notice))
        self.running.add(task)
        task.add_done_callback(self._settled)

    def _settled(self, task: asyncio.Task[object]) -> None:
        self.running.discard(task)
        retrieved(task)


@dataclass(slots=True)
class ProgressThrottle:
    inner: ResearchSink
    interval: float = PROGRESS_INTERVAL_SECONDS
    clock: Callable[[], float] = time.monotonic
    sent: dict[SeriesId, float] = field(default_factory=dict[SeriesId, float])
    held: dict[SeriesId, SeriesProgressNotice] = field(default_factory=dict[SeriesId, SeriesProgressNotice])
    timers: dict[SeriesId, asyncio.TimerHandle] = field(default_factory=dict[SeriesId, asyncio.TimerHandle])
    tasks: TaskKeeper = field(default_factory=TaskKeeper)

    async def announce(self, notice: ResearchNotice) -> object:
        if isinstance(notice, SeriesProgressNotice):
            return await self._progress(notice)
        self._drop(notice_series(notice))
        return await self.inner.announce(notice)

    async def _progress(self, notice: SeriesProgressNotice) -> object:
        series_id = notice.series.series_id
        wait = self._wait(series_id)
        if notice.complete or wait <= 0:
            self._drop(series_id)
            self.sent[series_id] = self.clock()
            return await self.inner.announce(notice)
        self.held[series_id] = notice
        if series_id not in self.timers:
            self.timers[series_id] = asyncio.get_running_loop().call_later(wait, self._flush, series_id)
        return None

    def _wait(self, series_id: SeriesId) -> float:
        last = self.sent.get(series_id)
        return 0.0 if last is None else self.interval - (self.clock() - last)

    def _flush(self, series_id: SeriesId) -> None:
        self.timers.pop(series_id, None)
        notice = self.held.pop(series_id, None)
        if notice is None:
            return
        self.sent[series_id] = self.clock()
        self.tasks.start(self.inner, notice)

    def _drop(self, series_id: SeriesId) -> None:
        self.held.pop(series_id, None)
        timer = self.timers.pop(series_id, None)
        if timer is not None:
            timer.cancel()

    def close(self) -> None:
        for series_id in tuple(self.timers):
            self._drop(series_id)


@dataclass(slots=True)
class ResearchRelay:
    target: ResearchSink | None = None
    loop: asyncio.AbstractEventLoop | None = None
    tasks: TaskKeeper = field(default_factory=TaskKeeper)

    def attach(self, target: ResearchSink) -> None:
        self.target = target
        self.loop = asyncio.get_running_loop()

    def detach(self) -> None:
        self.loop = None
        self.target = None

    def publish(self, notice: ResearchNotice) -> None:
        loop = self.loop
        if loop is None or loop.is_closed():
            return
        with suppress(RuntimeError):
            loop.call_soon_threadsafe(self._deliver, notice)

    def _deliver(self, notice: ResearchNotice) -> None:
        target = self.target
        if target is None:
            return
        self.tasks.start(target, notice)


def research_lifespan(relay: ResearchRelay) -> LifespanFactory:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        throttle = ProgressThrottle(server_context(app).hub)
        relay.attach(throttle)
        try:
            yield
        finally:
            relay.detach()
            throttle.close()

    return lifespan
