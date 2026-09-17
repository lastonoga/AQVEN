from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from pydantic import BaseModel

from aqven.engine.assembly import standard_engine_setup
from aqven.engine.errors import EngineBusy
from aqven.engine.facade import DbosEngineFacade, PlanSource
from aqven.engine.lifecycle import EngineLifecycle, EngineSetup
from aqven.engine.request import RunRecord, run_spec_of
from aqven.engine.runtime import RunOverrides
from aqven.ir import CompiledProject
from aqven.runtime.address import JsonObject, RunId
from aqven.runtime.options import RunOptions
from aqven.runtime.runs import RunStarted
from aqven.spec import FlowId


@dataclass(slots=True)
class LocalEngine:
    lifecycle: EngineLifecycle
    plan_source: PlanSource | None = None

    @property
    def root(self) -> Path:
        return self.lifecycle.root

    @property
    def facade(self) -> DbosEngineFacade:
        return DbosEngineFacade(runtime=self.lifecycle.launch(), plan_source=self.plan_source)

    async def start(
        self, plan: CompiledProject, flow_id: FlowId, flow_input: BaseModel | JsonObject, options: RunOptions
    ) -> RunStarted:
        payload = flow_input.model_dump(mode="json", by_alias=True) if isinstance(flow_input, BaseModel) else flow_input
        overrides = RunOverrides(tool_http=options.tool_http, blobs=options.blobs)
        return await self.facade.launch(plan, run_spec_of(flow_id, options), payload, overrides)

    async def result(self, run_id: RunId) -> RunRecord:
        return await self.facade.result(run_id)

    def shutdown(self) -> None:
        self.lifecycle.shutdown()


@dataclass(slots=True)
class LocalEngines:
    setup: EngineSetup = field(default_factory=standard_engine_setup)
    active: LocalEngine | None = None

    def configure(self, setup: EngineSetup) -> None:
        self.setup = setup

    def engine_for(self, root: Path) -> LocalEngine:
        resolved = root.resolve()
        active = self.active
        if active is not None and active.root == resolved:
            return active
        if active is not None:
            raise EngineBusy(active.root, resolved)
        self.active = LocalEngine(EngineLifecycle(root=resolved, setup=self.setup))
        return self.active

    def shutdown(self) -> None:
        if self.active is None:
            return
        self.active.shutdown()
        self.active = None


LOCAL_ENGINES: Final = LocalEngines()


def local_engine(root: Path) -> LocalEngine:
    return LOCAL_ENGINES.engine_for(root)


def configure_local_engines(setup: EngineSetup) -> None:
    LOCAL_ENGINES.configure(setup)


def shutdown_local_engines() -> None:
    LOCAL_ENGINES.shutdown()
