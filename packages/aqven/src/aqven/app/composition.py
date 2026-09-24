import asyncio
from collections.abc import AsyncGenerator, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from functools import partial
from pathlib import Path

from fastapi import APIRouter, FastAPI
from pydantic import SecretStr
from starlette.types import ASGIApp

from aqven.app.engine_host import DbosEngineHost, EngineHost, EngineLaunch
from aqven.app.observation import ObservationTargets
from aqven.app.prices import LazyPriceLookup, SharedPrices
from aqven.app.runtime import ApplicationLaunch, LocalServer
from aqven.check import CheckReport
from aqven.compiler import compile_project
from aqven.engine.assembly import standard_engine_setup
from aqven.engine.facade import PlanSource
from aqven.ir import CompiledProject
from aqven.loader.roots import project_workspace
from aqven.ports.engine import EngineFacade
from aqven.ports.settings import SettingsStore
from aqven.series.analysis import ScipySeriesAnalyst
from aqven.series.findings import FileFindings
from aqven.series.jobs import SeriesService
from aqven.series.ports import ModelPrices, SeriesJobs
from aqven.series.services import SeriesServices, build_series_services
from aqven.series.slot import SERIES_SLOT
from aqven.series.watch import SeriesRunWatch
from aqven.server import ServerExtensions, ServerOptions, create_app
from aqven.server.app import LifespanFactory
from aqven.server.app import process_environment as launch_environ
from aqven.server.chat import CHAT_FEED, ChatSessionDefaults, studio_chat_parts
from aqven.server.context import engine_version
from aqven.server.event_feeds import EventFeed, EventFeeds
from aqven.server.mcp import (
    McpPorts,
    ProjectPaths,
    ToolRegistration,
    WriterPatchFlow,
    build_catalog,
    build_mcp_endpoint,
)
from aqven.server.research_relay import ResearchRelay, research_lifespan
from aqven.server.security import AccessPolicy
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace
from aqven.write import WriteService


@dataclass(frozen=True, slots=True)
class ReportCompiler:
    def compile(self, report: CheckReport) -> CompiledProject:
        return compile_project(report)


@dataclass(frozen=True, slots=True)
class StudioFeatures:
    mcp: bool = True
    chat: bool = True
    watch: bool = True
    api: bool = True
    bearer: bool = True


def studio_server_options(launch: ApplicationLaunch, features: StudioFeatures) -> ServerOptions:
    return ServerOptions(
        access_token=launch.access.token,
        port=launch.record.port,
        guard=False,
        studio_dist=launch.studio_dist,
        serve_studio=not launch.headless,
        serve_api=features.api,
        dev_origin=launch.dev_origin,
        mcp_url=launch.record.mcp_url,
        watch=features.watch,
        compiler=ReportCompiler(),
        shutdown_signal=launch.shutdown_signal,
    )


@dataclass(frozen=True, slots=True)
class ApplicationParts:
    mounts: Mapping[str, ASGIApp] = field(default_factory=dict[str, ASGIApp])
    lifespans: tuple[LifespanFactory, ...] = ()
    routers: tuple[APIRouter, ...] = ()
    feeds: EventFeeds = field(default_factory=dict[str, EventFeed])

    def plus(self, other: ApplicationParts) -> ApplicationParts:
        return ApplicationParts(
            mounts={**self.mounts, **other.mounts},
            lifespans=(*self.lifespans, *other.lifespans),
            routers=(*self.routers, *other.routers),
            feeds={**self.feeds, **other.feeds},
        )


type PartsBuilder = Callable[[ApplicationLaunch], ApplicationParts]


@dataclass(frozen=True, slots=True)
class ProjectParts:
    workspace: ProjectWorkspace
    writer: WriteService
    series: SeriesServices
    jobs: SeriesJobs
    research: ResearchRelay


def project_parts(root: Path, settings: SettingsStore, prices: ModelPrices) -> ProjectParts:
    workspace = ProjectWorkspace(root, compiler=ReportCompiler())
    writer = WriteService(root)
    research = ResearchRelay()
    findings = FileFindings(writer, root, research)
    analyst = ScipySeriesAnalyst()
    series = build_series_services(root, workspace, settings, analyst, findings, prices, engine_version(), research)
    return ProjectParts(
        workspace=workspace, writer=writer, series=series, jobs=SeriesService(series), research=research
    )


@dataclass(slots=True)
class ProjectAssembly:
    built: dict[Path, ProjectParts] = field(default_factory=dict[Path, ProjectParts])
    prices: SharedPrices = field(default_factory=LazyPriceLookup)

    def parts(self, root: Path, settings: SettingsStore) -> ProjectParts:
        key = root.resolve()
        existing = self.built.get(key)
        if existing is not None:
            return existing
        fresh = project_parts(key, settings, self.prices)
        self.built[key] = fresh
        return fresh


@dataclass(slots=True)
class SeriesEngineHost:
    inner: EngineHost
    assembly: ProjectAssembly

    async def start(self, launch: EngineLaunch) -> EngineFacade:
        SERIES_SLOT.install(self.assembly.parts(launch.project_root, launch.settings).series)
        return await self.inner.start(launch)

    async def stop(self) -> None:
        try:
            await self.inner.stop()
        finally:
            SERIES_SLOT.clear()


def mcp_catalog(launch: ApplicationLaunch, parts: ProjectParts) -> tuple[ToolRegistration, ...]:
    root = launch.project_root
    ports = McpPorts(
        paths=ProjectPaths.of(project_workspace(root), root),
        engine=launch.engine,
        patch_flow=WriterPatchFlow(parts.writer),
        starting=RunStartService(
            facade=launch.engine,
            settings=launch.settings,
            workspace=parts.workspace,
            environ=launch_environ(),
        ),
        series=parts.jobs,
    )
    return build_catalog(ports)


def write_recovery(writer: WriteService) -> LifespanFactory:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        await asyncio.to_thread(writer.recover)
        yield

    return lifespan


def mcp_parts(launch: ApplicationLaunch, parts: ProjectParts, bearer: bool = True) -> ApplicationParts:
    policy = AccessPolicy(token=launch.access.token) if bearer and launch.access.require_token else None
    endpoint = build_mcp_endpoint(mcp_catalog(launch, parts), policy)
    return ApplicationParts(mounts=endpoint.mounts(), lifespans=(endpoint.lifespan,))


def chat_parts(launch: ApplicationLaunch) -> ApplicationParts:
    chat = studio_chat_parts(
        launch.project_root,
        launch.record.mcp_url,
        SecretStr(launch.access.token),
        launch.settings,
        launch.chat_allowed_tools,
        ChatSessionDefaults(
            model=launch.chat_model,
            effort=launch.chat_effort,
            permission_mode=launch.chat_permission_mode,
        ),
        shutdown_signal=launch.shutdown_signal,
    )
    return ApplicationParts(lifespans=(chat.lifespan,), routers=(chat.router,), feeds={CHAT_FEED: chat.feed})


def feature_builders(features: StudioFeatures, project: ProjectParts) -> tuple[PartsBuilder, ...]:
    table: tuple[tuple[bool, PartsBuilder], ...] = (
        (features.mcp, partial(mcp_parts, parts=project, bearer=features.bearer)),
        (features.chat, chat_parts),
    )
    return tuple(builder for enabled, builder in table if enabled)


def studio_address(launch: ApplicationLaunch) -> str | None:
    return None if launch.headless else (launch.dev_origin or launch.record.url)


def assemble_app(
    launch: ApplicationLaunch,
    features: StudioFeatures,
    extra: ApplicationParts,
    assembly: ProjectAssembly | None = None,
) -> FastAPI:
    options = studio_server_options(launch, features)
    built = (assembly or ProjectAssembly()).parts(launch.project_root, launch.settings)
    observed = launch.observer.observe(
        ObservationTargets(
            engine=launch.engine, series=built.jobs, workspace=built.workspace, studio_url=studio_address(launch)
        )
    )
    watched = replace(launch, engine=observed.engine)
    project = replace(built, jobs=observed.series)
    project_lifespans = (write_recovery(project.writer), research_lifespan(project.research), observed.lifespan)
    parts = extra.plus(ApplicationParts(lifespans=project_lifespans))
    for builder in feature_builders(features, project):
        parts = parts.plus(builder(watched))
    return create_app(
        watched.project_root,
        watched.engine,
        watched.settings,
        parts.routers,
        options=options,
        extensions=ServerExtensions(mounts=parts.mounts, lifespans=parts.lifespans, feeds=parts.feeds),
        workspace=project.workspace,
        series=project.jobs,
    )


@dataclass(frozen=True, slots=True)
class ServerApplicationFactory:
    features: StudioFeatures = field(default_factory=StudioFeatures)
    extra: ApplicationParts = field(default_factory=ApplicationParts)
    assembly: ProjectAssembly = field(default_factory=ProjectAssembly)

    def build(self, launch: ApplicationLaunch) -> ASGIApp:
        return assemble_app(launch, self.features, self.extra, self.assembly)


def priced_engine_host(assembly: ProjectAssembly, plan_source: PlanSource | None = None) -> DbosEngineHost:
    setup = replace(standard_engine_setup(prices=assembly.prices), watch=SeriesRunWatch())
    return DbosEngineHost(setup=setup, plan_source=plan_source)


def studio_server(
    *,
    features: StudioFeatures | None = None,
    plan_source: PlanSource | None = None,
) -> LocalServer:
    assembly = ProjectAssembly()
    return LocalServer(
        application=ServerApplicationFactory(features or StudioFeatures(), assembly=assembly),
        engine=SeriesEngineHost(priced_engine_host(assembly, plan_source), assembly),
    )
