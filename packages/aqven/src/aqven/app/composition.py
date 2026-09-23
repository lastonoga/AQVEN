import asyncio
from collections.abc import AsyncGenerator, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import Final

from fastapi import APIRouter, FastAPI
from pydantic import SecretStr
from starlette.types import ASGIApp

from aqven.app.engine_host import DbosEngineHost
from aqven.app.runtime import ApplicationLaunch, LocalServer
from aqven.check import CheckReport
from aqven.compiler import compile_project
from aqven.engine.facade import PlanSource
from aqven.ir import CompiledProject
from aqven.server import ServerExtensions, ServerOptions, create_app
from aqven.server.app import LifespanFactory
from aqven.server.app import process_environment as launch_environ
from aqven.server.chat import ChatSessionDefaults, studio_chat_parts
from aqven.server.mcp import (
    McpPorts,
    ProjectPaths,
    ToolRegistration,
    WriterPatchFlow,
    build_catalog,
    build_mcp_endpoint,
)
from aqven.server.security import AccessPolicy
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace
from aqven.write import WriteService

WORKSPACE_MARKER: Final = "pyproject.toml"


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


def project_workspace(root: Path) -> Path:
    resolved = root.resolve()
    return next((folder for folder in resolved.parents if (folder / WORKSPACE_MARKER).is_file()), resolved)


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

    def plus(self, other: ApplicationParts) -> ApplicationParts:
        return ApplicationParts(
            mounts={**self.mounts, **other.mounts},
            lifespans=(*self.lifespans, *other.lifespans),
            routers=(*self.routers, *other.routers),
        )


type PartsBuilder = Callable[[ApplicationLaunch], ApplicationParts]


def mcp_catalog(
    launch: ApplicationLaunch,
    writer: WriteService,
    workspace: ProjectWorkspace | None = None,
) -> tuple[ToolRegistration, ...]:
    root = launch.project_root
    ports = McpPorts(
        paths=ProjectPaths.of(project_workspace(root), root),
        engine=launch.engine,
        patch_flow=WriterPatchFlow(writer),
        starting=None
        if workspace is None
        else RunStartService(
            facade=launch.engine,
            settings=launch.settings,
            workspace=workspace,
            environ=launch_environ(),
        ),
    )
    return build_catalog(ports)


def write_recovery(writer: WriteService) -> LifespanFactory:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        await asyncio.to_thread(writer.recover)
        yield

    return lifespan


def mcp_parts(
    launch: ApplicationLaunch,
    bearer: bool = True,
    workspace: ProjectWorkspace | None = None,
) -> ApplicationParts:
    writer = WriteService(launch.project_root)
    policy = AccessPolicy(token=launch.access.token) if bearer and launch.access.require_token else None
    endpoint = build_mcp_endpoint(mcp_catalog(launch, writer, workspace), policy)
    return ApplicationParts(mounts=endpoint.mounts(), lifespans=(write_recovery(writer), endpoint.lifespan))


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
    return ApplicationParts(lifespans=(chat.lifespan,), routers=(chat.router,))


def feature_builders(features: StudioFeatures, workspace: ProjectWorkspace) -> tuple[PartsBuilder, ...]:
    table: tuple[tuple[bool, PartsBuilder], ...] = (
        (features.mcp, partial(mcp_parts, bearer=features.bearer, workspace=workspace)),
        (features.chat, chat_parts),
    )
    return tuple(builder for enabled, builder in table if enabled)


def assemble_app(launch: ApplicationLaunch, features: StudioFeatures, extra: ApplicationParts) -> FastAPI:
    options = studio_server_options(launch, features)
    workspace = ProjectWorkspace(launch.project_root, compiler=options.compiler)
    parts = extra
    for builder in feature_builders(features, workspace):
        parts = parts.plus(builder(launch))
    return create_app(
        launch.project_root,
        launch.engine,
        launch.settings,
        parts.routers,
        options=options,
        extensions=ServerExtensions(mounts=parts.mounts, lifespans=parts.lifespans),
        workspace=workspace,
    )


@dataclass(frozen=True, slots=True)
class ServerApplicationFactory:
    features: StudioFeatures = field(default_factory=StudioFeatures)
    extra: ApplicationParts = field(default_factory=ApplicationParts)

    def build(self, launch: ApplicationLaunch) -> ASGIApp:
        return assemble_app(launch, self.features, self.extra)


def studio_server(
    *,
    features: StudioFeatures | None = None,
    plan_source: PlanSource | None = None,
) -> LocalServer:
    return LocalServer(
        application=ServerApplicationFactory(features or StudioFeatures()),
        engine=DbosEngineHost(plan_source=plan_source),
    )
