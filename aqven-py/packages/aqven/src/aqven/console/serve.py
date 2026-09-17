import asyncio
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Final

from aqven.app.composition import StudioFeatures, studio_server
from aqven.app.options import ServerOptions

EXIT_OK: Final = 0


@dataclass(frozen=True, slots=True)
class ServeMode:
    opens_browser: bool
    watch: bool = True

    def options(self, base: ServerOptions) -> ServerOptions:
        return replace(base, open_browser=base.open_browser and self.opens_browser)


STUDIO_MODE: Final = ServeMode(opens_browser=True)
SERVE_MODE: Final = ServeMode(opens_browser=False)
SERVE_MODES: Final[Mapping[str, ServeMode]] = {"studio": STUDIO_MODE, "serve": SERVE_MODE}


def serve(mode: ServeMode, base: ServerOptions) -> int:
    server = studio_server(features=StudioFeatures(watch=mode.watch))
    asyncio.run(server.serve(mode.options(base)))
    return EXIT_OK
