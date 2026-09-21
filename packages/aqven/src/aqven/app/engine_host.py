import asyncio
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Protocol

from aqven.engine.assembly import standard_engine_setup
from aqven.engine.facade import DbosEngineFacade, PlanSource
from aqven.engine.lifecycle import EngineLifecycle, EngineSetup
from aqven.ports.engine import EngineFacade
from aqven.ports.settings import SettingsStore
from aqven.runtime.project import ProjectPlanSource


@dataclass(frozen=True, slots=True)
class EngineLaunch:
    project_root: Path
    data_dir: Path
    settings: SettingsStore


class EngineHost(Protocol):
    async def start(self, launch: EngineLaunch) -> EngineFacade: ...

    async def stop(self) -> None: ...


@dataclass(slots=True)
class DbosEngineHost:
    setup: EngineSetup = field(default_factory=standard_engine_setup)
    plan_source: PlanSource | None = None
    lifecycle: EngineLifecycle | None = None

    async def start(self, launch: EngineLaunch) -> EngineFacade:
        lifecycle = EngineLifecycle(root=launch.project_root, setup=replace(self.setup, settings=launch.settings))
        runtime = await asyncio.to_thread(lifecycle.launch)
        self.lifecycle = lifecycle
        plan_source = self.plan_source if self.plan_source is not None else ProjectPlanSource(launch.project_root)
        return DbosEngineFacade(runtime=runtime, plan_source=plan_source)

    async def stop(self) -> None:
        lifecycle = self.lifecycle
        if lifecycle is None:
            return
        self.lifecycle = None
        await asyncio.to_thread(lifecycle.shutdown)
