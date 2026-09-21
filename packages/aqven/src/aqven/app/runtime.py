import asyncio
import contextlib
import os
import signal
import socket
import sys
import threading
import webbrowser
from collections.abc import Awaitable, Callable, Generator
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from types import FrameType
from typing import Final, Protocol

import uvicorn
from starlette.types import ASGIApp

from aqven.app.access import AccessGuard, AccessPolicy, local_access_policy
from aqven.app.engine_host import EngineHost, EngineLaunch
from aqven.app.health import HealthEndpoint, Readiness, ServerIdentity
from aqven.app.instance import (
    HttpServerProbe,
    InstanceBusy,
    InstanceLock,
    ServerProbe,
    await_live_server,
    bind_loopback,
    bound_port,
    live_server,
)
from aqven.app.locations import ProjectState, StudioState, studio_data_dir
from aqven.app.options import ServerOptions
from aqven.app.runtime_file import ServerRecord, remove_server_record, server_record, write_server_record
from aqven.app.settings_store import LocalSettingsStore, open_settings_store
from aqven.ports.chat import ChatEffort, ChatPermissionMode
from aqven.ports.engine import EngineFacade

GRACEFUL_SHUTDOWN_SECONDS: Final = 5
LOG_LEVEL: Final = "warning"
STOP_SIGNALS: Final = (signal.SIGINT, signal.SIGTERM)


TRUSTED_CHAT_WARNING: Final = (
    "aqven: chat approvals default to trust, so the chat agent runs every tool call without asking. "
    "Provider keys in .env are held back by a text check on the command, which arbitrary code can walk past."
)


@dataclass(frozen=True, slots=True)
class ApplicationLaunch:
    project_root: Path
    data_dir: Path
    engine: EngineFacade
    settings: LocalSettingsStore
    record: ServerRecord
    access: AccessPolicy
    headless: bool
    studio_dist: Path | None
    dev_origin: str | None
    chat_allowed_tools: tuple[str, ...] = ()
    chat_model: str | None = None
    chat_effort: ChatEffort | None = None
    chat_permission_mode: ChatPermissionMode = "default"


class ApplicationFactory(Protocol):
    def build(self, launch: ApplicationLaunch) -> ASGIApp: ...


class BrowserLauncher(Protocol):
    def open(self, url: str) -> None: ...


class Announcer(Protocol):
    def announce(self, message: str) -> None: ...


@dataclass(frozen=True, slots=True)
class SystemBrowser:
    def open(self, url: str) -> None:
        webbrowser.open(url, new=2)


@dataclass(frozen=True, slots=True)
class StandardErrorAnnouncer:
    def announce(self, message: str) -> None:
        print(message, file=sys.stderr, flush=True)


@dataclass(frozen=True, slots=True)
class Started:
    record: ServerRecord


@dataclass(frozen=True, slots=True)
class Reused:
    record: ServerRecord


type ServeOutcome = Started | Reused


class ServerStartupFailed(RuntimeError):
    def __init__(self, root: str) -> None:
        super().__init__(f"aqven server for {root} failed to start: app lifespan error")
        self.root = root


class LocalUvicorn(uvicorn.Server):
    def __init__(self, config: uvicorn.Config, on_started: Callable[[], Awaitable[None]]) -> None:
        super().__init__(config)
        self.on_started = on_started

    @contextlib.contextmanager
    def capture_signals(self) -> Generator[None]:
        yield

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets=sockets)
        if self.started:
            await self.on_started()


@dataclass(slots=True)
class StopSwitch:
    requested: bool = False
    server: uvicorn.Server | None = None

    def request(self) -> None:
        repeated = self.requested
        self.requested = True
        server = self.server
        if server is None:
            return
        server.force_exit = server.force_exit or repeated
        server.should_exit = True

    def attach(self, server: uvicorn.Server) -> None:
        self.server = server
        server.should_exit = server.should_exit or self.requested

    def on_signal(self, signal_number: int, frame: FrameType | None) -> None:
        self.request()


@contextlib.contextmanager
def stop_signals(switch: StopSwitch) -> Generator[None]:
    if threading.current_thread() is not threading.main_thread():
        yield
        return
    previous = {number: signal.signal(number, switch.on_signal) for number in STOP_SIGNALS}
    try:
        yield
    finally:
        restorable = {number: handler for number, handler in previous.items() if handler is not None}
        for number, handler in restorable.items():
            signal.signal(number, handler)


@dataclass(slots=True)
class LocalServer:
    application: ApplicationFactory
    engine: EngineHost
    browser: BrowserLauncher = field(default_factory=SystemBrowser)
    announcer: Announcer = field(default_factory=StandardErrorAnnouncer)
    probe: ServerProbe = field(default_factory=HttpServerProbe)
    log_level: str = LOG_LEVEL
    readiness: Readiness = field(default_factory=Readiness)
    switch: StopSwitch = field(default_factory=StopSwitch)

    def request_stop(self) -> None:
        self.switch.request()

    async def serve(self, options: ServerOptions) -> ServeOutcome:
        state = ProjectState(options.root.resolve())
        existing = await live_server(state, self.probe)
        if existing is not None:
            return await self._reuse(existing, options)
        state.ensure()
        lock = InstanceLock(state.server_lock)
        if not lock.acquire():
            return await self._reuse(await self._started_elsewhere(state, options), options)
        with lock:
            return await self._serve_locked(state, options)

    async def _started_elsewhere(self, state: ProjectState, options: ServerOptions) -> ServerRecord:
        record = await await_live_server(
            state,
            self.probe,
            timeout_seconds=options.startup_timeout_seconds,
            poll_seconds=options.poll_seconds,
        )
        if record is None:
            raise InstanceBusy(state.root)
        return record

    async def _reuse(self, record: ServerRecord, options: ServerOptions) -> ServeOutcome:
        self.announcer.announce(f"aqven: project server is already running (pid {record.pid}): {record.url}")
        if options.launches_browser:
            await asyncio.to_thread(self.browser.open, record.browser_url(options.dev_origin))
        return Reused(record)

    async def _serve_locked(self, state: ProjectState, options: ServerOptions) -> ServeOutcome:
        studio = StudioState(studio_data_dir(options.data_dir))
        studio.ensure()
        settings = open_settings_store(state, studio)
        dev_origins = () if options.dev_origin is None else (options.dev_origin,)
        async with AsyncExitStack() as stack:
            listener = stack.enter_context(contextlib.closing(bind_loopback(options.host, options.port)))
            access = local_access_policy(
                bound_port(listener), dev_origins=dev_origins, require_token=options.require_auth
            )
            record = server_record(
                host=options.host,
                port=access.port,
                token=access.token,
                pid=os.getpid(),
                root=state.root,
            )
            stack.enter_context(stop_signals(self.switch))
            engine = await self.engine.start(EngineLaunch(state.root, studio.directory, settings))
            stack.push_async_callback(self.engine.stop)
            if self.switch.requested:
                return Started(record)
            launch = ApplicationLaunch(
                project_root=state.root,
                data_dir=studio.directory,
                engine=engine,
                settings=settings,
                record=record,
                access=access,
                headless=options.headless,
                studio_dist=options.studio_dist,
                dev_origin=options.dev_origin,
                chat_allowed_tools=options.chat_allowed_tools,
                chat_model=options.chat_model,
                chat_effort=options.chat_effort,
                chat_permission_mode=options.chat_permission_mode,
            )
            application = self._guarded(self.application.build(launch), record, access, options)
            write_server_record(state, record)
            stack.callback(remove_server_record, state, record.pid)
            stack.callback(self.readiness.mark_stopping)
            await self._run(application, listener, record, options)
        return Started(record)

    def _guarded(
        self, application: ASGIApp, record: ServerRecord, access: AccessPolicy, options: ServerOptions
    ) -> ASGIApp:
        identity = ServerIdentity(pid=record.pid, project_root=record.project_root, headless=options.headless)
        return AccessGuard(HealthEndpoint(application, self.readiness, identity), access)

    async def _run(
        self,
        application: ASGIApp,
        listener: socket.socket,
        record: ServerRecord,
        options: ServerOptions,
    ) -> None:
        config = uvicorn.Config(
            application,
            host=record.host,
            port=record.port,
            log_level=self.log_level,
            access_log=False,
            lifespan="auto",
            timeout_graceful_shutdown=GRACEFUL_SHUTDOWN_SECONDS,
        )
        server = LocalUvicorn(config, on_started=partial(self._on_started, record, options))
        self.switch.attach(server)
        try:
            await server.serve(sockets=[listener])
        except SystemExit as failure:
            raise ServerStartupFailed(record.project_root) from failure

    async def _on_started(self, record: ServerRecord, options: ServerOptions) -> None:
        self.readiness.mark_ready()
        address = record.url if options.headless else studio_browser_url(record, options)
        self.announcer.announce(f"aqven: {address} (MCP {record.mcp_url})")
        if options.chat_permission_mode == "trust":
            self.announcer.announce(TRUSTED_CHAT_WARNING)
        await self._open_browser(record, options)

    async def _open_browser(self, record: ServerRecord, options: ServerOptions) -> None:
        if not options.launches_browser:
            return
        await asyncio.to_thread(self.browser.open, studio_browser_url(record, options))


def studio_browser_url(record: ServerRecord, options: ServerOptions) -> str:
    if options.require_auth:
        return record.browser_url(options.dev_origin)
    return f"{(options.dev_origin or record.url).rstrip('/')}/"
