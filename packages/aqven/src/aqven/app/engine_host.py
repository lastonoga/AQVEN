import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Protocol

from aqven.app.workers import configured_workers
from aqven.engine.assembly import standard_engine_setup
from aqven.engine.facade import DbosEngineFacade, PlanSource
from aqven.engine.lifecycle import EngineLifecycle, EngineSetup
from aqven.ports.engine import EngineFacade
from aqven.ports.settings import SettingsStore
from aqven.runtime.project import ProjectPlanSource
from aqven.series.workflow import REGISTERED_SERIES_WORKFLOWS


@dataclass(frozen=True, slots=True)
class EngineLaunch:
    project_root: Path
    data_dir: Path
    settings: SettingsStore


type PlanSources = Callable[[EngineLaunch], PlanSource]


def project_plan_source(launch: EngineLaunch) -> PlanSource:
    return ProjectPlanSource(launch.project_root)


class EngineHost(Protocol):
    async def start(self, launch: EngineLaunch) -> EngineFacade: ...

    async def stop(self) -> None: ...


@dataclass(slots=True)
class DbosEngineHost:
    setup: EngineSetup = field(default_factory=standard_engine_setup)
    plan_sources: PlanSources = project_plan_source
    lifecycle: EngineLifecycle | None = None

    async def start(self, launch: EngineLaunch) -> EngineFacade:
        workers = await configured_workers(launch.settings)
        setup = replace(
            self.setup, settings=launch.settings, max_parallel=workers, workflows=REGISTERED_SERIES_WORKFLOWS
        )
        lifecycle = EngineLifecycle(root=launch.project_root, setup=setup)
        runtime = await asyncio.to_thread(lifecycle.launch)
        self.lifecycle = lifecycle
        await runtime.summaries.warm()
        return DbosEngineFacade(runtime=runtime, plan_source=self.plan_sources(launch))

    async def stop(self) -> None:
        lifecycle = self.lifecycle
        if lifecycle is None:
            return
        self.lifecycle = None
        await asyncio.to_thread(lifecycle.shutdown)
