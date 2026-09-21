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
from aqven.server.mcp.eval_tools import EvalTools
from aqven.server.mcp.patch_tools import PatchFlow, PatchTools
from aqven.server.mcp.paths import ProjectPaths
from aqven.server.mcp.preview_tools import PreviewTools
from aqven.server.mcp.processes import ProcessRunner, SubprocessRunner
from aqven.server.mcp.project_source import LoaderProjectSource, ProjectSource
from aqven.server.mcp.pyright_tool import PyrightTool
from aqven.server.mcp.pytest_tool import PytestTool
from aqven.server.mcp.run_tools import RunTools
from aqven.server.security import AccessPolicy, guard_request, reject
from aqven.server.views.runs import RunStartService
from aqven.server.views.services import StudioServices

SERVER_NAME: Final = "aqven"
MCP_MOUNT: Final = "/mcp"
STREAMABLE_HTTP_PATH: Final = "/"
HTTP_SCOPE: Final = "http"
UNAUTHORIZED_MESSAGE: Final = "MCP requires Authorization: Bearer <token from .aqven/server.json>"
INSTRUCTIONS: Final = (
    "AQVEN drives an open Studio project: flow definitions are files in the project, so read them with your own "
    "Read/Grep/Glob and make prompt and point edits with your own Edit/Write. These tools are the actions the files "
    "cannot do. Structural and cross-file edits: flow_patch. After every edit: aqven_check, for code also "
    "pyright_check and pytest_run, after a prompt edit also prompt_preview. Runs: run_start, then run_get and "
    "run_events; a run waiting for a human: run_list(status=suspended), run_get_node, run_resume; also run_fork and "
    "run_cancel. Datasets and evals: dataset_batch_start with dataset_batch_get, eval_run_start with eval_run_get "
    "and eval_gate."
)


@dataclass(frozen=True, slots=True)
class McpPorts:
    paths: ProjectPaths
    runner: ProcessRunner = field(default_factory=SubprocessRunner)
    python: str = sys.executable
    project: ProjectSource | None = None
    engine: EngineFacade | None = None
    patch_flow: PatchFlow | None = None
    starting: RunStartService | None = None
    services: StudioServices | None = None


def build_catalog(ports: McpPorts) -> tuple[ToolRegistration, ...]:
    source = ports.project if ports.project is not None else LoaderProjectSource(ports.paths.module)
    settings = RunnerSettings(paths=ports.paths, runner=ports.runner, python=ports.python)
    runs = RunTools(ports.engine, ports.starting).operations() if ports.engine is not None else ()
    patch = PatchTools(ports.patch_flow).operations() if ports.patch_flow is not None else ()
    evals = EvalTools(ports.services).operations() if ports.services is not None else ()
    return (
        *PreviewTools(source).operations(),
        *AqvenCheckTool(settings).operations(),
        *PyrightTool(settings).operations(),
        *PytestTool(settings).operations(),
        *runs,
        *patch,
        *evals,
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
