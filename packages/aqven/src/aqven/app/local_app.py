import os
import sys
from collections.abc import AsyncGenerator, AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Final, Protocol

from fastapi import FastAPI
from mcp.server import MCPServer
from starlette.types import ASGIApp, Receive, Scope, Send

from aqven.app.access import AccessGuard, local_access_policy, new_access_token
from aqven.app.access import AccessPolicy as LocalAccessPolicy
from aqven.app.composition import ApplicationParts, StudioFeatures, assemble_app, project_workspace
from aqven.app.engine_host import DbosEngineHost, EngineHost, EngineLaunch
from aqven.app.environment import RuntimeSettings, runtime_settings
from aqven.app.locations import ProjectState, StudioState, studio_data_dir
from aqven.app.runtime import ApplicationLaunch
from aqven.app.runtime_file import ServerRecord, server_record
from aqven.app.settings_store import open_settings_store
from aqven.ports.engine import EngineError, EngineFacade, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.presentation import PresentationRequest, PresentationResponse
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkRequest,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
)
from aqven.runtime.vocabulary import IncludePayloads
from aqven.server.app import LifespanFactory
from aqven.server.mcp import McpPorts, ProjectPaths, WriterPatchFlow, build_catalog, build_mcp_server
from aqven.write import WriteService

ENGINE_NOT_STARTED: Final = "the aqven engine is not started: run the application lifespan before calling the API"
LOCAL_APP_DEFAULTS: Final = RuntimeSettings(open_browser=False)

__all__ = [
    "AppAccess",
    "DeferredEngine",
    "LocalAppOptions",
    "LocalTokenAccess",
    "create_local_app",
    "create_mcp_server",
    "local_app_lifespan",
]


@dataclass(slots=True)
class DeferredEngine:
    facade: EngineFacade | None = None

    def bind(self, facade: EngineFacade) -> None:
        self.facade = facade

    def release(self) -> None:
        self.facade = None

    @property
    def current(self) -> EngineFacade:
        facade = self.facade
        if facade is None:
            raise EngineError("INTERNAL", ENGINE_NOT_STARTED)
        return facade

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        return await self.current.start_run(request, dataset_item_id=dataset_item_id)

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return await self.current.get_run(run_id)

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        return await self.current.list_runs(query)

    def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        return self.current.run_events(run_id, after_seq)

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        return await self.current.event_log(run_id, query)

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        return await self.current.list_executions(run_id, query)

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        return await self.current.get_execution(run_id, address, include_payloads)

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        return await self.current.present_run(run_id, request)

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        return await self.current.resume(run_id, request)

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        return await self.current.fork(run_id, request)

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        return await self.current.cancel(run_id, request)

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        return await self.current.waits(run_id)

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        return await self.current.wait_detail(run_id, address)


class AppAccess(Protocol):
    @property
    def token(self) -> str | None: ...

    def guard(self, app: ASGIApp) -> ASGIApp: ...


@dataclass(frozen=True, slots=True)
class LocalTokenAccess:
    token: str = field(default_factory=new_access_token)
    port: int = 0
    dev_origins: tuple[str, ...] = ()

    def policy(self) -> LocalAccessPolicy:
        return local_access_policy(self.port, token=self.token, dev_origins=self.dev_origins)

    def guard(self, app: ASGIApp) -> ASGIApp:
        return AccessGuard(app, self.policy())


class AccessMiddleware:
    def __init__(self, app: ASGIApp, access: AppAccess) -> None:
        self.inner = access.guard(app)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.inner(scope, receive, send)


@dataclass(frozen=True, slots=True)
class LocalAppOptions:
    studio: bool | None = None
    host: str | None = None
    port: int | None = None
    api: bool = True
    mcp: bool = True
    chat: bool = True
    watch: bool = True
    access: AppAccess | None = field(default_factory=LocalTokenAccess)
    data_dir: Path | None = None
    studio_dist: Path | None = None
    dev_origin: str | None = None
    engine: EngineHost | None = None


@dataclass(frozen=True, slots=True)
class LocalAppPlan:
    root: Path
    settings: RuntimeSettings
    features: StudioFeatures
    record: ServerRecord

    @property
    def studio(self) -> bool:
        return self.settings.studio


def access_token(access: AppAccess | None) -> str:
    chosen = None if access is None else access.token
    return new_access_token() if chosen is None else chosen


def app_plan(root: Path, options: LocalAppOptions, environ: Mapping[str, str] | None) -> LocalAppPlan:
    from_environment = runtime_settings(environ, LOCAL_APP_DEFAULTS)
    settings = replace(
        from_environment,
        studio=from_environment.studio if options.studio is None else options.studio,
        host=from_environment.host if options.host is None else options.host,
        port=from_environment.port if options.port is None else options.port,
    )
    features = StudioFeatures(
        mcp=options.mcp,
        chat=options.chat and settings.studio,
        watch=options.watch,
        api=options.api,
        bearer=options.access is not None,
    )
    record = server_record(
        host=settings.host,
        port=settings.port,
        token=access_token(options.access),
        pid=os.getpid(),
        root=root,
    )
    return LocalAppPlan(root=root, settings=settings, features=features, record=record)


def engine_lifespan(host: EngineHost, engine: DeferredEngine, launch: EngineLaunch) -> LifespanFactory:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        engine.bind(await host.start(launch))
        try:
            yield
        finally:
            engine.release()
            await host.stop()

    return lifespan


def create_local_app(
    root: Path,
    options: LocalAppOptions | None = None,
    environ: Mapping[str, str] | None = None,
) -> FastAPI:
    chosen = options or LocalAppOptions()
    project = ProjectState(root.resolve())
    project.ensure()
    studio = StudioState(studio_data_dir(chosen.data_dir))
    studio.ensure()
    plan = app_plan(project.root, chosen, environ)
    store = open_settings_store(project, studio)
    engine = DeferredEngine()
    host = chosen.engine or DbosEngineHost()
    launch = ApplicationLaunch(
        project_root=project.root,
        data_dir=studio.directory,
        engine=engine,
        settings=store,
        record=plan.record,
        access=local_access_policy(plan.record.port, token=plan.record.token),
        headless=not plan.studio,
        studio_dist=chosen.studio_dist,
        dev_origin=chosen.dev_origin,
    )
    extra = ApplicationParts(
        lifespans=(engine_lifespan(host, engine, EngineLaunch(project.root, studio.directory, store)),)
    )
    app = assemble_app(launch, plan.features, extra)
    if chosen.access is not None:
        app.add_middleware(AccessMiddleware, access=chosen.access)
    return app


@asynccontextmanager
async def local_app_lifespan(app: FastAPI) -> AsyncGenerator[None]:
    async with app.router.lifespan_context(app):
        yield


def create_mcp_server(
    root: Path,
    *,
    engine: EngineFacade | None = None,
    write: bool = True,
    python: str = sys.executable,
) -> MCPServer:
    module = root.resolve()
    ports = McpPorts(
        paths=ProjectPaths.of(project_workspace(module), module),
        python=python,
        engine=engine,
        patch_flow=WriterPatchFlow(WriteService(module)) if write else None,
    )
    return build_mcp_server(build_catalog(ports))
