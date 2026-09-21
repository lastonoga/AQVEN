import sys
from collections.abc import Iterable, Mapping
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from typing import Final

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

from aqven.ports.engine import EngineFacade
from aqven.server.mcp.catalog import ToolRegistration
from aqven.server.mcp.check_tools import AqvenCheckTool, RunnerSettings
from aqven.server.mcp.patch_tools import PatchFlow, PatchTools
from aqven.server.mcp.paths import ProjectPaths
from aqven.server.mcp.preview_tools import PreviewTools
from aqven.server.mcp.processes import ProcessRunner, SubprocessRunner
from aqven.server.mcp.project_tools import LoaderProjectSource, ProjectSource, ProjectTools
from aqven.server.mcp.pyright_tool import PyrightTool
from aqven.server.mcp.pytest_tool import PytestTool
from aqven.server.mcp.run_tools import RunTools
from aqven.server.security import AccessPolicy, guard_request, reject

SERVER_NAME: Final = "aqven"
MCP_MOUNT: Final = "/mcp"
STREAMABLE_HTTP_PATH: Final = "/"
HTTP_SCOPE: Final = "http"
UNAUTHORIZED_MESSAGE: Final = "MCP requires Authorization: Bearer <token from .aqven/server.json>"
INSTRUCTIONS: Final = (
    "AQVEN: flow definitions are project files. Edit prompt text and make point edits with your own Read/Edit/Write; "
    "make structural and cross-file edits with flow_patch using expects from flow_get. After every edit call "
    "aqven_check, and for code also pyright_check and pytest_run; after a prompt edit also prompt_preview. "
    "Run: run_start, then run_get and run_events; "
    "waits for a human answer: run_list(status=suspended), run_get_node, run_resume."
)


@dataclass(frozen=True, slots=True)
class McpPorts:
    paths: ProjectPaths
    runner: ProcessRunner = field(default_factory=SubprocessRunner)
    python: str = sys.executable
    project: ProjectSource | None = None
    engine: EngineFacade | None = None
    patch_flow: PatchFlow | None = None


def build_catalog(ports: McpPorts) -> tuple[ToolRegistration, ...]:
    source = ports.project if ports.project is not None else LoaderProjectSource(ports.paths.module)
    settings = RunnerSettings(paths=ports.paths, runner=ports.runner, python=ports.python)
    runs = RunTools(ports.engine).operations() if ports.engine is not None else ()
    patch = PatchTools(ports.patch_flow).operations() if ports.patch_flow is not None else ()
    return (
        *ProjectTools(source).operations(),
        *PreviewTools(source).operations(),
        *AqvenCheckTool(settings).operations(),
        *PyrightTool(settings).operations(),
        *PytestTool(settings).operations(),
        *runs,
        *patch,
    )


def build_mcp_server(catalog: Iterable[ToolRegistration]) -> MCPServer:
    server = MCPServer(SERVER_NAME, instructions=INSTRUCTIONS)
    for registration in catalog:
        registration.register_tool(server)
    return server


def guarded(app: ASGIApp, policy: AccessPolicy | None) -> ASGIApp:
    return app if policy is None else BearerGuard(app, policy)


@dataclass(frozen=True, slots=True)
class BearerGuard:
    app: ASGIApp
    policy: AccessPolicy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != HTTP_SCOPE or self.policy.token_matches(guard_request(scope).bearer()):
            await self.app(scope, receive, send)
            return
        await reject("UNAUTHORIZED", UNAUTHORIZED_MESSAGE)(scope, receive, send)


@dataclass(frozen=True, slots=True)
class McpEndpoint:
    server: MCPServer
    app: ASGIApp

    def lifespan(self, application: Starlette | None = None) -> AbstractAsyncContextManager[None]:
        return self.server.session_manager.run()

    def mounts(self) -> Mapping[str, ASGIApp]:
        return {MCP_MOUNT: self.app}

    def mount(self, application: Starlette) -> None:
        application.mount(MCP_MOUNT, self.app)


def build_mcp_endpoint(
    catalog: Iterable[ToolRegistration],
    policy: AccessPolicy | None,
    transport_security: TransportSecuritySettings | None = None,
) -> McpEndpoint:
    server = build_mcp_server(catalog)
    transport = server.streamable_http_app(
        streamable_http_path=STREAMABLE_HTTP_PATH,
        transport_security=transport_security,
    )
    return McpEndpoint(server=server, app=guarded(transport, policy))
