import asyncio
from collections.abc import AsyncGenerator, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
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
from aqven.server.chat import claude_chat_parts
from aqven.server.mcp import (
    McpPorts,
    ProjectPaths,
    ToolRegistration,
    WriterPatchFlow,
    build_catalog,
    build_mcp_endpoint,
)
from aqven.server.security import AccessPolicy
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


def project_workspace(root: Path) -> Path:
    resolved = root.resolve()
    return next((folder for folder in resolved.parents if (folder / WORKSPACE_MARKER).is_file()), resolved)


def studio_server_options(launch: ApplicationLaunch, *, watch: bool) -> ServerOptions:
    return ServerOptions(
        access_token=launch.access.token,
        port=launch.record.port,
        guard=False,
        studio_dist=launch.studio_dist,
        serve_studio=not launch.headless,
        dev_origin=launch.dev_origin,
        mcp_url=launch.record.mcp_url,
        watch=watch,
        compiler=ReportCompiler(),
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


def mcp_catalog(launch: ApplicationLaunch, writer: WriteService) -> tuple[ToolRegistration, ...]:
    root = launch.project_root
    ports = McpPorts(
        paths=ProjectPaths.of(project_workspace(root), root),
        engine=launch.engine,
        patch_flow=WriterPatchFlow(writer),
    )
    return build_catalog(ports)


def write_recovery(writer: WriteService) -> LifespanFactory:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        await asyncio.to_thread(writer.recover)
        yield

    return lifespan


def mcp_parts(launch: ApplicationLaunch) -> ApplicationParts:
    writer = WriteService(launch.project_root)
    endpoint = build_mcp_endpoint(mcp_catalog(launch, writer), AccessPolicy(token=launch.access.token))
    return ApplicationParts(mounts=endpoint.mounts(), lifespans=(write_recovery(writer), endpoint.lifespan))


def chat_parts(launch: ApplicationLaunch) -> ApplicationParts:
    chat = claude_chat_parts(launch.project_root, launch.record.mcp_url, SecretStr(launch.access.token))
    return ApplicationParts(lifespans=(chat.lifespan,), routers=(chat.router,))


def feature_builders(features: StudioFeatures) -> tuple[PartsBuilder, ...]:
    table: tuple[tuple[bool, PartsBuilder], ...] = ((features.mcp, mcp_parts), (features.chat, chat_parts))
    return tuple(builder for enabled, builder in table if enabled)


@dataclass(frozen=True, slots=True)
class ServerApplicationFactory:
    features: StudioFeatures = field(default_factory=StudioFeatures)

    def build(self, launch: ApplicationLaunch) -> ASGIApp:
        parts = ApplicationParts()
        for builder in feature_builders(self.features):
            parts = parts.plus(builder(launch))
        return create_app(
            launch.project_root,
            launch.engine,
            launch.settings,
            parts.routers,
            options=studio_server_options(launch, watch=self.features.watch),
            extensions=ServerExtensions(mounts=parts.mounts, lifespans=parts.lifespans),
        )


def studio_server(
    *,
    features: StudioFeatures | None = None,
    plan_source: PlanSource | None = None,
) -> LocalServer:
    return LocalServer(
        application=ServerApplicationFactory(features or StudioFeatures()),
        engine=DbosEngineHost(plan_source=plan_source),
    )
