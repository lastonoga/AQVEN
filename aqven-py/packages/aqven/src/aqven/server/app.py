import asyncio
import os
from collections.abc import AsyncGenerator, Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager, AsyncExitStack, asynccontextmanager, suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from aqven.app.access import AccessGuard, AccessPolicy, local_access_policy, new_access_token
from aqven.ports.engine import EngineFacade
from aqven.ports.settings import SettingsStore
from aqven.server.blobs import BlobFiles, DirectoryBlobStore
from aqven.server.context import ServerContext, engine_version
from aqven.server.errors import install_error_handlers
from aqven.server.routes.blobs import build_blobs_router
from aqven.server.routes.events import build_events_router
from aqven.server.routes.fallback import build_fallback_router
from aqven.server.routes.flows import build_flows_router
from aqven.server.routes.meta import build_meta_router
from aqven.server.routes.project import build_project_router
from aqven.server.routes.runs import build_runs_router
from aqven.server.routes.settings import build_settings_router
from aqven.server.security import QueryTokenScrubber
from aqven.server.spec_channel import DEFAULT_DEBOUNCE_MS, SpecEventHub, watch_project
from aqven.server.static import StudioBundle, default_studio, mount_studio
from aqven.server.workspace import ProjectCompiler, ProjectWorkspace

API_TITLE: Final = "AQVEN Studio API"
OPENAPI_URL: Final = "/api/openapi.json"
BLOB_FOLDER: Final = Path(".aqven") / "blobs"
WATCHER_STOP_SECONDS: Final = 5.0
CONTEXT_ATTRIBUTE: Final = "aqven"

type LifespanFactory = Callable[[FastAPI], AbstractAsyncContextManager[None]]


def process_environment() -> Mapping[str, str]:
    return os.environ


@dataclass(frozen=True, slots=True)
class ServerOptions:
    access_token: str = field(default_factory=new_access_token)
    port: int | None = None
    guard: bool = True
    studio_dist: Path | None = None
    serve_studio: bool = True
    dev_origin: str | None = None
    blob_directory: Path | None = None
    watch: bool = True
    watch_debounce_ms: int = DEFAULT_DEBOUNCE_MS
    mcp_url: str | None = None
    compiler: ProjectCompiler | None = None
    environ: Mapping[str, str] = field(default_factory=process_environment)


@dataclass(frozen=True, slots=True)
class ServerExtensions:
    mounts: Mapping[str, ASGIApp] = field(default_factory=dict[str, ASGIApp])
    lifespans: tuple[LifespanFactory, ...] = ()


def access_policy(options: ServerOptions) -> AccessPolicy:
    dev_origins = () if options.dev_origin is None else (options.dev_origin,)
    return local_access_policy(options.port or 0, token=options.access_token, dev_origins=dev_origins)


def studio_bundle(options: ServerOptions) -> StudioBundle:
    return StudioBundle(options.studio_dist or default_studio())


def server_context(app: FastAPI) -> ServerContext:
    context = getattr(app.state, CONTEXT_ATTRIBUTE, None)
    if not isinstance(context, ServerContext):
        raise LookupError("app was not built by create_app: no server context")
    return context


@asynccontextmanager
async def spec_watcher(hub: SpecEventHub, root: Path, options: ServerOptions) -> AsyncGenerator[None]:
    await hub.prime()
    if not options.watch:
        yield
        await hub.close()
        return
    stop = asyncio.Event()
    task = asyncio.create_task(watch_project(hub, root, stop, options.watch_debounce_ms))
    try:
        yield
    finally:
        stop.set()
        await hub.close()
        with suppress(asyncio.CancelledError, TimeoutError):
            await asyncio.wait_for(task, WATCHER_STOP_SECONDS)


def build_lifespan(
    context: ServerContext,
    root: Path,
    options: ServerOptions,
    extensions: ServerExtensions,
) -> LifespanFactory:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        async with AsyncExitStack() as stack:
            for factory in extensions.lifespans:
                await stack.enter_async_context(factory(app))
            await stack.enter_async_context(spec_watcher(context.hub, root, options))
            yield

    return lifespan


def core_routers(context: ServerContext) -> tuple[APIRouter, ...]:
    return (
        build_meta_router(context),
        build_project_router(context),
        build_flows_router(context),
        build_runs_router(context),
        build_events_router(context),
        build_blobs_router(context),
        build_settings_router(context),
    )


def create_app(
    root: Path,
    facade: EngineFacade,
    settings: SettingsStore,
    extra_routers: Sequence[APIRouter] = (),
    *,
    options: ServerOptions | None = None,
    extensions: ServerExtensions | None = None,
    blobs: BlobFiles | None = None,
) -> FastAPI:
    chosen = options or ServerOptions()
    extended = extensions or ServerExtensions()
    workspace = ProjectWorkspace(root, compiler=chosen.compiler)
    context = ServerContext(
        facade=facade,
        settings=settings,
        workspace=workspace,
        hub=SpecEventHub(workspace),
        blobs=blobs or DirectoryBlobStore(chosen.blob_directory or root / BLOB_FOLDER),
        environ=chosen.environ,
        engine_version=engine_version(),
        mcp_url=chosen.mcp_url,
    )
    app = FastAPI(
        title=API_TITLE,
        version=context.engine_version,
        openapi_url=OPENAPI_URL,
        docs_url=None,
        redoc_url=None,
        lifespan=build_lifespan(context, root, chosen, extended),
    )
    setattr(app.state, CONTEXT_ATTRIBUTE, context)
    install_error_handlers(app)
    for router in (*core_routers(context), *extra_routers):
        app.include_router(router)
    app.include_router(build_fallback_router())
    for path, mounted in extended.mounts.items():
        app.mount(path, mounted)
    if chosen.serve_studio:
        mount_studio(app, studio_bundle(chosen))
    app.add_middleware(QueryTokenScrubber)
    if chosen.guard:
        app.add_middleware(AccessGuard, policy=access_policy(chosen))
    if chosen.dev_origin:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[chosen.dev_origin],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    return app
