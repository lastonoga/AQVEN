import sys
import webbrowser
from typing import Final

import uvicorn

from lumen.app import ACCESS, SETTINGS, app, studio_url

EXIT_OK: Final = 0


def serve() -> int:
    print(f"lumen: {studio_url()} (MCP http://{SETTINGS.host}:{SETTINGS.port}/mcp/)", file=sys.stderr, flush=True)
    if SETTINGS.open_browser:
        webbrowser.open(studio_url(ACCESS.token), new=2)
    uvicorn.run(app, host=SETTINGS.host, port=SETTINGS.port, log_level="warning")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(serve())
