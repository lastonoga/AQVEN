from collections.abc import Mapping
from importlib import import_module
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from aqven.app import (
        AppAccess,
        LocalAppOptions,
        LocalTokenAccess,
        RuntimeSettings,
        create_local_app,
        create_mcp_server,
        load_project_env,
        local_app_lifespan,
        runtime_settings,
    )
    from aqven.check import CheckReport, check_project
    from aqven.client import AqvenClient
    from aqven.runtime import (
        CancelRequest,
        ExecutionAddress,
        FlowHandle,
        HumanWait,
        HumanWaitDetail,
        Project,
        ProjectInvalid,
        ResumeRequest,
        ResumeResult,
        Run,
        RunContext,
        RunEvent,
        RunId,
        RunOptions,
        RunResult,
        node_address,
    )
    from aqven.server import ServerOptions, create_app, export_openapi, openapi_text

__all__ = [
    "AppAccess",
    "AqvenClient",
    "CancelRequest",
    "CheckReport",
    "ExecutionAddress",
    "FlowHandle",
    "HumanWait",
    "HumanWaitDetail",
    "LocalAppOptions",
    "LocalTokenAccess",
    "Project",
    "ProjectInvalid",
    "ResumeRequest",
    "ResumeResult",
    "Run",
    "RunContext",
    "RunEvent",
    "RunId",
    "RunOptions",
    "RunResult",
    "RuntimeSettings",
    "ServerOptions",
    "check_project",
    "create_app",
    "create_local_app",
    "create_mcp_server",
    "export_openapi",
    "load_project_env",
    "local_app_lifespan",
    "node_address",
    "openapi_text",
    "runtime_settings",
]

PUBLIC_MODULES: Final[Mapping[str, str]] = {
    "AppAccess": "aqven.app",
    "AqvenClient": "aqven.client",
    "CancelRequest": "aqven.runtime",
    "CheckReport": "aqven.check",
    "ExecutionAddress": "aqven.runtime",
    "FlowHandle": "aqven.runtime",
    "HumanWait": "aqven.runtime",
    "HumanWaitDetail": "aqven.runtime",
    "LocalAppOptions": "aqven.app",
    "LocalTokenAccess": "aqven.app",
    "Project": "aqven.runtime",
    "ProjectInvalid": "aqven.runtime",
    "ResumeRequest": "aqven.runtime",
    "ResumeResult": "aqven.runtime",
    "Run": "aqven.runtime",
    "RunContext": "aqven.runtime",
    "RunEvent": "aqven.runtime",
    "RunId": "aqven.runtime",
    "RunOptions": "aqven.runtime",
    "RunResult": "aqven.runtime",
    "RuntimeSettings": "aqven.app",
    "ServerOptions": "aqven.server",
    "check_project": "aqven.check",
    "create_app": "aqven.server",
    "create_local_app": "aqven.app",
    "create_mcp_server": "aqven.app",
    "export_openapi": "aqven.server",
    "load_project_env": "aqven.app",
    "local_app_lifespan": "aqven.app",
    "node_address": "aqven.runtime",
    "openapi_text": "aqven.server",
    "runtime_settings": "aqven.app",
}


def __getattr__(name: str) -> object:
    module = PUBLIC_MODULES.get(name)
    if module is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    return getattr(import_module(module), name)


def __dir__() -> list[str]:
    return sorted(__all__)
