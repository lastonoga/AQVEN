import asyncio
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Final

from aqven.app.composition import StudioFeatures, studio_server
from aqven.app.console_log.dev_console import DevConsoleObserver
from aqven.app.console_log.install import dev_console_setup, install_console
from aqven.app.console_log.levels import LevelProfile
from aqven.app.environment import RuntimeSettings
from aqven.app.options import ServerOptions
from aqven.app.runtime import LocalServer, UvicornLogging

EXIT_OK: Final = 0


@dataclass(frozen=True, slots=True)
class ServeMode:
    defaults: RuntimeSettings
    watch: bool = True


STUDIO_MODE: Final = ServeMode(defaults=RuntimeSettings(open_browser=True))
SERVE_MODE: Final = ServeMode(defaults=RuntimeSettings(open_browser=False))
SERVE_MODES: Final[Mapping[str, ServeMode]] = {"studio": STUDIO_MODE, "serve": SERVE_MODE}


def with_dev_console(server: LocalServer, profile: LevelProfile) -> LocalServer:
    return replace(
        server,
        uvicorn_logging=UvicornLogging(level=profile.uvicorn, access_log=profile.access_log),
        observer=DevConsoleObserver(),
    )


def serve(mode: ServeMode, options: ServerOptions) -> int:
    with install_console(dev_console_setup(options.root, options.console_level)) as console:
        server = with_dev_console(studio_server(features=StudioFeatures(watch=mode.watch)), console.profile)
        asyncio.run(server.serve(options))
    return EXIT_OK
