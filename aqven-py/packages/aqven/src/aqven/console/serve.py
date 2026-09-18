import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from aqven.app.composition import StudioFeatures, studio_server
from aqven.app.environment import RuntimeSettings
from aqven.app.options import ServerOptions

EXIT_OK: Final = 0


@dataclass(frozen=True, slots=True)
class ServeMode:
    defaults: RuntimeSettings
    watch: bool = True


STUDIO_MODE: Final = ServeMode(defaults=RuntimeSettings(open_browser=True))
SERVE_MODE: Final = ServeMode(defaults=RuntimeSettings(open_browser=False))
SERVE_MODES: Final[Mapping[str, ServeMode]] = {"studio": STUDIO_MODE, "serve": SERVE_MODE}


def serve(mode: ServeMode, options: ServerOptions) -> int:
    server = studio_server(features=StudioFeatures(watch=mode.watch))
    asyncio.run(server.serve(options))
    return EXIT_OK
