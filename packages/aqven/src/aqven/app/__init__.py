from collections.abc import Mapping
from importlib import import_module
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from aqven.app.composition import ServerApplicationFactory, StudioFeatures, studio_server
    from aqven.app.dotenv_secrets import load_project_env
    from aqven.app.environment import (
        AQVEN_HOST,
        AQVEN_OPEN_BROWSER,
        AQVEN_PORT,
        AQVEN_STUDIO,
        DEFAULT_PORT,
        LOOPBACK_HOST,
        InvalidRuntimeSetting,
        RuntimeSettings,
        runtime_settings,
    )
    from aqven.app.local_app import (
        AppAccess,
        DeferredEngine,
        LocalAppOptions,
        LocalTokenAccess,
        create_local_app,
        create_mcp_server,
        local_app_lifespan,
    )
    from aqven.app.options import ServerOptions

__all__ = [
    "AQVEN_HOST",
    "AQVEN_OPEN_BROWSER",
    "AQVEN_PORT",
    "AQVEN_STUDIO",
    "DEFAULT_PORT",
    "LOOPBACK_HOST",
    "AppAccess",
    "DeferredEngine",
    "InvalidRuntimeSetting",
    "LocalAppOptions",
    "LocalTokenAccess",
    "RuntimeSettings",
    "ServerApplicationFactory",
    "ServerOptions",
    "StudioFeatures",
    "create_local_app",
    "create_mcp_server",
    "load_project_env",
    "local_app_lifespan",
    "runtime_settings",
    "studio_server",
]

PUBLIC_MODULES: Final[Mapping[str, str]] = {
    "AQVEN_HOST": "aqven.app.environment",
    "AQVEN_OPEN_BROWSER": "aqven.app.environment",
    "AQVEN_PORT": "aqven.app.environment",
    "AQVEN_STUDIO": "aqven.app.environment",
    "DEFAULT_PORT": "aqven.app.environment",
    "LOOPBACK_HOST": "aqven.app.environment",
    "AppAccess": "aqven.app.local_app",
    "DeferredEngine": "aqven.app.local_app",
    "InvalidRuntimeSetting": "aqven.app.environment",
    "LocalAppOptions": "aqven.app.local_app",
    "LocalTokenAccess": "aqven.app.local_app",
    "RuntimeSettings": "aqven.app.environment",
    "ServerApplicationFactory": "aqven.app.composition",
    "ServerOptions": "aqven.app.options",
    "StudioFeatures": "aqven.app.composition",
    "create_local_app": "aqven.app.local_app",
    "create_mcp_server": "aqven.app.local_app",
    "load_project_env": "aqven.app.dotenv_secrets",
    "local_app_lifespan": "aqven.app.local_app",
    "runtime_settings": "aqven.app.environment",
    "studio_server": "aqven.app.composition",
}


def __getattr__(name: str) -> object:
    module = PUBLIC_MODULES.get(name)
    if module is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    return getattr(import_module(module), name)


def __dir__() -> list[str]:
    return sorted(__all__)
