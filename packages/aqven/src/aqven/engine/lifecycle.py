import os
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import Final, Self

from dbos import DBOS

from aqven.engine import interpreter
from aqven.engine.blobs import FileBlobStore
from aqven.engine.config import EnginePaths, dbos_config, dbos_log_level
from aqven.engine.dbos_logs import route_dbos_logs
from aqven.engine.errors import EngineBusy
from aqven.engine.executors.tool import McpCaller, ToolsetMcpCaller
from aqven.engine.extensions import EngineExtensions
from aqven.engine.loading import CodeLoader
from aqven.engine.plans import PlanRegistry, PlanStore
from aqven.engine.prices import GracefulPrices
from aqven.engine.registry import CoreExecutors, build_executors, throttled_executors
from aqven.engine.runtime import RUNTIME_SLOT, EngineRuntime, OverrideBook, ToolServices
from aqven.engine.throttle import WorkerPool
from aqven.ports.prices import NO_PRICES, PriceCache
from aqven.ports.settings import SettingsStore
from aqven.runtime.address import JsonObject

type ExtensionsFactory = Callable[[ToolServices], EngineExtensions]
type HostWorkflow = Callable[..., Awaitable[JsonObject]]

REGISTERED_WORKFLOWS: Final = (interpreter.run_flow, interpreter.run_branch)


def no_extensions(services: ToolServices) -> EngineExtensions:
    return EngineExtensions()


def process_environment() -> Mapping[str, str]:
    return os.environ


@dataclass(frozen=True, slots=True)
class EngineSetup:
    settings: SettingsStore | None = None
    environ: Mapping[str, str] = field(default_factory=process_environment, repr=False)
    extensions: ExtensionsFactory = no_extensions
    mcp: McpCaller = field(default_factory=ToolsetMcpCaller)
    log_level: str | None = None
    state_dir: Path | None = None
    max_parallel: int | None = None
    workflows: tuple[HostWorkflow, ...] = ()
    prices: PriceCache = NO_PRICES


def build_runtime(paths: EnginePaths, setup: EngineSetup) -> EngineRuntime:
    services = ToolServices(
        paths=paths,
        loader=CodeLoader(paths.root),
        blobs=FileBlobStore(paths.blobs),
        overrides=OverrideBook(),
        settings=setup.settings,
        environ=setup.environ,
        prices=GracefulPrices(setup.prices),
    )
    extensions = setup.extensions(services)
    pool = None if setup.max_parallel is None else WorkerPool(setup.max_parallel)
    return EngineRuntime(
        paths=paths,
        plans=PlanRegistry(PlanStore(paths.plans)),
        executors=throttled_executors(build_executors(CoreExecutors(services, setup.mcp), extensions), pool),
        human_layer=extensions.human_layer,
        services=services,
    )


@dataclass(slots=True)
class EngineLifecycle:
    root: Path
    setup: EngineSetup = field(default_factory=EngineSetup)
    state_dir: Path | None = None
    runtime: EngineRuntime | None = None

    @property
    def launched(self) -> bool:
        return self.runtime is not None

    def launch(self) -> EngineRuntime:
        if self.runtime is not None:
            return self.runtime
        state_dir = self.state_dir if self.state_dir is not None else self.setup.state_dir
        paths = EnginePaths(self.root.resolve(), state_dir.resolve() if state_dir is not None else None)
        active = RUNTIME_SLOT.current
        if active is not None:
            raise EngineBusy(active.paths.root, paths.root)
        paths.ensure()
        runtime = build_runtime(paths, self.setup)
        RUNTIME_SLOT.install(runtime)
        try:
            route_dbos_logs()
            DBOS(config=dbos_config(paths, log_level=dbos_log_level(self.setup.log_level)))
            DBOS.launch()
        except BaseException:
            RUNTIME_SLOT.clear()
            DBOS.destroy(workflow_completion_timeout_sec=0)
            raise
        self.runtime = runtime
        return runtime

    def shutdown(self) -> None:
        if self.runtime is None:
            return
        DBOS.destroy(workflow_completion_timeout_sec=0)
        RUNTIME_SLOT.clear()
        self.runtime = None

    def __enter__(self) -> Self:
        self.launch()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.shutdown()
