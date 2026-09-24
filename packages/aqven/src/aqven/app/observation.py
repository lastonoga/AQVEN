from collections.abc import AsyncGenerator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from typing import Protocol

from fastapi import FastAPI

from aqven.ports.engine import EngineFacade
from aqven.series.ports import SeriesJobs
from aqven.server.workspace import ProjectWorkspace

type ObserverLifespan = Callable[[FastAPI], AbstractAsyncContextManager[None]]


@dataclass(frozen=True, slots=True)
class ObservationTargets:
    engine: EngineFacade
    series: SeriesJobs
    workspace: ProjectWorkspace
    studio_url: str | None


@dataclass(frozen=True, slots=True)
class ObservedLaunch:
    engine: EngineFacade
    series: SeriesJobs
    lifespan: ObserverLifespan


class LaunchObserver(Protocol):
    def observe(self, targets: ObservationTargets) -> ObservedLaunch: ...


@asynccontextmanager
async def no_lifespan(app: FastAPI) -> AsyncGenerator[None]:
    yield


@dataclass(frozen=True, slots=True)
class SilentObserver:
    def observe(self, targets: ObservationTargets) -> ObservedLaunch:
        return ObservedLaunch(engine=targets.engine, series=targets.series, lifespan=no_lifespan)
